import { issueSignedToken, presignUrl } from '@vercel/blob';
import { readBody, send, validJobId, verifyGitHubActionsRequest, publicError } from '../lib/kidas-server.js';

const MAX_VIDEO_BYTES = 500 * 1000 * 1000;
const MAX_THUMBNAIL_BYTES = 60 * 1024;

async function signedPut(pathname, contentType, maximumSizeInBytes) {
  const validUntil = Date.now() + 10 * 60 * 1000;
  const token = await issueSignedToken({
    pathname,
    operations: ['put'],
    allowedContentTypes: [contentType],
    maximumSizeInBytes,
    validUntil
  });
  const result = await presignUrl(token, {
    operation: 'put',
    pathname,
    access: 'private',
    allowedContentTypes: [contentType],
    maximumSizeInBytes,
    validUntil,
    addRandomSuffix: false,
    allowOverwrite: false
  });
  return result.presignedUrl;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Cette action n’est pas autorisée.' });
  const { id, run_id: runId } = readBody(req);
  if (!validJobId(id) || !/^\d{1,20}$/.test(String(runId || ''))) {
    return send(res, 400, { error: 'Publication vidéo non reconnue.' });
  }

  try {
    await verifyGitHubActionsRequest(req, runId);
    const [videoUrl, thumbnailUrl] = await Promise.all([
      signedPut(`videos/${id}.mp4`, 'video/mp4', MAX_VIDEO_BYTES),
      signedPut(`videos/${id}.jpg`, 'image/jpeg', MAX_THUMBNAIL_BYTES)
    ]);
    return send(res, 200, { videoUrl, thumbnailUrl });
  } catch (error) {
    const result = publicError(error);
    return send(res, result.status, result.body);
  }
}
