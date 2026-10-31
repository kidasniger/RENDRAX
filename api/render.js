import { head } from '@vercel/blob';
import { githubRequest, readBody, safeName, sameOrigin, send, validJobId, verifyTurnstile, publicError } from '../lib/kidas-server.js';

const MAX_BYTES = 50 * 1000 * 1000;
const FILE_TYPES = Object.freeze({ html: 'html', zip: 'zip' });
const FORMATS = new Set(['auto', 'portrait', 'landscape', 'square']);
const DURATIONS = new Set(['0', '10', '30', '60', '120', '300']);

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Cette action n’est pas autorisée.' });
  if (!sameOrigin(req)) return send(res, 403, { error: 'Cette demande a été refusée pour des raisons de sécurité.' });
  const { id, captchaToken, scale, test, duration, format, name, watermark = true, loudnorm = true, audio_offset_ms = 0, type_fichier = 'html', html_principal = '' } = readBody(req);
  const audioOffsetMs = Number(audio_offset_ms);
  const audioOffsetValid = (typeof audio_offset_ms === 'number' ||
    (typeof audio_offset_ms === 'string' && /^-?\d+$/.test(audio_offset_ms))) &&
    Number.isInteger(audioOffsetMs) && audioOffsetMs >= -2000 && audioOffsetMs <= 2000;
  if (!validJobId(id)) return send(res, 400, { error: 'Fichier temporaire non reconnu.' });
  if (typeof type_fichier !== 'string' || !Object.prototype.hasOwnProperty.call(FILE_TYPES, type_fichier)) return send(res, 400, { error: 'Format de fichier non accepté.' });
  if (type_fichier === 'zip' && (typeof html_principal !== 'string' || !html_principal || html_principal.length > 1024)) return send(res, 400, { error: 'La page principale du fichier ZIP est incorrecte.' });
  if (type_fichier === 'html' && html_principal !== '') return send(res, 400, { error: 'Un réglage inattendu a été fourni pour la page principale.' });
  if (!['0.5', '1'].includes(String(scale)) ||
      !['0', '10'].includes(String(test)) || !DURATIONS.has(String(duration)) || !FORMATS.has(String(format)) || !audioOffsetValid ||
      (typeof watermark !== 'boolean' && !['true', 'false'].includes(String(watermark).toLowerCase())) ||
      (typeof loudnorm !== 'boolean' && !['true', 'false'].includes(String(loudnorm).toLowerCase()))) {
    return send(res, 400, { error: 'Certains réglages sont incorrects.' });
  }
  const watermarkEnabled = typeof watermark === 'boolean'
    ? watermark
    : String(watermark).toLowerCase() === 'true';
  const loudnormEnabled = typeof loudnorm === 'boolean'
    ? loudnorm
    : String(loudnorm).toLowerCase() === 'true';
  let stage = 'vérification de sécurité';
  try {
    await verifyTurnstile(req, captchaToken);
    stage = 'lecture du HTML dans le stockage privé';
    if (!process.env.BLOB_STORE_ID) {
      const error = new Error('L’espace de stockage sécurisé n’est pas configuré.');
      error.status = 503;
      throw error;
    }
    const pathname = `incoming/${id}.${FILE_TYPES[type_fichier]}`;
    const metadata = await head(pathname);
    if (Number(metadata.size) > MAX_BYTES) {
      const error = new Error('Le fichier dépasse la taille maximale de 50 Mo.');
      error.status = 413;
      throw error;
    }
    stage = 'préparation du déclenchement du rendu';
    const inputs = {
      fichier: type_fichier === 'zip' ? 'kidas.zip' : 'kidas.html',
      blob_id: id,
      type_fichier,
      html_principal: type_fichier === 'zip' ? html_principal : '',
      scale: String(scale),
      test: String(test),
      duration: String(duration),
      format: String(format),
      watermark: String(watermarkEnabled),
      loudnorm: String(loudnormEnabled),
      audio_offset_ms: String(audioOffsetMs),
      nom: safeName(name),
      tag: id
    };
    stage = 'démarrage du service de création';
    await githubRequest('/repos/kidasniger/RENDRAX/actions/workflows/render.yml/dispatches', {
      method: 'POST',
      body: { ref: 'main', inputs }
    });
    return send(res, 202, { id });
  } catch (error) {
    const status = Number(error?.status) || 500;
    console.error('[RENDRAX render]', {
      stage,
      name: error?.name || 'Error',
      status,
      code: error?.code || null
    });
    if (status >= 500) {
      return send(res, 502, {
        error: `La préparation de la vidéo a échoué à l’étape : ${stage}. Consulte les détails techniques du serveur si le problème persiste.`,
        stage
      });
    }
    const result = publicError(error);
    return send(res, result.status, result.body);
  }
}
