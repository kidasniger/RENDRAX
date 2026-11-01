import { GetBucketCorsCommand } from '@aws-sdk/client-s3';
import { b2Client, b2Bucket } from '../lib/b2-storage.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  try {
    const result = await b2Client().send(new GetBucketCorsCommand({
      Bucket: b2Bucket()
    }));
    return res.status(200).json({ corsRules: result.CORSRules || [] });
  } catch (error) {
    const status = error?.$metadata?.httpStatusCode || 500;
    return res.status(status).json({
      error: error?.name || 'B2CorsReadError',
      message: String(error?.message || 'Unable to read bucket CORS configuration.').slice(0, 300),
      status
    });
  }
}
