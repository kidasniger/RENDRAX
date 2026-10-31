import { get } from '@vercel/blob';
import { Readable } from 'node:stream';
import { publicError, send, validJobId, verifyGitHubActionsRequest } from '../lib/kidas-server.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'Cette action n’est pas autorisée.' });
  const id = String(req.query?.id || '');
  const runId = String(req.query?.run_id || '');
  const type = String(req.query?.type_fichier || 'html');
  if (!['html', 'zip'].includes(type)) {
    return send(res, 400, { error: 'Format de fichier non accepté.' });
  }
  if (!validJobId(id) || !/^\d{1,20}$/.test(runId)) {
    return send(res, 400, { error: 'Fichier temporaire non reconnu.' });
  }

  try {
    await verifyGitHubActionsRequest(req, runId);
    const extension = type === 'zip' ? 'zip' : 'html';
    const result = await get(`incoming/${id}.${extension}`, { access: 'private' });
    if (!result || result.statusCode !== 200) {
      return send(res, 404, { error: 'Le fichier temporaire est introuvable ou a déjà été supprimé.' });
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', result.blob.contentType || (extension === 'zip' ? 'application/zip' : 'text/html; charset=utf-8'));
    res.setHeader('Content-Disposition', `attachment; filename="input.${extension}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const stream = Readable.fromWeb(result.stream);
    stream.on('error', error => {
      if (res.headersSent) res.destroy(error);
      else {
        const response = publicError(error);
        send(res, response.status, response.body);
      }
    });
    stream.pipe(res);
  } catch (error) {
    const response = publicError(error);
    return send(res, response.status, response.body);
  }
}
