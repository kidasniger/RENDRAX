import { timingSafeEqual } from 'node:crypto';
import { del, head, list } from '@vercel/blob';
import { publicError, send } from '../lib/kidas-server.js';

const MAX_AGE_MS = 48 * 60 * 60 * 1000;
const PAGE_SIZE = 1000;
const MAX_PAGES = 5;
const PATH_PATTERN = /^incoming\/v[a-z0-9]{12,40}\.html$/;
const OUTPUT_TYPES = ['mp4', 'png', 'jpeg', 'webp'];

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const supplied = Buffer.from(String(req.headers.authorization || ''));
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'Méthode non autorisée.' });
  if (!authorized(req)) return send(res, 401, { error: 'Non autorisé.' });

  try {
    const cutoff = Date.now() - MAX_AGE_MS;
    let cursor;
    let hasMore = true;
    let scanned = 0;
    const stale = [];

    for (let pageNumber = 0; pageNumber < MAX_PAGES && hasMore; pageNumber += 1) {
      const page = await list({ prefix: 'incoming/', limit: PAGE_SIZE, cursor });
      const blobs = Array.isArray(page.blobs) ? page.blobs : [];
      scanned += blobs.length;
      for (const blob of blobs) {
        const pathname = String(blob.pathname || '');
        if (!PATH_PATTERN.test(pathname)) continue;
        const uploadedAt = new Date(blob.uploadedAt).getTime();
        if (Number.isFinite(uploadedAt) && uploadedAt < cutoff) {
          const id = pathname.slice('incoming/'.length, -'.html'.length);
          stale.push({ pathname, id });
        }
      }
      cursor = page.cursor;
      hasMore = Boolean(page.hasMore && cursor);
    }

    // Also find old owner records whose upload URL was issued but whose upload never began.
    const ownerIds = new Set(stale.map(item => item.id));
    let ownerCursor;
    let ownersHasMore = true;
    let ownerRecordsScanned = 0;
    for (let pageNumber = 0; pageNumber < MAX_PAGES && ownersHasMore; pageNumber += 1) {
      const page = await list({ prefix: 'owners/', limit: PAGE_SIZE, cursor: ownerCursor });
      const blobs = Array.isArray(page.blobs) ? page.blobs : [];
      ownerRecordsScanned += blobs.length;
      for (const blob of blobs) {
        const pathname = String(blob.pathname || '');
        const match = pathname.match(/^owners\/(v[a-z0-9]{12,40})\.json$/);
        if (!match) continue;
        const uploadedAt = new Date(blob.uploadedAt).getTime();
        if (Number.isFinite(uploadedAt) && uploadedAt < cutoff) ownerIds.add(match[1]);
      }
      ownerCursor = page.cursor;
      ownersHasMore = Boolean(page.hasMore && ownerCursor);
    }

    // Preserve owner metadata for successful MP4s even if source cleanup failed.
    const targets = stale.map(item => item.pathname);
    const candidates = Array.from(ownerIds);
    for (let i = 0; i < candidates.length; i += 50) {
      const batch = candidates.slice(i, i + 50);
      const outputExists = await Promise.all(batch.map(async id => {
        for (const ext of OUTPUT_TYPES) {
          try {
            await head(`outputs/${id}.${ext}`);
            return true;
          } catch (error) {
            const status = Number(error?.status || error?.statusCode);
            if (status !== 404) throw error;
          }
        }
        return false;
      }));
      batch.forEach((id, index) => {
        if (!outputExists[index]) targets.push(`owners/${id}.json`);
      });
    }
    for (let i = 0; i < targets.length; i += 100) {
      await del(targets.slice(i, i + 100));
    }

    return send(res, 200, {
      success: true,
      scanned,
      deleted: stale.length,
      olderThanHours: 48,
      ownerRecordsScanned,
      morePending: hasMore || ownersHasMore
    });
  } catch (error) {
    const result = publicError(error);
    return send(res, result.status, result.body);
  }
}
