import { del } from '@vercel/blob';
import {
  readBody, sameOrigin, send, validJobId, validOwnerToken,
  verifyOwnerToken, verifyGitHubActionsRequest, verifyRenderRun, publicError
} from '../lib/kidas-server.js';

const OUTPUTS = ['mp4', 'png', 'jpeg', 'webp'];

async function removeIfPresent(path) {
  try { await del(path); }
  catch (error) {
    const status = Number(error?.status || error?.statusCode);
    if (status !== 404 && status !== 410) throw error;
  }
}

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
    await removeIfPresent(`incoming/${id}.html`);
    if (fromBrowser) {
      await removeIfPresent(`owners/${id}.json`);
    } else if (cleanupOwner === true || String(cleanupOwner).toLowerCase() === 'true') {
      for (const output of OUTPUTS) await removeIfPresent(`outputs/${id}.${output}`);
      // Keep the owner record until the browser can read the failed run status.
      // The authenticated browser cleanup then removes this record.
    }
    return send(res, 200, { success: true });
  } catch (error) {
    const result = publicError(error);
    return send(res, result.status, result.body);
  }
}
