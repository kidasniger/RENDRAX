import { del } from '@vercel/blob';
import {
  readBody, sameOrigin, send, validJobId, verifyGitHubActionsRequest, publicError
} from '../lib/kidas-server.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Méthode non autorisée.' });
  const { id, run_id: runId, cleanup_owner: cleanupOwner = false } = readBody(req);
  if (!validJobId(id)) return send(res, 400, { error: 'Identifiant temporaire invalide.' });

  try {
    const fromBrowser = sameOrigin(req);
    // Browser requests may remove only their temporary upload. Only a verified
    // GitHub Actions run may remove the owner record after a failed render.
    if (!fromBrowser) {
      await verifyGitHubActionsRequest(req, runId);
    }
    await del(`incoming/${id}.html`);
    if (!fromBrowser && cleanupOwner === true) {
      await del(`owners/${id}.json`);
    }
    return send(res, 200, { success: true });
  } catch (error) {
    const result = publicError(error);
    return send(res, result.status, result.body);
  }
}
