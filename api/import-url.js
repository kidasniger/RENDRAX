import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import https from 'node:https';
import { put } from '@vercel/blob';
import {
  readBody,
  sameOrigin,
  send,
  validJobId,
  verifyTurnstile,
  publicError
} from '../lib/kidas-server.js';

const MAX_BYTES = 50 * 1000 * 1000;
const MAX_URL_LENGTH = 2048;
const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 20_000;
const HTML_EXTENSION = /\.html?$/i;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function isPublicIPv4(address) {
  if (isIP(address) !== 4) return false;

  const [a, b, c] = address.split('.').map(Number);

  if (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a === 255
  ) {
    return false;
  }

  return true;
}

function ipv6Words(address) {
  let value = address.toLowerCase();

  if (value.includes('%')) return null;

  if (value.includes('.')) {
    const lastColon = value.lastIndexOf(':');
    if (lastColon < 0) return null;

    const ipv4 = value.slice(lastColon + 1);
    if (isIP(ipv4) !== 4) return null;

    const octets = ipv4.split('.').map(Number);
    const first = ((octets[0] << 8) | octets[1]).toString(16);
    const second = ((octets[2] << 8) | octets[3]).toString(16);
    value = value.slice(0, lastColon + 1) + first + ':' + second;
  }

  const compressionAt = value.indexOf('::');
  if (compressionAt !== value.lastIndexOf('::')) return null;

  const compressed = compressionAt !== -1;
  const sides = compressed ? value.split('::') : [value, ''];
  const left = sides[0] ? sides[0].split(':') : [];
  const right = sides[1] ? sides[1].split(':') : [];

  if (!compressed && left.length !== 8) return null;

  const missing = 8 - left.length - right.length;
  if ((compressed && missing < 1) || (!compressed && missing !== 0)) return null;

  const parts = [...left, ...Array(missing).fill('0'), ...right];
  if (parts.length !== 8 || parts.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) {
    return null;
  }

  return parts.map((part) => Number.parseInt(part, 16));
}

function isPublicIPv6(address) {
  if (isIP(address) !== 6) return false;

  const words = ipv6Words(address);
  if (!words) return false;

  // Only global-unicast space (2000::/3) is eligible.
  if (words[0] < 0x2000 || words[0] > 0x3fff) return false;

  // Exclude special-purpose, documentation and transition ranges.
  if (
    (words[0] === 0x2001 && words[1] <= 0x01ff) ||
    (words[0] === 0x2001 && words[1] === 0x0db8) ||
    words[0] === 0x2002 ||
    (words[0] === 0x3fff && words[1] <= 0x0fff)
  ) {
    return false;
  }

  return true;
}

function isPublicAddress(address) {
  const family = isIP(address);
  if (family === 4) return isPublicIPv4(address);
  if (family === 6) return isPublicIPv6(address);
  return false;
}

function validateUrl(url) {
  if (url.protocol !== 'https:') {
    throw httpError(400, 'Seules les URL HTTPS sont acceptées.');
  }

  if (url.username || url.password) {
    throw httpError(400, 'Les URL contenant un identifiant ou un mot de passe sont refusées.');
  }

  if (url.port && url.port !== '443') {
    throw httpError(400, 'Seules les connexions HTTPS standard sur le port 443 sont acceptées.');
  }

  url.hash = '';

  if (url.hostname.endsWith('.')) {
    url.hostname = url.hostname.slice(0, -1);
  }

  return normalizeGitHubUrl(url);
}

function normalizeGitHubUrl(url) {
  const hostname = url.hostname.toLowerCase();

  if (hostname === 'github.com' || hostname === 'www.github.com') {
    const match = url.pathname.match(/^\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/);

    if (match) {
      const [, owner, repository, branch, filePath] = match;
      url.hostname = 'raw.githubusercontent.com';
      url.pathname = '/' + owner + '/' + repository + '/' + branch + '/' + filePath;
      url.search = '';
    }
  }

  if (hostname === 'gist.github.com' || hostname === 'www.gist.github.com') {
    const fileName = url.searchParams.get('file');
    if (!/\/raw(?:\/|$)/i.test(url.pathname)) {
      url.pathname = url.pathname.replace(/\/+$/, '') + '/raw/' +
        (fileName ? fileName.split('/').map(encodeURIComponent).join('/') : '');
    }

    url.hostname = 'gist.githubusercontent.com';
    url.search = '';
  }

  return url;
}

function parseSourceUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0 || rawUrl.length > MAX_URL_LENGTH) {
    throw httpError(400, 'Colle une URL HTTPS valide de 2 048 caractères maximum.');
  }

  if (/[\\\u0000-\u001f]/.test(rawUrl)) {
    throw httpError(400, 'L’URL contient des caractères non autorisés.');
  }

  let url;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw httpError(400, 'L’adresse URL est invalide.');
  }

  return validateUrl(url);
}

function hasHtmlExtension(url) {
  let pathname = url.pathname;
  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    // The encoded path still undergoes the ordinary extension check.
  }
  return HTML_EXTENSION.test(pathname);
}

function withDeadline(promise, deadline, message) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) return Promise.reject(httpError(504, message));

  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(httpError(504, message)), remaining);
    timer.unref?.();
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function resolvePublicAddresses(hostname, deadline) {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();

  if (
    !host ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    throw httpError(403, 'Cette URL pointe vers un nom de réseau local ou privé.');
  }

  if (isIP(host)) {
    if (!isPublicAddress(host)) {
      throw httpError(403, 'Cette URL pointe vers une adresse IP locale ou non publique.');
    }
    return [{ address: host, family: isIP(host) }];
  }

  let records;
  try {
    records = await withDeadline(
      dnsLookup(host, { all: true, verbatim: true }),
      deadline,
      'La résolution DNS a dépassé le délai autorisé.'
    );
  } catch (error) {
    if (error?.status) throw error;
    throw httpError(400, 'Le domaine de cette URL est invalide ou inaccessible.');
  }

  if (!Array.isArray(records) || records.length === 0) {
    throw httpError(400, 'Le domaine de cette URL ne possède aucune adresse IP utilisable.');
  }

  // Reject the host if any DNS answer is private or otherwise non-public.
  if (records.some((record) => !isPublicAddress(record.address))) {
    throw httpError(403, 'Cette URL pointe vers une adresse IP locale ou non publique.');
  }

  return records.map(({ address, family }) => ({ address, family }));
}

function requestOnce(url, addresses, deadline) {
  return new Promise((resolve, reject) => {
    let responseReceived = false;
    let activeResponse = null;

    const pinnedLookup = (_hostname, options, callback) => {
      if (options && typeof options === 'object' && options.all) {
        callback(null, addresses);
        return;
      }

      callback(null, addresses[0].address, addresses[0].family);
    };

    const request = https.request(url, {
      method: 'GET',
      headers: {
        Accept: 'text/html, text/plain;q=0.9, application/octet-stream;q=0.8, */*;q=0.1',
        'Accept-Encoding': 'identity',
        'User-Agent': 'RENDRAX-URL-Import/1.0'
      },
      lookup: pinnedLookup,
      agent: false,
      maxHeaderSize: 16 * 1024
    }, (response) => {
      responseReceived = true;
      activeResponse = response;
      response.once('end', () => clearTimeout(timer));
      response.once('close', () => clearTimeout(timer));
      resolve({ request, response });
    });

    const remaining = Math.max(1, deadline - Date.now());
    const timer = setTimeout(() => {
      const error = httpError(504, 'Le téléchargement a dépassé la limite de 20 secondes.');
      if (activeResponse) activeResponse.destroy(error);
      request.destroy(error);
    }, remaining);
    timer.unref?.();

    request.once('close', () => {
      if (!responseReceived) clearTimeout(timer);
    });
    request.once('error', (error) => {
      if (!responseReceived) {
        clearTimeout(timer);
        if (error?.status) reject(error);
        else reject(httpError(502, 'Le serveur distant n’a pas pu être contacté.'));
      }
    });

    request.end();
  });
}

