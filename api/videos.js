import { get, list } from '@vercel/blob';
import { send, publicError } from '../lib/kidas-server.js';

const MAX_ITEMS = 1000;

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'Cette action n’est pas autorisée.' });
  try {
    const blobs = [];
    let cursor;
    do {
      const page = await list({ prefix: 'video-meta/', limit: 1000, cursor, mode: 'expanded' });
      blobs.push(...(page.blobs || []));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor && blobs.length < MAX_ITEMS);

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
            thumbnail_url: `/api/video-thumbnail?id=${metadata.id}`
          }]
        };
      }));
    return send(res, 200, { items: items.filter(Boolean).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)) });
  } catch (error) {
    const result = publicError(error);
    return send(res, result.status, result.body);
  }
}
