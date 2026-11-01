import { get, issueSignedToken, presignUrl } from '@vercel/blob';
import { send, validJobId, publicError } from '../lib/kidas-server.js';

const LINK_TTL_MS = 5 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Cette action n’est pas autorisée.' });
  const id = String(req.query?.id || '');
  if (!validJobId(id)) return send(res, 400, { error: 'Miniature invalide.' });
  try {
    const metadataResult = await get(`video-meta/${id}.json`, { access: 'private' });
    if (!metadataResult || metadataResult.statusCode !== 200) return send(res, 404, { error: 'Cette vidéo n’existe plus.' });
    const metadata = await new Response(metadataResult.stream).json();
    if (metadata.id !== id || !Number.isFinite(Date.parse(metadata.expires_at)) || Date.parse(metadata.expires_at) <= Date.now()) {
      return send(res, 410, { error: 'Cette vidéo a expiré.' });
    }
    const pathname = `videos/${id}.jpg`;
    const validUntil = Date.now() + LINK_TTL_MS;
    const token = await issueSignedToken({ pathname, operations: ['get'], validUntil });
    const signed = await presignUrl(token, { pathname, operation: 'get', access: 'private', validUntil });
    return res.redirect(302, signed.presignedUrl);
  } catch (error) {
    const result = publicError(error);
    return send(res, result.status, result.body);
  }
}
