import { randomUUID } from 'node:crypto';
import { b2Put, b2Delete, b2Head, isB2NotFound } from '../lib/b2-storage.js';
import { sameOrigin, send } from '../lib/kidas-server.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return send(res, 405, { success: false, error: 'Méthode non autorisée.' });
  }
  if (!sameOrigin(req)) {
    return send(res, 403, { success: false, error: 'Origine non autorisée.' });
  }

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
        message: 'Backblaze a accepté la requête, mais le fichier de test existe toujours.'
      });
    } catch (error) {
      if (isB2NotFound(error)) {
        objectCreated = false;
        return send(res, 200, {
          success: true,
          deletePermission: true,
          verified: true,
          message: 'La création et la suppression d’un fichier de test ont été vérifiées.'
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
        objectCreated = false;
      } catch {
        // The diagnostic object is isolated under diagnostics/delete-permission/.
      }
    }

    return send(res, 200, {
      success: false,
      deletePermission: false,
      verified: true,
      errorCode: permissionDenied ? 'ACCESS_DENIED' : 'B2_OPERATION_FAILED',
      message: permissionDenied
        ? 'Backblaze refuse la suppression avec les identifiants actuellement utilisés par Vercel.'
        : 'Le test Backblaze a échoué. Consulte les journaux Vercel pour le détail technique.'
    });
  }
}
