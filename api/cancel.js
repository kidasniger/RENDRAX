import { githubRequest, readBody, sameOrigin, send, validJobId, validOwnerToken, verifyOwnerToken, publicError } from '../lib/kidas-server.js';

const REPOSITORY = 'kidasniger/RENDRAX';
const RUNS_PAGE_SIZE = 100;
const MAX_RUN_PAGES = 5;

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Méthode non autorisée.' });
  if (!sameOrigin(req)) return send(res, 403, { error: 'Origine de la demande refusée.' });

  const { id, ownerToken } = readBody(req);
  if (!validJobId(id) || !validOwnerToken(ownerToken)) {
    return send(res, 400, { error: 'Identifiant ou clé privée invalide.' });
  }

  try {
    if (!await verifyOwnerToken(id, ownerToken)) {
      return send(res, 403, { error: 'Cette tâche ne vous appartient pas.' });
    }

    let run = null;
    for (let page = 1; page <= MAX_RUN_PAGES; page += 1) {
      const { data } = await githubRequest(
        `/repos/${REPOSITORY}/actions/runs?event=workflow_dispatch&branch=main&per_page=${RUNS_PAGE_SIZE}&page=${page}`
      );
      const runs = Array.isArray(data?.workflow_runs) ? data.workflow_runs : [];
      run = runs.find(item =>
        item.display_title === `Rendu ${id}` &&
        item.path === '.github/workflows/render.yml'
      ) || null;
      if (run || runs.length < RUNS_PAGE_SIZE) break;
    }

    if (!run) return send(res, 404, { error: 'Tâche de rendu introuvable.' });
    if (!['queued', 'in_progress', 'requested', 'waiting', 'pending'].includes(run.status)) {
      return send(res, 409, { error: 'Le rendu ne peut plus être annulé car il est déjà terminé.' });
    }

    await githubRequest(`/repos/${REPOSITORY}/actions/runs/${run.id}/cancel`, { method: 'POST' });
    return send(res, 200, { success: true, runId: run.id });
  } catch (error) {
    const result = publicError(error);
    return send(res, result.status, result.body);
  }
}
