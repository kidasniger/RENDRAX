import { del, get } from '@vercel/blob';
import { readBody, sameOrigin, send, validJobId, publicError } from '../lib/kidas-server.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Cette action n’est pas autorisée.' });
  if (!sameOrigin(req)) return send(res, 403, { error: 'Cette demande a été refusée pour des raisons de sécurité.' });

  const { id } = readBody(req);
  if (!validJobId(id)) return send(res, 400, { error: 'La vidéo ou son identifiant n’est pas reconnu.' });

  try {
    const metadata = await get(`video-meta/${id}.json`, { access: 'private' });
    if (!metadata || metadata.statusCode !== 200) {
      return send(res, 404, { error: 'Cette vidéo n’existe plus ou a déjà été supprimée.' });
    }
    const record = await new Response(metadata.stream).json();
    if (record.id !== id) return send(res, 404, { error: 'Cette vidéo n’existe pas.' });

    await del([
      `videos/${id}.mp4`,
      `videos/${id}.jpg`,
      `video-meta/${id}.json`
    ]);
    return send(res, 200, { success: true, deleted: true });
  } catch (error) {
    const result = publicError(error);
    return send(res, result.status, result.body);
  }
}
