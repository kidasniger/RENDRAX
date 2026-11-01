import { randomUUID } from 'node:crypto';
import { b2Delete, b2Put, b2Head, isB2NotFound } from '../lib/b2-storage.js';
import { readBody, sameOrigin, send, validJobId, verifyGitHubActionsRequest, publicError } from '../lib/kidas-server.js';

async function diagnoseDeletePermission(res) {
  const key = `diagnostics/delete-permission/${randomUUID()}.txt`;
  let objectCreated = false;

  try {
    await b2Put(key, Buffer.from('RENDRAX B2 delete-permission diagnostic'), {
      contentType: 'text/plain'
    });
    objectCreated = true;

    await b2Delete([key]);

    try {
      await b2Head(key);
      return send(res, 200, {
        success: true,
        deletePermission: false,
        verified: true,
        message: 'La requête de suppression a été acceptée, mais le fichier de test existe toujours.'
      });
    } catch (error) {
      if (isB2NotFound(error)) {
        objectCreated = false;
        return send(res, 200, {
          success: true,
          deletePermission: true,
          verified: true,
          message: 'La création puis la suppression du fichier de test ont été vérifiées.'
        });
      }
      throw error;
    }
  } catch (error) {
    const code = String(error?.Code || error?.code || error?.name || 'UNKNOWN');
    const permissionDenied = /accessdenied|forbidden|unauthorized/i.test(code) ||
      error?.$metadata?.httpStatusCode === 403;

    if (objectCreated) {
      try {
        await b2Delete([key]);
      } catch {
        // A failed diagnostic can leave only its uniquely named test object.
      }
    }

    return send(res, 200, {
      success: false,
      deletePermission: false,
      verified: true,
      errorCode: permissionDenied ? 'ACCESS_DENIED' : 'B2_OPERATION_FAILED',
      message: permissionDenied
        ? 'Backblaze refuse la suppression avec les identifiants utilisés par le serveur.'
        : 'Le test Backblaze a échoué. Les journaux serveur contiennent le détail technique.'
    });
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Cette action n’est pas autorisée.' });
  const body = readBody(req);
  const { id, run_id: runId, type_fichier: typeFichier = 'html' } = body;

  if (body.diagnostic === true) {
    if (!sameOrigin(req)) return send(res, 403, { error: 'Cette demande a été refusée.' });
    return diagnoseDeletePermission(res);
  }

  if (!validJobId(id)) return send(res, 400, { error: 'Fichier temporaire non reconnu.' });
  if (!['html', 'zip'].includes(typeFichier)) return send(res, 400, { error: 'Format de fichier non accepté.' });

  try {
    if (!sameOrigin(req)) {
      await verifyGitHubActionsRequest(req, runId);
    }
    await b2Delete([ `incoming/${id}.${typeFichier}`, `progress/${id}.json` ]);
    return send(res, 200, { success: true });
  } catch (error) {
    const result = publicError(error);
    return send(res, result.status, result.body);
  }
}
