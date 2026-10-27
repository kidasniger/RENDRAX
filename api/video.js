import { head, issueSignedToken, presignUrl } from '@vercel/blob';
import {
  readBody, sameOrigin, send, validJobId, validOwnerToken, verifyOwnerToken, publicError
} from '../lib/kidas-server.js';

const MIME = { mp4: 'video/mp4', png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' };
const URL_TTL_MS = 5 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Méthode non autorisée.' });
  if (!sameOrigin(req)) return send(res, 403, { error: 'Origine de la demande refusée.' });
  const body = readBody(req);
  const id = String(body.id || '');
  const ownerToken = String(body.ownerToken || '');
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
    return send(res, 200, { url: signed.presignedUrl, expiresAt: validUntil });
  } catch (error) {
    if (Number(error?.status || error?.statusCode) === 404) {
      return send(res, 404, { error: 'Fichier privé introuvable.' });
    }
    const result = publicError(error);
    return send(res, result.status, result.body);
  }
}
