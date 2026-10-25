import { del, issueSignedToken, presignUrl, put } from '@vercel/blob';
import {
  ownerTokenHash, readBody, safeName, sameOrigin, send,
  validJobId, validOwnerToken, verifyTurnstile, publicError
} from '../lib/kidas-server.js';

const MAX_BYTES = 50 * 1000 * 1000;
const URL_TTL_MS = 10 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Méthode non autorisée.' });
  if (!sameOrigin(req)) return send(res, 403, { error: 'Origine de la demande refusée.' });

  const { id, ownerToken, captchaToken, name } = readBody(req);
  if (!validJobId(id)) return send(res, 400, { error: 'Identifiant temporaire invalide.' });
  if (!validOwnerToken(ownerToken)) return send(res, 400, { error: 'Clé privée de cette vidéo invalide.' });

  let ownerRecordCreated = false;
  try {
    await verifyTurnstile(req, captchaToken);
    if (!process.env.BLOB_STORE_ID) {
      const error = new Error('Le stockage Blob privé doit être connecté au projet Vercel.');
      error.status = 503;
      throw error;
    }

    const pathname = `incoming/${id}.html`;
    const validUntil = Date.now() + URL_TTL_MS;
    const token = await issueSignedToken({
      pathname,
      operations: ['put'],
      allowedContentTypes: ['text/html'],
      maximumSizeInBytes: MAX_BYTES,
      validUntil
    });
    const signed = await presignUrl(token, {
      operation: 'put',
      pathname,
      access: 'private',
      allowedContentTypes: ['text/html'],
      maximumSizeInBytes: MAX_BYTES,
      validUntil,
      addRandomSuffix: false,
      allowOverwrite: false
    });

    await put(`owners/${id}.json`, JSON.stringify({
      id,
      tokenHash: ownerTokenHash(ownerToken),
      name: safeName(name),
      createdAt: new Date().toISOString()
    }), {
      access: 'private',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: false
    });
    ownerRecordCreated = true;

    return send(res, 200, { url: signed.presignedUrl });
  } catch (error) {
    if (ownerRecordCreated) {
      try { await del(`owners/${id}.json`); } catch (cleanupError) {
        console.warn('[RENDRAX upload owner cleanup]', cleanupError?.name || 'error');
      }
    }
    const result = publicError(error);
    return send(res, result.status, result.body);
  }
}
