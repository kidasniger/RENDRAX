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

const PUBLIC_ORIGIN = 'https://rendrax.vercel.app';

function htmlEscape(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

async function readVideoMetadata(id) {
  try {
    const metadata = await b2GetJson(`video-meta/${id}.json`);
    const expiresAt = Date.parse(metadata.expires_at);
    if (metadata.id !== id || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
    return metadata;
  } catch (error) {
    if (isB2NotFound(error)) return null;
    throw error;
  }
}

async function metadataResponse(req, res, id) {
  if (req.method !== 'GET') return send(res, 405, { error: 'Cette action n’est pas autorisée.' });
  if (!validJobId(id)) return send(res, 400, { error: 'Lien vidéo invalide.' });
  const metadata = await readVideoMetadata(id);
  if (!metadata) return send(res, 404, { error: 'Cette vidéo n’existe plus ou son lien a expiré.' });
  return send(res, 200, {
    ...metadata,
    share_url: `/d/${id}`,
    download_url: `/api/videos?action=download&id=${id}`,
    thumbnail_url: `/api/videos?action=thumbnail&id=${id}`
  });
}

async function sharePage(req, res, id) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Cette action n’est pas autorisée.' });
  if (!validJobId(id)) return send(res, 400, { error: 'Lien vidéo invalide.' });
  const metadata = await readVideoMetadata(id);
  const pageUrl = PUBLIC_ORIGIN + '/d/' + id;
  if (!metadata) {
    const missing = '<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lien vidéo indisponible · RENDRAX</title><main><h1>Cette vidéo n’est plus disponible</h1><p>Le lien a expiré ou la vidéo a été supprimée.</p><a href="/">Créer une vidéo avec RENDRAX</a></main></html>';
    res.status(410).setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.end(req.method === 'HEAD' ? '' : missing);
  }
  const title = (metadata.name || 'Vidéo') + ' · RENDRAX';
  const width = Number.isSafeInteger(metadata.width) ? metadata.width : 0;
  const height = Number.isSafeInteger(metadata.height) ? metadata.height : 0;
  const duration = Number.isFinite(metadata.duration) && metadata.duration > 0 ? Math.floor(metadata.duration) : 0;
  const durationText = duration ? Math.floor(duration / 60) + ' min ' + String(duration % 60).padStart(2, '0') + ' s' : 'vidéo MP4';
  const quality = width && height ? ' ' + width + ' × ' + height : '';
  const description = 'Regarde cette vidéo créée avec RENDRAX : ' + durationText + '.' + quality + ' Transforme tes propres animations HTML en MP4 sur RENDRAX.';
  const imageUrl = PUBLIC_ORIGIN + '/api/videos?action=thumbnail&id=' + id;
  const videoUrl = PUBLIC_ORIGIN + '/api/videos?action=download&id=' + id;
  const safeTitle = htmlEscape(title);
  const safeDescription = htmlEscape(description);
  const safeName = htmlEscape(metadata.name || 'Vidéo RENDRAX');
  const expiry = htmlEscape(new Date(metadata.expires_at).toLocaleDateString('fr-FR'));
  const html = '<!doctype html><html lang="fr"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="description" content="' + safeDescription + '"><title>' + safeTitle + '</title>' +
    '<link rel="canonical" href="' + pageUrl + '">' +
    '<meta property="og:type" content="video.other"><meta property="og:site_name" content="RENDRAX">' +
    '<meta property="og:title" content="' + safeTitle + '"><meta property="og:description" content="' + safeDescription + '">' +
    '<meta property="og:url" content="' + pageUrl + '"><meta property="og:image" content="' + imageUrl + '">' +
    '<meta property="og:image:secure_url" content="' + imageUrl + '"><meta property="og:image:type" content="image/jpeg">' +
    '<meta property="og:image:alt" content="Miniature de ' + safeName + '">' +
    '<meta property="og:video" content="' + videoUrl + '"><meta property="og:video:secure_url" content="' + videoUrl + '">' +
    '<meta property="og:video:type" content="video/mp4">' +
    (width ? '<meta property="og:video:width" content="' + width + '">' : '') +
    (height ? '<meta property="og:video:height" content="' + height + '">' : '') +
    '<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="' + safeTitle + '">' +
    '<meta name="twitter:description" content="' + safeDescription + '"><meta name="twitter:image" content="' + imageUrl + '">' +
    '<meta name="theme-color" content="#101827"><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;padding:24px 16px;background:#f3f6ff;color:#11162b;font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}' +
    'main{width:min(100%,760px);margin:5vh auto;padding:clamp(18px,4vw,32px);border:1px solid #dfe6f7;border-radius:24px;background:#fff;box-shadow:0 18px 60px rgba(34,62,130,.09)}' +
    '.brand{font-size:.8rem;font-weight:800;letter-spacing:.16em;color:#316bff}h1{margin:12px 0 6px;font-size:clamp(1.4rem,4vw,2rem);line-height:1.15;overflow-wrap:anywhere}' +
    'p{color:#65708b;margin:0 0 18px}.player{width:100%;aspect-ratio:' + (width && height ? width + '/' + height : '16/9') + ';max-height:72vh;background:#080b18;border-radius:16px;overflow:hidden}' +
    'video{width:100%;height:100%;object-fit:contain;display:block}.cta{display:inline-flex;align-items:center;justify-content:center;min-height:48px;margin-top:20px;padding:0 20px;border-radius:999px;background:#316bff;color:#fff;text-decoration:none;font-weight:750}' +
    'footer{margin-top:18px;color:#65708b;font-size:.78rem}@media(prefers-color-scheme:dark){body{background:#080b18;color:#f2f5ff}main{background:#11172a;border-color:#273353}p,footer{color:#9ca9c8}}</style>' +
    '</head><body><main><div class="brand">RENDRAX</div><h1>' + safeName + '</h1><p>' + safeDescription + '</p>' +
    '<div class="player"><video controls playsinline preload="metadata" poster="' + imageUrl + '" aria-label="Vidéo ' + safeName + '">' +
    '<source src="' + videoUrl + '" type="video/mp4">Ton navigateur ne prend pas en charge la lecture vidéo.</video></div>' +
    '<a class="cta" href="/">Créer ta propre vidéo</a><footer>Vidéo hébergée temporairement par RENDRAX · lien valable jusqu’au ' + expiry + '</footer></main></body></html>';
  res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.end(req.method === 'HEAD' ? '' : html);
}



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
        width: metadata.width,
        height: metadata.height,
        duration: metadata.duration,
        fps: metadata.fps,
        watermark: metadata.watermark,
        assets: [{
          name: `${metadata.name || 'video'}.mp4`,
          size: metadata.size,
          browser_download_url: `/api/videos?action=download&id=${metadata.id}`,
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
  const { id, run_id: runId, name, width, height, duration, fps, watermark } = readBody(req);
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
    width: Number.isSafeInteger(Number(width)) && Number(width) > 0 && Number(width) <= 16384 ? Number(width) : null,
    height: Number.isSafeInteger(Number(height)) && Number(height) > 0 && Number(height) <= 16384 ? Number(height) : null,
    duration: Number.isFinite(Number(duration)) && Number(duration) > 0 && Number(duration) <= 86400 ? Number(duration) : null,
    fps: Number.isFinite(Number(fps)) && Number(fps) > 0 && Number(fps) <= 240 ? Number(fps) : null,
    watermark: watermark === true,
    content_type: 'video/mp4'
  };
  await b2Put(`video-meta/${id}.json`, JSON.stringify(metadata), {
    contentType: 'application/json; charset=utf-8',
    cacheControl: 'private, no-store'
  });
  return send(res, 200, {
    ...metadata,
    download_url: `/api/videos?action=download&id=${id}`,
    share_url: `/d/${id}`,
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
    if (action === 'share') return await sharePage(req, res, String(req.query?.id || ''));
    if (action === 'metadata') return await metadataResponse(req, res, String(req.query?.id || ''));
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
