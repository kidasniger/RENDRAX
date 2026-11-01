import { del, get, head, issueSignedToken, list, presignUrl, put } from '@vercel/blob';
import {
  readBody, safeName, send, validJobId, verifyGitHubActionsRequest,
  verifyGitHubActionsMaintenanceRequest, publicError
} from '../lib/kidas-server.js';

const MAX_VIDEO_BYTES = 500 * 1000 * 1000;
const MAX_THUMBNAIL_BYTES = 60 * 1024;
const SHARE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SIGNED_LINK_TTL_MS = 5 * 60 * 1000;
const MAX_CLEANUP_PER_RUN = 250;

async function signedPut(pathname, contentType, maximumSizeInBytes) {
  const validUntil = Date.now() + 10 * 60 * 1000;
  const token = await issueSignedToken({
    pathname, operations: ['put'], allowedContentTypes: [contentType],
    maximumSizeInBytes, validUntil
  });
  const signed = await presignUrl(token, {
    operation: 'put', pathname, access: 'private',
    allowedContentTypes: [contentType], maximumSizeInBytes,
    validUntil, addRandomSuffix: false, allowOverwrite: false
  });
  return signed.presignedUrl;
}

async function signedRead(req, res, id, extension) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Cette action n’est pas autorisée.' });
  if (!validJobId(id)) return send(res, 400, { error: 'Lien vidéo invalide.' });
  const metadataResult = await get(`video-meta/${id}.json`, { access: 'private' });
  if (!metadataResult || metadataResult.statusCode !== 200) return send(res, 404, { error: 'Cette vidéo n’existe plus.' });
  const metadata = await new Response(metadataResult.stream).json();
  if (metadata.id !== id || !Number.isFinite(Date.parse(metadata.expires_at)) || Date.parse(metadata.expires_at) <= Date.now()) {
    return send(res, 410, { error: 'Ce lien de partage a expiré.' });
  }
  const pathname = `videos/${id}.${extension}`;
  const validUntil = Date.now() + SIGNED_LINK_TTL_MS;
  const token = await issueSignedToken({ pathname, operations: ['get'], validUntil });
  const signed = await presignUrl(token, { pathname, operation: 'get', access: 'private', validUntil });
  return res.redirect(302, signed.presignedUrl);
}

async function listVideos(res) {
  const blobs = [];
  let cursor;
  do {
    const page = await list({ prefix: 'video-meta/', limit: 1000, cursor, mode: 'expanded' });
    blobs.push(...(page.blobs || []));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor && blobs.length < 1000);

  const items = await Promise.all(blobs
    .filter(blob => /^video-meta\/v[a-z0-9]{12,40}\.json$/.test(blob.pathname))
    .map(async blob => {
      const result = await get(blob.pathname, { access: 'private' });
      if (!result || result.statusCode !== 200) return null;
      const metadata = await new Response(result.stream).json();
      const expiresAt = Date.parse(metadata.expires_at);
      if (!metadata.id || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
      return {
        id: metadata.id,
        tag_name: metadata.id,
        name: metadata.name,
        created_at: metadata.created_at,
        expires_at: metadata.expires_at,
        assets: [{
          name: `${metadata.name || 'video'}.mp4`,
          size: metadata.size,
          browser_download_url: `/d/${metadata.id}`,
          thumbnail_url: `/api/videos?action=thumbnail&id=${metadata.id}`
        }]
      };
    }));
  return send(res, 200, { items: items.filter(Boolean).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)) });
}

async function createUploadUrls(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Cette action n’est pas autorisée.' });
  const { id, run_id: runId } = readBody(req);
  if (!validJobId(id) || !/^\d{1,20}$/.test(String(runId || ''))) return send(res, 400, { error: 'Publication vidéo non reconnue.' });
  await verifyGitHubActionsRequest(req, runId);
  const [videoUrl, thumbnailUrl] = await Promise.all([
    signedPut(`videos/${id}.mp4`, 'video/mp4', MAX_VIDEO_BYTES),
    signedPut(`videos/${id}.jpg`, 'image/jpeg', MAX_THUMBNAIL_BYTES)
  ]);
  return send(res, 200, { videoUrl, thumbnailUrl });
}

