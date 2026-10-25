import { send } from '../lib/kidas-server.js';

const REPOSITORY = 'kidasniger/RENDRAX';

// Les vidéos sont publiées dans des GitHub Releases publiques. Tant que RENDRAX
// ne dispose pas d'une preuve de propriété par vidéo, une suppression anonyme
// pourrait effacer le résultat d'un autre utilisateur. Refuser par défaut.
export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Méthode non autorisée.' });
  return send(res, 503, {
    error: 'La suppression est temporairement désactivée : les vidéos ne sont pas encore associées à un propriétaire vérifié. Cette protection évite de supprimer le résultat d’un autre utilisateur.'
  });
}
