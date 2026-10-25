import { issueSignedToken, presignUrl } from '@vercel/blob';
import { githubRequest, readBody, send, validJobId, verifyGitHubActionsRequest, publicError } from '../lib/kidas-server.js';

const MAX_VIDEO_BYTES = 250 * 1000 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Méthode non autorisée.' });
  const { id, run_id: runId } = readBody(req);
  if (!validJobId(id) || !/^\d{1,20}$/.test(String(runId || ''))) {
    return send(res, 400, { error: 'Identifiant de rendu invalide.' });
  }

  try {
    await verifyGitHubActionsRequest(req, runId);
    const { data: run } = await githubRequest(`/repos/kidasniger/RENDRAX/actions/runs/${runId}`);
    if (run?.display_title !== `Rendu ${id}` ||
        run?.path !== '.github/workflows/render.yml' ||
        run?.event !== 'workflow_dispatch' ||
        run?.head_branch !== 'main') {
      return send(res, 403, { error: 'Ce workflow ne peut pas publier cette vidéo.' });
    }

    const pathname = `outputs/${id}.mp4`;
    const validUntil = Date.now() + 10 * 60 * 1000;
    const token = await issueSignedToken({
      pathname,
      operations: ['put'],
      allowedContentTypes: ['video/mp4'],
      maximumSizeInBytes: MAX_VIDEO_BYTES,
      validUntil
    });
    const signed = await presignUrl(token, {
      operation: 'put',
      pathname,
      access: 'private',
      allowedContentTypes: ['video/mp4'],
      maximumSizeInBytes: MAX_VIDEO_BYTES,
      validUntil,
      addRandomSuffix: false,
      allowOverwrite: false
    });
    return send(res, 200, { url: signed.presignedUrl });
  } catch (error) {
    const result = publicError(error);
    return send(res, result.status, result.body);
  }
}
