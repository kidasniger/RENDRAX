import { head, issueSignedToken, presignUrl } from '@vercel/blob';
import {
  readOwnerRecord, send, validJobId, verifyGitHubActionsRequest,
  verifyRenderRun, publicError
} from '../lib/kidas-server.js';

const OUTPUTS = new Set(['mp4', 'png', 'jpeg', 'webp']);
const MIME = { mp4: 'video/mp4', png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' };
const MAX_BYTES = { mp4: 250 * 1000 * 1000, png: 100 * 1000 * 1000, jpeg: 100 * 1000 * 1000, webp: 100 * 1000 * 1000 };
const URL_TTL_MS = 4 * 60 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Méthode non autorisée.' });
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const id = String(body.id || '');
  const runId = String(body.run_id || '');
  const output = String(body.output || 'mp4');
  if (!validJobId(id) || !/^\\d{1,20}$/.test(runId) || !OUTPUTS.has(output)) {
    return send(res, 400, { error: 'Identifiant ou format de rendu invalide.' });
  }

  try {
    await verifyGitHubActionsRequest(req, runId);
    await verifyRenderRun(id, runId);
    const owner = await readOwnerRecord(id);
    if (!owner || owner.output !== output) {
      return send(res, 403, { error: 'La publication ne correspond pas au rendu privé demandé.' });
    }

    const pathname = `outputs/${id}.${output}`;
    const validUntil = Date.now() + URL_TTL_MS;
    const token = await issueSignedToken({
      pathname,
      operations: ['put'],
      allowedContentTypes: [MIME[output]],
      maximumSizeInBytes: MAX_BYTES[output],
      validUntil
    });
    const signed = await presignUrl(token, {
      operation: 'put',
      pathname,
      access: 'private',
      allowedContentTypes: [MIME[output]],
      maximumSizeInBytes: MAX_BYTES[output],
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
