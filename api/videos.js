import { head } from '@vercel/blob';
import {
  githubRequest, readBody, sameOrigin, send, validJobId, validOwnerToken,
  verifyOwnerToken, publicError
} from '../lib/kidas-server.js';

const MEDIA_ASSET = /\\.(mp4|png|jpe?g|webp)$/i;
const LEGACY_ARTIFACTS = new Set(['video-mp4', 'image-export']);
const MAX_LEGACY_PAGES = 10;

async function legacyGitHubItems() {
  const items = [];
  for (let page = 1; page <= MAX_LEGACY_PAGES; page += 1) {
    const { data } = await githubRequest(`/repos/kidasniger/RENDRAX/releases?per_page=100&page=${page}`);
    const releases = Array.isArray(data) ? data : [];
    for (const release of releases) {
      for (const asset of (release.assets || []).filter(item => MEDIA_ASSET.test(item.name || ''))) {
        items.push({
          id: `legacy-release-${release.id}-${asset.id}`,
          tag_name: release.tag_name,
          name: asset.name,
          created_at: release.published_at || release.created_at,
          html_url: release.html_url,
          source: 'github-release',
          assets: [{ name: asset.name, size: asset.size, browser_download_url: asset.browser_download_url }]
        });
      }
    }
    if (releases.length < 100) break;
  }

  // Older successful jobs may still have GitHub Actions archives even when
  // their Release/tag was removed. Surface those archives too; they remain ZIPs
  // and can be downloaded from the public workflow-run page.
  try {
    for (let page = 1; page <= MAX_LEGACY_PAGES; page += 1) {
      const { data } = await githubRequest(`/repos/kidasniger/RENDRAX/actions/artifacts?per_page=100&page=${page}`);
      const artifacts = Array.isArray(data?.artifacts) ? data.artifacts : [];
      for (const artifact of artifacts) {
        const runId = artifact.workflow_run?.id;
        if (artifact.expired || !LEGACY_ARTIFACTS.has(artifact.name) || !runId) continue;
        items.push({
          id: `github-artifact-${artifact.id}`,
          name: artifact.name === 'image-export' ? 'Image générée — ancienne archive ZIP' : 'Vidéo MP4 — ancienne archive ZIP',
          artifact_name: artifact.name,
          size: Number(artifact.size_in_bytes) || 0,
          created_at: artifact.created_at,
          html_url: `https://github.com/kidasniger/RENDRAX/actions/runs/${runId}`,
          source: 'github-artifact',
          assets: []
        });
      }
      if (artifacts.length < 100) break;
    }
  } catch (error) {
    // Release assets are still usable if the token cannot list Actions archives.
    console.warn('[RENDRAX legacy artifact history]', error?.status || error?.name || 'error');
  }
  return items;
}

function videoItem(id, owner, metadata, ownerToken) {
  const outputType = ['mp4', 'png', 'jpeg', 'webp'].includes(owner.output) ? owner.output : 'mp4';
  return {
    id,
    tag_name: id,
    name: owner.name || 'RENDRAX',
    created_at: owner.createdAt || metadata.uploadedAt?.toISOString?.() || new Date().toISOString(),
    assets: [{
      name: `${owner.name || 'RENDRAX'}.${outputType}`,
      size: Number(metadata.size) || 0,
      browser_download_url: `/api/video?id=${encodeURIComponent(id)}&ownerToken=${encodeURIComponent(ownerToken)}&output=${encodeURIComponent(outputType)}`
    }]
  };
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      return send(res, 200, { items: await legacyGitHubItems() });
    } catch (error) {
      const result = publicError(error);
      return send(res, result.status, result.body);
    }
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'Méthode non autorisée.' });
  if (!sameOrigin(req)) return send(res, 403, { error: 'Origine de la demande refusée.' });

  const body = readBody(req);
  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length > 50) return send(res, 400, { error: 'Trop de vidéos dans la demande.' });

  try {
    const results = await Promise.all(items.map(async item => {
      const id = String(item?.id || '');
      const ownerToken = String(item?.ownerToken || '');
      if (!validJobId(id) || !validOwnerToken(ownerToken)) return null;
      const owner = await verifyOwnerToken(id, ownerToken);
      if (!owner) return null;
      try {
        const outputType = ['mp4', 'png', 'jpeg', 'webp'].includes(owner.output) ? owner.output : 'mp4';
        const metadata = await head(`outputs/${id}.${outputType}`);
        return videoItem(id, owner, metadata, ownerToken);
      } catch {
        return null;
      }
    }));
    return send(res, 200, { items: results.filter(Boolean) });
  } catch (error) {
    const result = publicError(error);
    return send(res, result.status, result.body);
  }
}
