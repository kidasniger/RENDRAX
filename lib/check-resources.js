import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { readBody, sameOrigin, send } from './kidas-server.js';

const MAX_URLS = 20;
const MAX_URL_LENGTH = 2048;
const TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 3;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30;
const rateBuckets = new Map();

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function isPublicIPv4(address) {
  if (isIP(address) !== 4) return false;
  const [a, b, c] = address.split('.').map(Number);
  return !(
    a === 0 || a === 10 || a === 127 || a >= 224 ||
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
  );
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
  if (parts.length !== 8 || parts.some(part => !/^[0-9a-f]{1,4}$/.test(part))) return null;
  return parts.map(part => Number.parseInt(part, 16));
}

function isPublicIPv6(address) {
  if (isIP(address) !== 6) return false;
  const words = ipv6Words(address);
  if (!words || words[0] < 0x2000 || words[0] > 0x3fff) return false;
  if (
    (words[0] === 0x2001 && words[1] <= 0x01ff) ||
    (words[0] === 0x2001 && words[1] === 0x0db8) ||
    words[0] === 0x2002 ||
    (words[0] === 0x3fff && words[1] <= 0x0fff)
  ) return false;
  return true;
}

function isPublicAddress(address) {
  const family = isIP(address);
  if (family === 4) return isPublicIPv4(address);
  if (family === 6) return isPublicIPv6(address);
  return false;
}

function parseUrl(raw) {
  if (typeof raw !== 'string' || !raw.trim() || raw.length > MAX_URL_LENGTH) {
    throw httpError(400, 'URL invalide ou trop longue.');
  }
  if (/[\\\u0000-\u001f]/.test(raw)) throw httpError(400, 'URL contenant des caractères interdits.');
  let url;
  try { url = new URL(raw.trim()); } catch { throw httpError(400, 'URL invalide.'); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw httpError(400, 'Seules les URL HTTP et HTTPS sont acceptées.');
  }
  if (url.username || url.password) throw httpError(400, 'Les URL avec identifiants sont refusées.');
  if (url.port && !((url.protocol === 'http:' && url.port === '80') || (url.protocol === 'https:' && url.port === '443'))) {
    throw httpError(400, 'Seuls les ports HTTP/HTTPS standards sont acceptés.');
  }
  url.hash = '';
  return url;
}

async function resolvePublicAddresses(hostname) {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost') ||
      host.endsWith('.local') || host.endsWith('.internal')) {
    throw httpError(403, 'Adresse locale ou privée refusée.');
  }

  if (isIP(host)) {
    if (!isPublicAddress(host)) throw httpError(403, 'Adresse IP locale ou non publique refusée.');
    return [{ address: host, family: isIP(host) }];
  }

  let records;
  try { records = await dnsLookup(host, { all: true, verbatim: true }); }
  catch { throw httpError(502, 'Impossible de résoudre le domaine distant.'); }

  if (!records.length || records.some(record => !isPublicAddress(record.address))) {
    throw httpError(403, 'Le domaine pointe vers une adresse IP locale ou non publique.');
  }
  return records.map(({ address, family }) => ({ address, family }));
}

function requestHead(url, addresses) {
  return new Promise(resolve => {
    const transport = url.protocol === 'https:' ? https : http;
    const pinnedLookup = (_hostname, options, callback) => {
      if (options && typeof options === 'object' && options.all) callback(null, addresses);
      else callback(null, addresses[0].address, addresses[0].family);
    };
    let settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const request = transport.request(url, {
      method: 'HEAD',
      agent: false,
      lookup: pinnedLookup,
      maxHeaderSize: 16 * 1024,
      headers: { 'User-Agent': 'RENDRAX-Resource-Check/1.0', Accept: '*/*' }
    }, response => {
      response.resume();
      finish({ status: Number(response.statusCode) || 0, location: response.headers.location || null });
    });
    const timer = setTimeout(() => {
      request.destroy();
      finish({ status: 0, error: 'Délai de 5 secondes dépassé.' });
    }, TIMEOUT_MS);
    timer.unref?.();
    request.once('error', () => finish({ status: 0, error: 'Ressource inaccessible.' }));
    request.end();
  });
}

async function checkOne(raw) {
  let url;
  try { url = parseUrl(raw); }
  catch (error) { return { url: String(raw).slice(0, MAX_URL_LENGTH), ok: false, status: 0, error: error.message }; }

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    try {
      const addresses = await resolvePublicAddresses(url.hostname);
      const result = await requestHead(url, addresses);
      if (result.location && [301, 302, 303, 307, 308].includes(result.status)) {
        if (redirect === MAX_REDIRECTS) return { url: raw, ok: false, status: result.status, error: 'Trop de redirections.' };
        try { url = parseUrl(new URL(result.location, url).href); }
        catch (error) { return { url: raw, ok: false, status: result.status, error: error.message }; }
        continue;
      }
      return {
        url: raw,
        ok: result.status >= 200 && result.status < 400,
        status: result.status,
        ...(result.error ? { error: result.error } : {})
      };
    } catch (error) {
      return { url: raw, ok: false, status: Number(error.status) || 0, error: error.message || 'Ressource inaccessible.' };
    }
  }
  return { url: raw, ok: false, status: 0, error: 'Ressource inaccessible.' };
}

function allowRate(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const key = forwarded || String(req.headers['x-real-ip'] || 'unknown');
  const now = Date.now();
  const current = rateBuckets.get(key);
  if (!current || now - current.start >= RATE_WINDOW_MS) {
    rateBuckets.set(key, { start: now, count: 1 });
    if (rateBuckets.size > 2000) {
      for (const [ip, bucket] of rateBuckets) {
        if (now - bucket.start >= RATE_WINDOW_MS) rateBuckets.delete(ip);
      }
    }
    return true;
  }
  if (current.count >= RATE_MAX) return false;
  current.count += 1;
  return true;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Méthode non autorisée.' });
  if (!sameOrigin(req)) return send(res, 403, { error: 'Origine de la demande refusée.' });
  if (!allowRate(req)) return send(res, 429, { error: 'Trop de vérifications. Réessaie dans une minute.' });

  const { urls } = readBody(req);
  if (!Array.isArray(urls) || urls.length > MAX_URLS) {
    return send(res, 400, { error: 'Envoie une liste de 1 à 20 URL maximum.' });
  }
  if (urls.some(url => typeof url !== 'string' || url.length > MAX_URL_LENGTH)) {
    return send(res, 400, { error: 'Une ou plusieurs URL sont invalides.' });
  }

  const results = await Promise.all(urls.map(checkOne));
  return send(res, 200, { results });
}
