import { head } from '@vercel/blob';
import {
  readBody, sameOrigin, send, validJobId, validOwnerToken,
  verifyOwnerToken, publicError
} from '../lib/kidas-server.js';

function videoItem(id, owner, metadata, ownerToken) {
  return {
    id,
    tag_name: id,
    name: owner.name || 'RENDRAX',
    created_at: owner.createdAt || metadata.uploadedAt?.toISOString?.() || new Date().toISOString(),
    assets: [{
      name: `${owner.name || 'RENDRAX'}.mp4`,
      size: Number(metadata.size) || 0,
      browser_download_url: `/api/video?id=${encodeURIComponent(id)}&ownerToken=${encodeURIComponent(ownerToken)}`
    }]
  };
}

export default async function handler(req, res) {
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
        const metadata = await head(`outputs/${id}.mp4`);
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
