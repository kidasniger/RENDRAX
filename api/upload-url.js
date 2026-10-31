import { issueSignedToken, presignUrl } from '@vercel/blob';
import { readBody, sameOrigin, send, validJobId, verifyTurnstile, publicError } from '../lib/kidas-server.js';

const MAX_BYTES = 50 * 1000 * 1000;
const FILE_TYPES = Object.freeze({ html: { extension: 'html', contentType: 'text/html' }, zip: { extension: 'zip', contentType: 'application/zip' } });

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Cette action n’est pas autorisée.' });
  if (!sameOrigin(req)) return send(res, 403, { error: 'Cette demande a été refusée pour des raisons de sécurité.' });
  const { id, captchaToken, type_fichier = 'html' } = readBody(req);
  if (!validJobId(id)) return send(res, 400, { error: 'Fichier temporaire non reconnu.' });
  if (typeof type_fichier !== 'string' || !Object.prototype.hasOwnProperty.call(FILE_TYPES, type_fichier)) return send(res, 400, { error: 'Format de fichier non accepté.' });
  const fileType = FILE_TYPES[type_fichier];
  try {
    await verifyTurnstile(req, captchaToken);
    if (!process.env.BLOB_STORE_ID) {
      const error = new Error('Le stockage Blob privé doit être connecté au projet Vercel.');
      error.status = 503;
      throw error;
    }
    const pathname = `incoming/${id}.${fileType.extension}`;
    const validUntil = Date.now() + 10 * 60 * 1000;
    const token = await issueSignedToken({
      pathname,
      operations: ['put'],
      allowedContentTypes: [fileType.contentType],
      maximumSizeInBytes: MAX_BYTES,
      validUntil
    });
    const signed = await presignUrl(token, {
      operation: 'put',
      pathname,
      access: 'private',
      allowedContentTypes: [fileType.contentType],
      maximumSizeInBytes: MAX_BYTES,
      validUntil,
      addRandomSuffix: false,
      allowOverwrite: true
    });
    return send(res, 200, { url: signed.presignedUrl });
  } catch (error) {
    const result = publicError(error);
    return send(res, result.status, result.body);
  }
}
