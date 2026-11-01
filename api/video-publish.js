import { head, put } from '@vercel/blob';
import { readBody, safeName, send, validJobId, verifyGitHubActionsRequest, publicError } from '../lib/kidas-server.js';

const MAX_VIDEO_BYTES = 500 * 1000 * 1000;
const MAX_THUMBNAIL_BYTES = 60 * 1024;
const SHARE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Cette action n’est pas autorisée.' });
  const { id, run_id: runId, name } = readBody(req);
  if (!validJobId(id) || !/^\\d{1,20}$/.test(String(runId || ''))) {
    return send(res, 400, { error: 'Publication vidéo non reconnue.' });
  }

  try {
    await verifyGitHubActionsRequest(req, runId);
    const video = await head(`videos/${id}.mp4`);
    const thumbnail = await head(`videos/${id}.jpg`);
    if (!video || video.size < 1 || video.size > MAX_VIDEO_BYTES ||
        video.contentType !== 'video/mp4') {
      return send(res, 422, { error: 'Le fichier MP4 publié est invalide.' });
    }
    if (!thumbnail || thumbnail.size < 1 || thumbnail.size > MAX_THUMBNAIL_BYTES ||
        thumbnail.contentType !== 'image/jpeg') {
      return send(res, 422, { error: 'La miniature publiée est invalide.' });
    }

    const createdAt = new Date().toISOString();
    const metadata = {
      id,
      name: safeName(name),
      created_at: createdAt,
      expires_at: new Date(Date.now() + SHARE_TTL_MS).toISOString(),
      size: video.size,
      content_type: 'video/mp4'
    };
    await put(`video-meta/${id}.json`, JSON.stringify(metadata), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: 'application/json; charset=utf-8',
      cacheControlMaxAge: 60
    });
    return send(res, 200, {
      ...metadata,
      download_url: `/d/${id}`,
      thumbnail_url: `/api/video-thumbnail?id=${id}`
    });
  } catch (error) {
    const result = publicError(error);
    return send(res, result.status, result.body);
  }
}
