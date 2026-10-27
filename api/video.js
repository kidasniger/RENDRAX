import { head, issueSignedToken, presignUrl } from '@vercel/blob';
import {
  send, validJobId, validOwnerToken, verifyOwnerToken, publicError
} from '../lib/kidas-server.js';

const MIME = { mp4: 'video/mp4', png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' };
const URL_TTL_MS = 5 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'Méthode non autorisée.' });
  const id = String(req.query?.id || '');
  const ownerToken = String(req.query?.ownerToken || '');
  if (!validJobId(id) || !validOwnerToken(ownerToken)) {
    return send(res, 400, { error: 'Identifiant ou clé privée invalide.' });
  }
  try {
    const owner = await verifyOwnerToken(id, ownerToken);
    if (!owner) return send(res, 403, { error: 'Accès refusé à ce fichier privé.' });
    const output = String(owner.output || 'mp4');
    const contentType = MIME[output];
    if (!contentType) return send(res, 404, { error: 'Fichier privé introuvable.' });
    const pathname = `outputs/${id}.${output}`;
    await head(pathname);
    const validUntil = Date.now() + URL_TTL_MS;
    const token = await issueSignedToken({ pathname, operations: ['get'], validUntil });
    const signed = await presignUrl(token, { pathname, operation: 'get', access: 'private', validUntil });
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.statusCode = 302;
    res.setHeader('Location', signed.presignedUrl);
    return res.end();
  } catch (error) {
    if (Number(error?.status || error?.statusCode) === 404) {
      return send(res, 404, { error: 'Fichier privé introuvable.' });
    }
    const result = publicError(error);
    return send(res, result.status, result.body);
  }
}
