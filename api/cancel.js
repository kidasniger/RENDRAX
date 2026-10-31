import { githubRequest, readBody, sameOrigin, send, validJobId, publicError } from '../lib/kidas-server.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Cette action n’est pas autorisée.' });
  if (!sameOrigin(req)) return send(res, 403, { error: 'Cette demande a été refusée pour des raisons de sécurité.' });
  const { runId } = readBody(req);
  if (!/^\d+$/.test(String(runId || ''))) return send(res, 400, { error: 'La demande d’arrêt n’est pas reconnue.' });
  try {
    await githubRequest(`/repos/kidasniger/Kidas/actions/runs/${runId}/cancel`, { method: 'POST' });
    return send(res, 200, { success: true });
  } catch (error) {
    const result = publicError(error);
    return send(res, result.status, result.body);
  }
}
