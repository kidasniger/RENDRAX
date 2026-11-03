import {
  b2Delete, b2GetJson, b2Head, b2List, b2PresignGet, b2PresignPut, b2Put,
  isB2NotFound
} from '../lib/b2-storage.js';
import {
  githubRequest, readBody, safeName, send, validJobId, verifyGitHubActionsRequest,
  verifyGitHubActionsMaintenanceRequest, publicError
} from '../lib/kidas-server.js';

const MAX_VIDEO_BYTES = 500 * 1000 * 1000;
const MAX_THUMBNAIL_BYTES = 60 * 1024;
const SHARE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SIGNED_LINK_TTL_SECONDS = 5 * 60;
const MAX_CLEANUP_PER_RUN = 250;

async function signedRead(req, res, id, extension) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Cette action n’est pas autorisée.' });
  if (!validJobId(id)) return send(res, 400, { error: 'Lien vidéo invalide.' });
  let metadata;
  try { metadata = await b2GetJson(`video-meta/${id}.json`); }
  catch (error) {
    if (isB2NotFound(error)) return send(res, 404, { error: 'Cette vidéo n’existe plus.' });
    throw error;
  }
  const expiresAt = Date.parse(metadata.expires_at);
  if (metadata.id !== id || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return send(res, 410, { error: 'Ce lien de partage a expiré.' });
  }
  const url = await b2PresignGet(`videos/${id}.${extension}`, SIGNED_LINK_TTL_SECONDS);
  return res.redirect(302, url);
}

async function readGeneratedCount() {
  try {
    const response = await githubRequest('/repos/kidasniger/RENDRAX/git/trees/main?recursive=1');
    const tree = response.data?.tree;
    if (!Array.isArray(tree) || response.data?.truncated) return null;
    return tree.filter(item =>
      item.type === 'blob' &&
      /^stats\/generated\/v[a-z0-9]{12,40}\.json$/.test(item.path || '')
    ).length;
  } catch (error) {
    console.warn('[RENDRAX generated count]', error?.status || error?.name || 'error');
    return null;
  }
}

async function listVideos(res) {
  const objects = [];
  let continuationToken;
  do {
    const page = await b2List({ prefix: 'video-meta/', maxKeys: 1000, continuationToken });
    objects.push(...page.objects);
    continuationToken = page.hasMore ? page.continuationToken : undefined;
  } while (continuationToken && objects.length < 5000);

  const items = await Promise.all(objects
    .filter(object => /^video-meta\/v[a-z0-9]{12,40}\.json$/.test(object.key || ''))
    .map(async object => {
      let metadata;
      try { metadata = await b2GetJson(object.key); }
      catch (error) { if (isB2NotFound(error)) return null; throw error; }
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
  const generatedCount = await readGeneratedCount();
  return send(res, 200, {
    items: items.filter(Boolean).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)),
    ...(Number.isSafeInteger(generatedCount) ? { generatedCount } : {})
  });
}

async function createUploadUrls(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Cette action n’est pas autorisée.' });
  const { id, run_id: runId, video_size: videoSize, thumbnail_size: thumbnailSize } = readBody(req);
  if (!validJobId(id) || !/^\d{1,20}$/.test(String(runId || ''))) return send(res, 400, { error: 'Publication vidéo non reconnue.' });
  const videoBytes = Number(videoSize);
  const thumbnailBytes = Number(thumbnailSize);
  if (!Number.isSafeInteger(videoBytes) || videoBytes < 1 || videoBytes > MAX_VIDEO_BYTES || !Number.isSafeInteger(thumbnailBytes) || thumbnailBytes < 1 || thumbnailBytes > MAX_THUMBNAIL_BYTES) return send(res, 400, { error: 'La taille du MP4 ou de la miniature est invalide.' });
  await verifyGitHubActionsRequest(req, runId);
  const [videoUrl, thumbnailUrl] = await Promise.all([
    b2PresignPut(`videos/${id}.mp4`, 'video/mp4', videoBytes, 10 * 60),
    b2PresignPut(`videos/${id}.jpg`, 'image/jpeg', thumbnailBytes, 10 * 60)
  ]);
  return send(res, 200, { videoUrl, thumbnailUrl });
}

async function publishVideo(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Cette action n’est pas autorisée.' });
  const { id, run_id: runId, name } = readBody(req);
  if (!validJobId(id) || !/^\d{1,20}$/.test(String(runId || ''))) return send(res, 400, { error: 'Publication vidéo non reconnue.' });
  await verifyGitHubActionsRequest(req, runId);
  const video = await b2Head(`videos/${id}.mp4`);
  const thumbnail = await b2Head(`videos/${id}.jpg`);
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
  await b2Put(`video-meta/${id}.json`, JSON.stringify(metadata), {
    contentType: 'application/json; charset=utf-8',
    cacheControl: 'private, no-store'
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
  let continuationToken;
  let deleted = 0;
  let inspected = 0;
  let hasMore = true;
  while (hasMore && deleted < MAX_CLEANUP_PER_RUN) {
    const page = await b2List({ prefix: 'video-meta/', maxKeys: 100, continuationToken });
    for (const object of page.objects) {
      if (deleted >= MAX_CLEANUP_PER_RUN) break;
      const match = String(object.key || '').match(/^video-meta\/(v[a-z0-9]{12,40})\.json$/);
      if (!match) continue;
      inspected += 1;
      let metadata;
      try { metadata = await b2GetJson(object.key); }
      catch (error) { if (isB2NotFound(error)) continue; throw error; }
      const expiresAt = Date.parse(metadata.expires_at);
      if (metadata.id !== match[1] || !Number.isFinite(expiresAt) || expiresAt > Date.now()) continue;
      await b2Delete([`videos/${match[1]}.mp4`, `videos/${match[1]}.jpg`, object.key]);
      deleted += 1;
    }
    hasMore = page.hasMore;
    continuationToken = page.continuationToken;
    if (!continuationToken) hasMore = false;
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
