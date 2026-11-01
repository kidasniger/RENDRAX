import { b2Delete, b2GetJson, isB2NotFound } from '../lib/b2-storage.js';
import { readBody, sameOrigin, send, validJobId, publicError } from '../lib/kidas-server.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Cette action n’est pas autorisée.' });
  if (!sameOrigin(req)) return send(res, 403, { error: 'Cette demande a été refusée pour des raisons de sécurité.' });

  const { id } = readBody(req);
  if (!validJobId(id)) return send(res, 400, { error: 'La vidéo ou son identifiant n’est pas reconnu.' });

  try {
    let record;
    try {
      record = await b2GetJson(`video-meta/${id}.json`);
    } catch (error) {
      if (isB2NotFound(error)) {
        return send(res, 404, { error: 'Cette vidéo n’existe plus ou a déjà été supprimée.' });
      }
      throw error;
    }
    if (record.id !== id) return send(res, 404, { error: 'Cette vidéo n’existe pas.' });

    // Remove the published assets, metadata, original upload (HTML or ZIP),
    // and the progress record associated with this render.
    await b2Delete([
      `videos/${id}.mp4`,
      `videos/${id}.jpg`,
      `video-meta/${id}.json`,
      `incoming/${id}.html`,
      `incoming/${id}.zip`,
      `progress/${id}.json`
    ]);

    return send(res, 200, { success: true, deleted: true });
  } catch (error) {
    const result = publicError(error);
    return send(res, result.status, result.body);
  }
}
