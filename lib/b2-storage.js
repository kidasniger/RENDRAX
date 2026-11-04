import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectVersionsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

let cachedClient;

function configuration() {
  const { B2_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET_NAME, B2_ENDPOINT, B2_REGION } = process.env;
  if (![B2_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET_NAME, B2_ENDPOINT, B2_REGION].every(value => typeof value === 'string' && value.trim())) {
    const error = new Error('Le stockage Backblaze B2 n’est pas encore configuré.');
    error.status = 503;
    throw error;
  }
  let endpoint;
  try { endpoint = new URL(B2_ENDPOINT); } catch {
    const error = new Error('La configuration du stockage Backblaze B2 est incorrecte.');
    error.status = 503;
    throw error;
  }
  if (endpoint.protocol !== 'https:' || !endpoint.hostname.endsWith('.backblazeb2.com')) {
    const error = new Error('Le point de terminaison Backblaze B2 est invalide.');
    error.status = 503;
    throw error;
  }
  return { B2_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET_NAME, B2_ENDPOINT: endpoint.origin, B2_REGION };
}

export function b2Client() {
  if (cachedClient) return cachedClient;
  const config = configuration();
  cachedClient = new S3Client({
    region: config.B2_REGION,
    endpoint: config.B2_ENDPOINT,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.B2_KEY_ID,
      secretAccessKey: config.B2_APPLICATION_KEY
    },
    maxAttempts: 3
  });
  return cachedClient;
}

export function b2Bucket() {
  return configuration().B2_BUCKET_NAME;
}

export function isB2NotFound(error) {
  return error?.name === 'NoSuchKey' || error?.name === 'NotFound' ||
    error?.$metadata?.httpStatusCode === 404 || error?.Code === 'NoSuchKey';
}

export async function b2Put(key, body, { contentType = 'application/octet-stream', cacheControl = 'private, no-store' } = {}) {
  return b2Client().send(new PutObjectCommand({
    Bucket: b2Bucket(),
    Key: key,
    Body: body,
    ContentType: contentType,
    CacheControl: cacheControl
  }));
}

export async function b2Get(key) {
  return b2Client().send(new GetObjectCommand({ Bucket: b2Bucket(), Key: key }));
}

export async function b2GetJson(key) {
  const result = await b2Get(key);
  const raw = await result.Body.transformToString();
  return JSON.parse(raw);
}

export async function b2Head(key) {
  const result = await b2Client().send(new HeadObjectCommand({ Bucket: b2Bucket(), Key: key }));
  return {
    size: Number(result.ContentLength || 0),
    contentType: result.ContentType || 'application/octet-stream',
    lastModified: result.LastModified || null,
    etag: result.ETag || null
  };
}

// Backblaze B2 is versioned: a plain delete only adds a "hide" marker and the
// old bytes stay stored. List every version (and marker) of each key and delete
// them by VersionId so the files are removed permanently, right away.
async function b2VersionsOf(key) {
  const found = [];
  let keyMarker;
  let versionIdMarker;
  do {
    const page = await b2Client().send(new ListObjectVersionsCommand({
      Bucket: b2Bucket(),
      Prefix: key,
      KeyMarker: keyMarker,
      VersionIdMarker: versionIdMarker,
      MaxKeys: 1000
    }));
    for (const item of [...(page.Versions || []), ...(page.DeleteMarkers || [])]) {
      if (item.Key === key) found.push({ Key: item.Key, VersionId: item.VersionId });
    }
    keyMarker = page.IsTruncated ? page.NextKeyMarker : undefined;
    versionIdMarker = page.IsTruncated ? page.NextVersionIdMarker : undefined;
  } while (keyMarker);
  return found;
}

export async function b2Delete(keys) {
  const values = (Array.isArray(keys) ? keys : [keys]).filter(value => typeof value === 'string' && value);
  const objects = (await Promise.all(values.map(b2VersionsOf))).flat();
  for (let offset = 0; offset < objects.length; offset += 1000) {
    const chunk = objects.slice(offset, offset + 1000);
    const result = await b2Client().send(new DeleteObjectsCommand({
      Bucket: b2Bucket(),
      Delete: { Objects: chunk, Quiet: true }
    }));
    if (result.Errors?.length) {
      const error = new Error('Backblaze B2 n’a pas pu supprimer tous les fichiers.');
      error.status = 502;
      throw error;
    }
  }
}

export async function b2List({ prefix, continuationToken, maxKeys = 1000 } = {}) {
  const result = await b2Client().send(new ListObjectsV2Command({
    Bucket: b2Bucket(),
    Prefix: prefix,
    ContinuationToken: continuationToken,
    MaxKeys: Math.min(1000, Math.max(1, maxKeys))
  }));
  return {
    objects: (result.Contents || []).map(item => ({
      key: item.Key,
      size: Number(item.Size || 0),
      lastModified: item.LastModified || null
    })),
    continuationToken: result.NextContinuationToken,
    hasMore: Boolean(result.IsTruncated)
  };
}

export async function b2PresignPut(key, contentType, contentLength, expiresIn = 600) {
  // The browser controls Content-Length and does not allow JavaScript to set it.
  // Keep the size check in /api/upload-check after the PUT instead of signing
  // this browser-managed header into the presigned request.
  if (!Number.isSafeInteger(contentLength) || contentLength < 1) {
    throw new Error('Taille de fichier invalide pour le transfert.');
  }
  return getSignedUrl(b2Client(), new PutObjectCommand({
    Bucket: b2Bucket(),
    Key: key,
    ContentType: contentType
  }), { expiresIn });
}

export async function b2PresignGet(key, expiresIn = 300, responseContentDisposition = null) {
  return getSignedUrl(b2Client(), new GetObjectCommand({
    Bucket: b2Bucket(),
    Key: key,
    ...(responseContentDisposition ? { ResponseContentDisposition: responseContentDisposition } : {})
  }), { expiresIn });
}
