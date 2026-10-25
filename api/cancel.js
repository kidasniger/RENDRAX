import { githubRequest, readBody, sameOrigin, send, publicError } from '../lib/kidas-server.js';

const REPOSITORY = 'kidasniger/RENDRAX';
const WORKFLOW_PATH = '.github/workflows/render.yml';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Méthode non autorisée.' });
  if (!sameOrigin(req)) return send(res, 403, { error: 'Origine de la demande refusée.' });

  const { runId } = readBody(req);
  if (!/^\d{1,20}$/.test(String(runId || ''))) {
    return send(res, 400, { error: 'Identifiant de tâche invalide.' });
  }

  try {
    // Ne jamais annuler un workflow arbitraire dont seul l'identifiant est fourni
    // par le navigateur : vérifier le dépôt, le workflow et le type de déclenchement.
    const { data: run } = await githubRequest(
      `/repos/${REPOSITORY}/actions/runs/${encodeURIComponent(String(runId))}`
    );
    if (
      run?.repository?.full_name !== REPOSITORY ||
      run?.path !== WORKFLOW_PATH ||
      run?.event !== 'workflow_dispatch' ||
      !String(run?.name || '').startsWith('Rendu ')
    ) {
      return send(res, 403, { error: 'Cette tâche ne peut pas être annulée depuis RENDRAX.' });
    }

    if (['completed', 'cancelled'].includes(run.status)) {
      return send(res, 200, { success: true, alreadyFinished: true, status: run.status });
    }

    await githubRequest(
      `/repos/${REPOSITORY}/actions/runs/${encodeURIComponent(String(runId))}/cancel`,
      { method: 'POST' }
    );
    return send(res, 202, { success: true, status: 'cancellation_requested' });
  } catch (error) {
    const result = publicError(error);
    return send(res, result.status, result.body);
  }
}
