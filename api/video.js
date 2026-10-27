import { get, issueSignedToken, presignUrl } from '@vercel/blob';
import { Readable } from 'node:stream';
import {
  readBody, sameOrigin, send, validJobId, validOwnerToken, verifyOwnerToken, publicError
} from '../lib/kidas-server.js';

const URL_TTL_MS = 15 * 60 * 1000;
const TYPES = {
  mp4: { contentType: 'video/mp4', extension: 'mp4' },
  png: { contentType: 'image/png', extension: 'png' },
  jpeg: { contentType: 'image/jpeg', extension: 'jpeg' },
  webp: { contentType: 'image/webp', extension: 'webp' }
};

function cookieName(id) {
  return 'rendrax_video_' + id;
}

function cookieValue(req, name) {
  const header = String(req.headers.cookie || '');
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return '';
}

export default async function handler(req, res) {
  if (req.method === 'POST') {
    if (!sameOrigin(req)) return send(res, 403, { error: 'Origine de la demande refusée.' });
    const body = readBody(req);
    const id = String(body.id || '');
    const ownerToken = String(body.ownerToken || '');
    if (!validJobId(id) || !validOwnerToken(ownerToken)) {
      return send(res, 400, { error: 'Identifiant ou clé privée invalide.' });
    }
    try {
      if (!await verifyOwnerToken(id, ownerToken)) {
        return send(res, 404, { error: 'Fichier introuvable ou accès refusé.' });
      }
      const secure = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https' ? '; Secure' : '';
      res.setHeader('Set-Cookie', cookieName(id) + '=' + ownerToken +
        '; Path=/api/video; Max-Age=900; HttpOnly; SameSite=Strict' + secure);
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('Referrer-Policy', 'no-referrer');
      const base = '/api/video?id=' + encodeURIComponent(id);
      return send(res, 200, { url: base, downloadUrl: base + '&download=1', expiresAt: Date.now() + URL_TTL_MS });
    } catch (error) {
      const result = publicError(error);
      return send(res, result.status, result.body);
    }
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, { error: 'Méthode non autorisée.' });
  }
  const id = String(req.query?.id || '');
  if (!validJobId(id)) return send(res, 400, { error: 'Identifiant de fichier invalide.' });
  const ownerToken = cookieValue(req, cookieName(id));
  if (!validOwnerToken(ownerToken)) return send(res, 403, { error: 'Session privée expirée. Ouvre le fichier depuis RENDRAX.' });

  try {
    const owner = await verifyOwnerToken(id, ownerToken);
    if (!owner) return send(res, 404, { error: 'Fichier introuvable ou accès expiré.' });
    const output = String(owner.output || 'mp4');
    const type = TYPES[output];
    if (!type || (req.query?.output && String(req.query.output) !== output)) {
      return send(res, 403, { error: 'Ce lien ne correspond pas au fichier autorisé.' });
    }
    const pathname = 'outputs/' + id + '.' + type.extension;
    const filename = String(owner.name || 'RENDRAX').replace(/[^A-Za-z0-9._-]/g, '_') + '.' + type.extension;

    if (req.query?.download === '1') {
      const result = await get(pathname, { access: 'private' });
      if (!result || result.statusCode !== 200 || !result.stream) {
        return send(res, 404, { error: 'Fichier introuvable ou déjà supprimé.' });
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', type.contentType);
      const contentLength = Number(result.blob?.size);
      if (Number.isFinite(contentLength) && contentLength > 0) res.setHeader('Content-Length', String(contentLength));
      res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
      if (req.method === 'HEAD') return res.end();
      const stream = Readable.fromWeb(result.stream);
      stream.on('error', error => {
        if (res.headersSent) res.destroy(error);
        else send(res, 502, { error: 'Impossible de lire le fichier privé.' });
      });
      return stream.pipe(res);
    }

    const validUntil = Date.now() + URL_TTL_MS;
    const token = await issueSignedToken({
      pathname,
      operations: ['get'],
      validUntil
    });
    const signed = await presignUrl(token, {
      pathname,
      operation: 'get',
      access: 'private',
      validUntil
    });
    res.statusCode = 302;
    res.setHeader('Location', signed.presignedUrl);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    return res.end();
  } catch (error) {
    const result = publicError(error);
    return send(res, result.status, result.body);
  }
}
