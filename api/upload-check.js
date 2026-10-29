import { head } from '@vercel/blob';
import { readBody, sameOrigin, send, validJobId, verifyTurnstile, publicError } from '../lib/kidas-server.js';

const MAX_BYTES = 50 * 1000 * 1000;
const FILE_TYPES = Object.freeze({ html: 'html', zip: 'zip' });

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Méthode non autorisée.' });
  if (!sameOrigin(req)) return send(res, 403, { error: 'Origine de la demande refusée.' });

  const { id, captchaToken, size, type_fichier = 'html' } = readBody(req);
  const expectedSize = Number(size);
  if (!validJobId(id)) return send(res, 400, { error: 'Identifiant temporaire invalide.' });
  if (typeof type_fichier !== 'string' || !Object.prototype.hasOwnProperty.call(FILE_TYPES, type_fichier)) return send(res, 400, { error: 'Type de fichier invalide.' });
  if (!Number.isSafeInteger(expectedSize) || expectedSize < 1 || expectedSize > MAX_BYTES) {
    return send(res, 400, { error: 'Taille de fichier invalide.' });
  }

  try {
    await verifyTurnstile(req, captchaToken);
    const metadata = await head(`incoming/${id}.${FILE_TYPES[type_fichier]}`);
    const actualSize = Number(metadata.size);
    return send(res, 200, { uploaded: Number.isFinite(actualSize) && actualSize === expectedSize });
  } catch (error) {
    // A missing object means the browser transfer did not complete. Do not
    // hide auth, store-configuration, or provider errors as a missing upload.
    if (Number(error?.status) === 404 || error?.name === 'BlobNotFoundError') {
      return send(res, 200, { uploaded: false });
    }
    const result = publicError(error);
    return send(res, result.status, result.body);
  }
}
