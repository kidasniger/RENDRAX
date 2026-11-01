import { b2PresignPut } from '../lib/b2-storage.js';
import { readBody, sameOrigin, send, validJobId, verifyTurnstile, publicError } from '../lib/kidas-server.js';

const MAX_BYTES = 50 * 1000 * 1000;
const FILE_TYPES = Object.freeze({ html: { extension: 'html', contentType: 'text/html' }, zip: { extension: 'zip', contentType: 'application/zip' } });

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Cette action n’est pas autorisée.' });
  if (!sameOrigin(req)) return send(res, 403, { error: 'Cette demande a été refusée pour des raisons de sécurité.' });
  const { id, captchaToken, type_fichier = 'html', size } = readBody(req);
  if (!validJobId(id)) return send(res, 400, { error: 'Fichier temporaire non reconnu.' });
  if (typeof type_fichier !== 'string' || !Object.prototype.hasOwnProperty.call(FILE_TYPES, type_fichier)) return send(res, 400, { error: 'Format de fichier non accepté.' });
  const fileType = FILE_TYPES[type_fichier];
  const contentLength = Number(size);
  if (!Number.isSafeInteger(contentLength) || contentLength < 1 || contentLength > MAX_BYTES) return send(res, 400, { error: 'La taille du fichier n’est pas valide (50 Mo maximum).' });
  try {
    await verifyTurnstile(req, captchaToken);
    const pathname = `incoming/${id}.${fileType.extension}`;
    const url = await b2PresignPut(pathname, fileType.contentType, contentLength, 10 * 60);
    return send(res, 200, { url });
  } catch (error) {
    const result = publicError(error);
    return send(res, result.status, result.body);
  }
}
