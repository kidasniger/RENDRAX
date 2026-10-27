import { del } from '@vercel/blob';
import {
  githubRequest, readBody, sameOrigin, send, validJobId, validOwnerToken,
  verifyOwnerToken, publicError
} from '../lib/kidas-server.js';

const REPOSITORY = 'kidasniger/RENDRAX';
const RENDER_WORKFLOW = 'render.yml';
const VIDEO_ARTIFACT_NAME = 'video-mp4';
const OUTPUT_TYPES = ['mp4', 'png', 'jpeg', 'webp'];

async function deleteIfExists(pathname) {
  try {
    await del(pathname);
  } catch (error) {
    const status = Number(error?.status || error?.statusCode);
    if (status !== 404) throw error;
  }
}

async function deleteOutputs(id) {
  for (const ext of OUTPUT_TYPES) await deleteIfExists(`outputs/${id}.${ext}`);
}
const RUNS_PAGE_SIZE = 100;
const MAX_RUN_PAGES = 20;

async function findRenderRun(id) {
  for (let page = 1; page <= MAX_RUN_PAGES; page += 1) {
    const { data } = await githubRequest(
      `/repos/${REPOSITORY}/actions/workflows/${RENDER_WORKFLOW}/runs?event=workflow_dispatch&branch=main&per_page=${RUNS_PAGE_SIZE}&page=${page}`
    );
    const runs = Array.isArray(data?.workflow_runs) ? data.workflow_runs : [];
    const match = runs.find(run =>
      run.display_title === `Rendu ${id}` &&
      run.path === `.github/workflows/${RENDER_WORKFLOW}`
    );
    if (match) return match;
    if (runs.length < RUNS_PAGE_SIZE) return null;
  }
  return null;
}

async function deleteVideoArtifact(runId) {
  const { data } = await githubRequest(
    `/repos/${REPOSITORY}/actions/runs/${runId}/artifacts?per_page=100`
  );
  const artifacts = Array.isArray(data?.artifacts) ? data.artifacts : [];
  let removed = 0;
  for (const artifact of artifacts) {
    if (artifact.name !== VIDEO_ARTIFACT_NAME) continue;
    try {
      await githubRequest(
        `/repos/${REPOSITORY}/actions/artifacts/${artifact.id}`,
        { method: 'DELETE' }
      );
      removed += 1;
    } catch (error) {
      if (error.status !== 404 && error.status !== 410) throw error;
    }
  }
  return removed;
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
    if (!owner) return send(res, 404, { error: 'Vidéo introuvable ou accès refusé.' });

    const run = await findRenderRun(id);
    const artifactsRemoved = run ? await deleteVideoArtifact(run.id) : 0;
    await deleteOutputs(id);
    await deleteIfExists(`incoming/${id}.html`);
    await deleteIfExists(`owners/${id}.json`);

    return send(res, 200, {
      success: true,
      artifactsRemoved,
      videoRemoved: true,
      ownerRecordRemoved: true
    });
  } catch (error) {
    const result = publicError(error);
    return send(res, result.status, result.body);
  }
}