async function downloadHtml(rawUrl) {
  const deadline = Date.now() + FETCH_TIMEOUT_MS;
  const originalUrl = parseSourceUrl(rawUrl);
  let url = originalUrl;

  for (let redirects = 0; ; redirects += 1) {
    if (Date.now() >= deadline) {
      throw httpError(504, 'Le téléchargement a dépassé la limite de 20 secondes.');
    }

    const addresses = await resolvePublicAddresses(url.hostname, deadline);
    let result;

    try {
      result = await requestOnce(url, addresses, deadline);
    } catch (error) {
      if (error?.status) throw error;
      throw httpError(502, 'Le serveur distant n’a pas pu être contacté.');
    }

    const { request, response } = result;

    if (REDIRECT_STATUSES.has(response.statusCode)) {
      const location = response.headers.location;
      response.destroy();

      if (!location) {
        throw httpError(400, 'Le serveur distant a renvoyé une redirection invalide.');
      }

      if (redirects >= MAX_REDIRECTS) {
        throw httpError(400, 'Cette URL dépasse la limite de 3 redirections.');
      }

      try {
        url = validateUrl(new URL(location, url));
      } catch (error) {
        if (error?.status) throw error;
        throw httpError(400, 'Le serveur distant a renvoyé une URL de redirection invalide.');
      }
      continue;
    }

    if (response.statusCode !== 200) {
      response.destroy();
      throw httpError(400, 'Le serveur distant n’a pas fourni le fichier demandé.');
    }

    const contentType = String(response.headers['content-type'] || '')
      .split(';')[0]
      .trim()
      .toLowerCase();
    const validHtmlType = contentType === 'text/html';
    const validHtmlExtension = hasHtmlExtension(originalUrl) || hasHtmlExtension(url);

    if (!validHtmlType && !validHtmlExtension) {
      response.destroy();
      throw httpError(415, 'Le lien doit pointer vers un fichier HTML ou renvoyer le type text/html.');
    }

    const contentEncoding = String(response.headers['content-encoding'] || '').toLowerCase();
    if (contentEncoding && contentEncoding !== 'identity') {
      response.destroy();
      throw httpError(415, 'Le serveur distant a envoyé un encodage non pris en charge.');
    }

    const contentLength = Number(response.headers['content-length']);
    if (Number.isFinite(contentLength) && contentLength > MAX_BYTES) {
      response.destroy();
      request.destroy();
      throw httpError(413, 'Le fichier dépasse la limite de 50 Mo.');
    }

    const chunks = [];
    let totalBytes = 0;

    try {
      for await (const chunk of response) {
        if (Date.now() >= deadline) {
          throw httpError(504, 'Le téléchargement a dépassé la limite de 20 secondes.');
        }

        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        totalBytes += buffer.length;

        if (totalBytes > MAX_BYTES) {
          const error = httpError(413, 'Le fichier dépasse la limite de 50 Mo.');
          response.destroy(error);
          request.destroy(error);
          throw error;
        }

        chunks.push(buffer);
      }
    } catch (error) {
      if (error?.status) throw error;
      if (Date.now() >= deadline) {
        throw httpError(504, 'Le téléchargement a dépassé la limite de 20 secondes.');
      }
      throw httpError(502, 'Le téléchargement du fichier distant a échoué.');
    }

    if (totalBytes < 1) {
      throw httpError(400, 'Le fichier HTML distant est vide.');
    }

    return {
      buffer: Buffer.concat(chunks, totalBytes),
      size: totalBytes
    };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return send(res, 405, { error: 'Méthode non autorisée.' });
  }

  if (!sameOrigin(req)) {
    return send(res, 403, { error: 'Origine de la demande refusée.' });
  }

  const { id, url, captchaToken } = readBody(req);

  if (!validJobId(id)) {
    return send(res, 400, { error: 'Identifiant temporaire invalide.' });
  }

  if (typeof url !== 'string' || url.trim().length === 0 || url.length > MAX_URL_LENGTH) {
    return send(res, 400, { error: 'Colle une URL HTTPS valide de 2 048 caractères maximum.' });
  }

  let stage = 'vérification anti-robot';

  try {
    await verifyTurnstile(req, captchaToken);

    if (!process.env.BLOB_STORE_ID) {
      throw httpError(503, 'Le stockage Blob privé doit être connecté au projet Vercel.');
    }

    stage = 'validation et téléchargement de l’URL';
    const downloaded = await downloadHtml(url);

    stage = 'enregistrement du HTML dans le stockage privé';
    await put('incoming/' + id + '.html', downloaded.buffer, {
      access: 'private',
      contentType: 'text/html',
      addRandomSuffix: false,
      allowOverwrite: true
    });

    return send(res, 200, { id, size: downloaded.size });
  } catch (error) {
    const status = Number(error?.status) || 500;
    console.error('[RENDRAX import-url]', {
      stage,
      name: error?.name || 'Error',
      status,
      code: error?.code || null
    });

    const result = publicError(error);
    return send(res, result.status, result.body);
  }
}
