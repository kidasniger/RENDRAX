import { send } from '../lib/kidas-server.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'Cette action n’est pas autorisée.' });
  const required = {
    KIDAS_GITHUB_TOKEN: process.env.KIDAS_GITHUB_TOKEN,
    B2_KEY_ID: process.env.B2_KEY_ID,
    B2_APPLICATION_KEY: process.env.B2_APPLICATION_KEY,
    B2_BUCKET_NAME: process.env.B2_BUCKET_NAME,
    B2_ENDPOINT: process.env.B2_ENDPOINT,
    B2_REGION: process.env.B2_REGION,
    TURNSTILE_SITE_KEY: process.env.TURNSTILE_SITE_KEY,
    TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY
  };
  const missing = Object.entries(required)
    .filter(([, value]) => !String(value || '').trim())
    .map(([name]) => name);
  const ready = missing.length === 0;
  const status = ready ? 'online' : (missing.length === Object.keys(required).length ? 'offline' : 'degraded');
  return send(res, 200, {
    ready,
    status,
    missing,
    turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || ''
  });
}
