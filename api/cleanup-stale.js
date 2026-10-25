import { timingSafeEqual } from 'node:crypto';
import { del, head, list } from '@vercel/blob';
import { publicError, send } from '../lib/kidas-server.js';

const MAX_AGE_MS = 48 * 60 * 60 * 1000;
const PAGE_SIZE = 1000;
const MAX_PAGES = 5;
const PATH_PATTERN = /^incoming\/v[a-z0-9]{12,40}\.html$/;

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

    // Remove orphaned owner metadata only when no successful MP4 exists.
    // An input-cleanup failure must not revoke a user's access to a finished render.
    const targets = [];
    for (let i = 0; i < stale.length; i += 50) {
      const batch = stale.slice(i, i + 50);
      const outputExists = await Promise.all(batch.map(async item => {
        try {
          await head(`outputs/${item.id}.mp4`);
          return true;
        } catch (error) {
          const status = Number(error?.status || error?.statusCode);
          if (status === 404) return false;
          throw error;
        }
      }));
      batch.forEach((item, index) => {
        targets.push(item.pathname);
        if (!outputExists[index]) targets.push(`owners/${item.id}.json`);
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
      morePending: hasMore
    });
  } catch (error) {
    const result = publicError(error);
    return send(res, result.status, result.body);
  }
}
