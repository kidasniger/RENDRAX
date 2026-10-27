import { del } from '@vercel/blob';
import { readBody, sameOrigin, send, validJobId, validOwnerToken, verifyOwnerToken, publicError } from '../lib/kidas-server.js';

const OUTPUTS = ['mp4', 'png', 'jpeg', 'webp'];

async function removeIfPresent(path) {
  try { await del(path); }
  catch (error) {
    const status = Number(error?.status || error?.statusCode);
    if (status !== 404 && status !== 410) throw error;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Méthode non autorisée.' });
  if (!sameOrigin(req)) return send(res, 403, { error: 'Origine de la demande refusée.' });
  const { id, ownerToken } = readBody(req);
  if (!validJobId(id) || !validOwnerToken(ownerToken)) {
    return send(res, 400, { error: 'Identifiant ou clé privée invalide.' });
  }
  try {
    const owner = await verifyOwnerToken(id, ownerToken);
    if (!owner) return send(res, 404, { error: 'Fichier introuvable ou accès refusé.' });
    await removeIfPresent(`incoming/${id}.html`);
    for (const output of OUTPUTS) await removeIfPresent(`outputs/${id}.${output}`);
    await removeIfPresent(`owners/${id}.json`);
    return send(res, 200, { success: true, fileRemoved: true, ownerRecordRemoved: true });
  } catch (error) {
    const result = publicError(error);
    return send(res, result.status, result.body);
  }
}
