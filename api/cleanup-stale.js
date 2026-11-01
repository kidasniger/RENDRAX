import { timingSafeEqual } from 'node:crypto';
import { b2Delete, b2List } from '../lib/b2-storage.js';
import { publicError, send } from '../lib/kidas-server.js';

const MAX_AGE_MS = 2 * 60 * 60 * 1000;
const PAGE_SIZE = 1000;
const MAX_PAGES = 5;
const PATH_PATTERN = /^incoming\/v[a-z0-9]{12,40}\.(?:html|zip)$/;

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const supplied = Buffer.from(String(req.headers.authorization || ''));
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'Cette action n’est pas autorisée.' });
  if (!authorized(req)) return send(res, 401, { error: 'Accès refusé.' });

  try {
    const cutoff = Date.now() - MAX_AGE_MS;
    let continuationToken;
    let hasMore = true;
    let scanned = 0;
    const stale = [];

    for (let pageNumber = 0; pageNumber < MAX_PAGES && hasMore; pageNumber += 1) {
      const page = await b2List({ prefix: 'incoming/', maxKeys: PAGE_SIZE, continuationToken });
      scanned += page.objects.length;
      for (const object of page.objects) {
        const pathname = String(object.key || '');
        if (!PATH_PATTERN.test(pathname)) continue;
        const uploadedAt = new Date(object.lastModified).getTime();
        if (Number.isFinite(uploadedAt) && uploadedAt < cutoff) stale.push(pathname);
      }
      continuationToken = page.continuationToken;
      hasMore = Boolean(page.hasMore && continuationToken);
    }

    for (let i = 0; i < stale.length; i += 100) {
      await b2Delete(stale.slice(i, i + 100));
    }

    return send(res, 200, {
      success: true,
      scanned,
      deleted: stale.length,
      olderThanHours: 2,
      morePending: hasMore
    });
  } catch (error) {
    const result = publicError(error);
    return send(res, result.status, result.body);
  }
}
