import { head, issueSignedToken, presignUrl } from '@vercel/blob';
import {
  send, validJobId, verifyGitHubActionsRequest, verifyRenderRun, publicError
} from '../lib/kidas-server.js';

const URL_TTL_MS = 4 * 60 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'Méthode non autorisée.' });
  const id = String(req.query?.id || '');
  const runId = String(req.query?.run_id || '');
  if (!validJobId(id) || !/^\d{1,20}$/.test(runId)) {
    return send(res, 400, { error: 'Identifiant de rendu invalide.' });
  }

  try {
    await verifyGitHubActionsRequest(req, runId);
    await verifyRenderRun(id, runId);

    const pathname = `incoming/${id}.html`;
    await head(pathname);
    const validUntil = Date.now() + URL_TTL_MS;
    const token = await issueSignedToken({
      pathname,
      operations: ['get'],
      validUntil
    });
    const signed = await presignUrl(token, {
      pathname,
      operation: 'get',
      access: 'private',
      validUntil
    });
    return send(res, 200, { url: signed.presignedUrl });
  } catch (error) {
    const result = publicError(error);
    return send(res, result.status, result.body);
  }
}
