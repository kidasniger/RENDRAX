import { del } from '@vercel/blob';
import {
  readBody, sameOrigin, send, validJobId, validOwnerToken,
  verifyOwnerToken, verifyGitHubActionsRequest, verifyRenderRun, publicError
} from '../lib/kidas-server.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Méthode non autorisée.' });
  const { id, run_id: runId, cleanup_owner: cleanupOwner = false, ownerToken } = readBody(req);
  if (!validJobId(id)) return send(res, 400, { error: 'Identifiant temporaire invalide.' });

  try {
    const fromBrowser = sameOrigin(req);
    if (fromBrowser) {
      if (!validOwnerToken(ownerToken) || !await verifyOwnerToken(id, ownerToken)) {
        return send(res, 403, { error: 'Clé privée invalide pour cette vidéo.' });
      }
    } else {
      await verifyGitHubActionsRequest(req, runId);
      await verifyRenderRun(id, runId);
    }

    await del(`incoming/${id}.html`);
    if (fromBrowser) {
      await del(`owners/${id}.json`);
    } else if (cleanupOwner === true) {
      try { await del(`outputs/${id}.mp4`); } catch (error) {
        const status = Number(error?.status || error?.statusCode);
        if (status !== 404) throw error;
      }
      await del(`owners/${id}.json`);
    }
    return send(res, 200, { success: true });
  } catch (error) {
    const result = publicError(error);
    return send(res, result.status, result.body);
  }
}
