import { del, get, issueSignedToken, presignUrl } from '@vercel/blob';
import { Readable } from 'node:stream';
import {
  send, validJobId, validOwnerToken, verifyOwnerToken, publicError
} from '../lib/kidas-server.js';

const URL_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, { error: 'Méthode non autorisée.' });
  }
  const id = String(req.query?.id || '');
  const ownerToken = String(req.query?.ownerToken || '');
  if (!validJobId(id) || !validOwnerToken(ownerToken)) {
    return send(res, 400, { error: 'Lien vidéo invalide.' });
  }

  try {
    const owner = await verifyOwnerToken(id, ownerToken);
    if (!owner) return send(res, 404, { error: 'Vidéo introuvable ou accès expiré.' });

    if (req.query?.download === '1') {
      const result = await get(`outputs/${id}.mp4`, { access: 'private' });
      if (!result || result.statusCode !== 200 || !result.stream) {
        return send(res, 404, { error: 'Vidéo introuvable ou déjà supprimée.' });
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Length', String(result.blob.size || ''));
      res.setHeader('Content-Disposition', `attachment; filename="${String(owner.name || 'RENDRAX').replace(/[^A-Za-z0-9._-]/g, '_')}.mp4"`);
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
      if (req.method === 'HEAD') return res.end();
      const stream = Readable.fromWeb(result.stream);
      stream.on('error', error => {
        if (res.headersSent) res.destroy(error);
        else send(res, 502, { error: 'Impossible de lire la vidéo privée.' });
      });
      return stream.pipe(res);
    }

    const pathname = `outputs/${id}.mp4`;
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
