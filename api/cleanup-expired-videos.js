import { del, get, list } from '@vercel/blob';
import { readBody, send, verifyGitHubActionsMaintenanceRequest, publicError } from '../lib/kidas-server.js';

const MAX_DELETIONS_PER_RUN = 250;

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Cette action n’est pas autorisée.' });
  const { run_id: runId } = readBody(req);
  if (!/^\d{1,20}$/.test(String(runId || ''))) return send(res, 400, { error: 'Tâche de maintenance non reconnue.' });

  try {
    await verifyGitHubActionsMaintenanceRequest(req, runId);
    let cursor;
    let deleted = 0;
    let inspected = 0;
    let hasMore = true;

    while (hasMore && deleted < MAX_DELETIONS_PER_RUN) {
      const page = await list({ prefix: 'video-meta/', limit: 100, cursor, mode: 'expanded' });
      for (const blob of page.blobs || []) {
        if (deleted >= MAX_DELETIONS_PER_RUN) break;
        const match = blob.pathname.match(/^video-meta\/(v[a-z0-9]{12,40})\.json$/);
        if (!match) continue;
        inspected += 1;
        const record = await get(blob.pathname, { access: 'private' });
        if (!record || record.statusCode !== 200) continue;
        let metadata;
        try { metadata = await new Response(record.stream).json(); } catch { continue; }
        const expiresAt = Date.parse(metadata.expires_at);
        if (metadata.id !== match[1] || !Number.isFinite(expiresAt) || expiresAt > Date.now()) continue;
        await del([
          `videos/${match[1]}.mp4`,
          `videos/${match[1]}.jpg`,
          blob.pathname
        ]);
        deleted += 1;
      }
      hasMore = Boolean(page.hasMore);
      cursor = page.cursor;
      if (!cursor) hasMore = false;
    }

    return send(res, 200, { success: true, inspected, deleted, hasMore });
  } catch (error) {
    const result = publicError(error);
    return send(res, result.status, result.body);
  }
}
