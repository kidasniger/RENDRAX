import { put } from '@vercel/blob';
import { readBody, send, validJobId, verifyGitHubActionsRequest, publicError } from '../lib/kidas-server.js';

const PHASES = new Set(['rendu', 'temps_reel', 'assemblage']);

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Méthode non autorisée.' });

  const { id, run_id: runId, current, total, phase } = readBody(req);
  if (!validJobId(id) || !/^\\d{1,20}$/.test(String(runId || ''))) {
    return send(res, 400, { error: 'Identifiant de rendu invalide.' });
  }

  const currentFrame = Number(current);
  const totalFrames = Number(total);
  if (!Number.isSafeInteger(currentFrame) || currentFrame < 0 ||
      !Number.isSafeInteger(totalFrames) || totalFrames < 0 ||
      (totalFrames > 0 && currentFrame > totalFrames) ||
      !PHASES.has(phase)) {
    return send(res, 400, { error: 'Données de progression invalides.' });
  }

  try {
    await verifyGitHubActionsRequest(req, runId);
    await put(`progress/${id}.json`, JSON.stringify({
      current: currentFrame,
      total: totalFrames,
      phase,
      updatedAt: Date.now()
    }), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json; charset=utf-8',
      cacheControlMaxAge: 0
    });
    return send(res, 200, { success: true });
  } catch (error) {
    const result = publicError(error);
    return send(res, result.status, result.body);
  }
}
