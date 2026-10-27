import { issueSignedToken, presignUrl } from '@vercel/blob';
import {
  readOwnerRecord, send, validJobId, verifyGitHubActionsRequest, verifyRenderRun, publicError
} from '../lib/kidas-server.js';

const TYPES = {
  mp4: { contentType: 'video/mp4', maxBytes: 250 * 1000 * 1000 },
  png: { contentType: 'image/png', maxBytes: 100 * 1000 * 1000 },
  jpeg: { contentType: 'image/jpeg', maxBytes: 100 * 1000 * 1000 },
  webp: { contentType: 'image/webp', maxBytes: 100 * 1000 * 1000 }
};
const URL_TTL_MS = 4 * 60 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Méthode non autorisée.' });
  const { id, run_id: runId, output = 'mp4' } = req.body || {};
  if (!validJobId(id) || !/^\d{1,20}$/.test(String(runId || '')) || !Object.hasOwn(TYPES, String(output))) {
    return send(res, 400, { error: 'Identifiant de rendu invalide.' });
  }

  try {
    await verifyGitHubActionsRequest(req, runId);
    await verifyRenderRun(id, runId);
    const owner = await readOwnerRecord(id);
    if (!owner || (owner.output || 'mp4') !== String(output)) {
      return send(res, 403, { error: 'Ce rendu ne correspond pas au format réservé.' });
    }
    const type = TYPES[output];
    const pathname = `outputs/${id}.${output}`;
    const validUntil = Date.now() + URL_TTL_MS;
    const token = await issueSignedToken({
      pathname,
      operations: ['put'],
      allowedContentTypes: [type.contentType],
      maximumSizeInBytes: type.maxBytes,
      validUntil
    });
    const signed = await presignUrl(token, {
      operation: 'put',
      pathname,
      access: 'private',
      allowedContentTypes: [type.contentType],
      maximumSizeInBytes: type.maxBytes,
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
