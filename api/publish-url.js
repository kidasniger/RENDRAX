import { issueSignedToken, presignUrl } from '@vercel/blob';
import {
  send, validJobId, verifyGitHubActionsRequest, verifyRenderRun, publicError
} from '../lib/kidas-server.js';

const MAX_VIDEO_BYTES = 250 * 1000 * 1000;
const URL_TTL_MS = 4 * 60 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Méthode non autorisée.' });
  const { id, run_id: runId } = req.body || {};
  if (!validJobId(id) || !/^\d{1,20}$/.test(String(runId || ''))) {
    return send(res, 400, { error: 'Identifiant de rendu invalide.' });
  }

  try {
    await verifyGitHubActionsRequest(req, runId);
    await verifyRenderRun(id, runId);

    const pathname = `outputs/${id}.mp4`;
    const validUntil = Date.now() + URL_TTL_MS;
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
