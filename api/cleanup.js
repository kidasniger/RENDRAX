import { b2Delete } from '../lib/b2-storage.js';
import { readBody, sameOrigin, send, validJobId, verifyGitHubActionsRequest, publicError } from '../lib/kidas-server.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Cette action n’est pas autorisée.' });
  const { id, run_id: runId, type_fichier = 'html' } = readBody(req);
  if (!validJobId(id)) return send(res, 400, { error: 'Fichier temporaire non reconnu.' });
  if (!['html', 'zip'].includes(type_fichier)) return send(res, 400, { error: 'Format de fichier non accepté.' });

  try {
    // The website can clean up a failed upload from the same origin.
    // GitHub Actions must prove its identity through a short-lived OIDC token.
    if (!sameOrigin(req)) {
      await verifyGitHubActionsRequest(req, runId);
    }
    await Promise.all([
      b2Delete([`incoming/${id}.${type_fichier}`, `progress/${id}.json`])
    ]);
    return send(res, 200, { success: true });
  } catch (error) {
    const result = publicError(error);
    return send(res, result.status, result.body);
  }
}
