import { githubRequest, send, publicError } from '../lib/kidas-server.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'Méthode non autorisée.' });
  try {
    const response = await githubRequest('/repos/kidasniger/RENDRAX/releases?per_page=12');
    const items = (response.data || []).map(release => {
      const releaseAssets = release.assets || [];
      const thumbnailsByName = new Map(
        releaseAssets
          .filter(asset => typeof asset.name === 'string' && asset.name.toLowerCase().endsWith('.jpg'))
          .map(asset => [asset.name.slice(0, -4).toLowerCase(), asset.browser_download_url || null])
      );

      return {
        id: release.id,
        tag_name: release.tag_name,
        name: release.name,
        created_at: release.created_at,
        html_url: release.html_url,
        assets: releaseAssets
          .filter(asset => typeof asset.name === 'string' && asset.name.toLowerCase().endsWith('.mp4'))
          .map(asset => {
            const baseName = asset.name.slice(0, -4).toLowerCase();
            return {
              name: asset.name,
              size: asset.size,
              browser_download_url: asset.browser_download_url,
              thumbnail_url: thumbnailsByName.get(baseName) || null
            };
          })
      };
    }).filter(release => release.assets.length > 0);
    return send(res, 200, { items });
  } catch (error) {
    const result = publicError(error);
    return send(res, result.status, result.body);
  }
}