async function publishVideo(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Cette action n’est pas autorisée.' });
  const { id, run_id: runId, name } = readBody(req);
  if (!validJobId(id) || !/^\d{1,20}$/.test(String(runId || ''))) return send(res, 400, { error: 'Publication vidéo non reconnue.' });
  await verifyGitHubActionsRequest(req, runId);
  const video = await head(`videos/${id}.mp4`);
  const thumbnail = await head(`videos/${id}.jpg`);
  if (!video || video.size < 1 || video.size > MAX_VIDEO_BYTES || video.contentType !== 'video/mp4') {
    return send(res, 422, { error: 'Le fichier MP4 publié est invalide.' });
  }
  if (!thumbnail || thumbnail.size < 1 || thumbnail.size > MAX_THUMBNAIL_BYTES || thumbnail.contentType !== 'image/jpeg') {
    return send(res, 422, { error: 'La miniature publiée est invalide.' });
  }
  const metadata = {
    id,
    name: safeName(name),
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + SHARE_TTL_MS).toISOString(),
    size: video.size,
    content_type: 'video/mp4'
  };
  await put(`video-meta/${id}.json`, JSON.stringify(metadata), {
    access: 'private', addRandomSuffix: false, allowOverwrite: false,
    contentType: 'application/json; charset=utf-8', cacheControlMaxAge: 60
  });
  return send(res, 200, {
    ...metadata,
    download_url: `/d/${id}`,
    thumbnail_url: `/api/videos?action=thumbnail&id=${id}`
  });
}

async function cleanupExpired(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Cette action n’est pas autorisée.' });
  const { run_id: runId } = readBody(req);
  if (!/^\d{1,20}$/.test(String(runId || ''))) return send(res, 400, { error: 'Tâche de maintenance non reconnue.' });
  await verifyGitHubActionsMaintenanceRequest(req, runId);
  let cursor;
  let deleted = 0;
  let inspected = 0;
  let hasMore = true;
  while (hasMore && deleted < MAX_CLEANUP_PER_RUN) {
    const page = await list({ prefix: 'video-meta/', limit: 100, cursor, mode: 'expanded' });
    for (const blob of page.blobs || []) {
      if (deleted >= MAX_CLEANUP_PER_RUN) break;
      const match = blob.pathname.match(/^video-meta\/(v[a-z0-9]{12,40})\.json$/);
      if (!match) continue;
      inspected += 1;
      const record = await get(blob.pathname, { access: 'private' });
      if (!record || record.statusCode !== 200) continue;
      let metadata;
      try { metadata = await new Response(record.stream).json(); } catch { continue; }
      const expiresAt = Date.parse(metadata.expires_at);
      if (metadata.id !== match[1] || !Number.isFinite(expiresAt) || expiresAt > Date.now()) continue;
      await del([`videos/${match[1]}.mp4`, `videos/${match[1]}.jpg`, blob.pathname]);
      deleted += 1;
    }
    hasMore = Boolean(page.hasMore);
    cursor = page.cursor;
    if (!cursor) hasMore = false;
  }
  return send(res, 200, { success: true, inspected, deleted, hasMore });
}

export default async function handler(req, res) {
  const action = String(req.query?.action || '');
  try {
    if (action === 'upload-url') return await createUploadUrls(req, res);
    if (action === 'publish') return await publishVideo(req, res);
    if (action === 'download') return await signedRead(req, res, String(req.query?.id || ''), 'mp4');
    if (action === 'thumbnail') return await signedRead(req, res, String(req.query?.id || ''), 'jpg');
    if (action === 'cleanup-expired') return await cleanupExpired(req, res);
    if (!action && req.method === 'GET') return await listVideos(res);
    return send(res, 404, { error: 'Action vidéo inconnue.' });
  } catch (error) {
    const result = publicError(error);
    return send(res, result.status, result.body);
  }
}
