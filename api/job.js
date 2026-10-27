import { head } from '@vercel/blob';
import {
  githubRequest, isMediaAsset, readOwnerRecord, send, validJobId,
  validOwnerToken, verifyOwnerToken, publicError
} from '../lib/kidas-server.js';

function releaseSummary(release) {
  return {
    id: release.id,
    tag_name: release.tag_name,
    name: release.name,
    created_at: release.created_at,
    html_url: release.html_url,
    assets: (release.assets || [])
      .filter(asset => isMediaAsset(asset.name))
      .map(asset => ({
        name: asset.name,
        size: asset.size,
        browser_download_url: asset.browser_download_url
      }))
  };
}

function privateOutputSummary(id, owner, metadata, ownerToken, runUrl) {
  const output = String(owner.output || 'mp4');
  const ext = output;
  const filename = `${owner.name || 'RENDRAX'}.${ext}`;
  return {
    id,
    tag_name: id,
    name: owner.name || 'RENDRAX',
    created_at: owner.createdAt || new Date().toISOString(),
    html_url: runUrl || '',
    private: true,
    ownerToken,
    assets: [{
      name: filename,
      size: Number(metadata.size) || 0,
      browser_download_url: `/api/video?id=${encodeURIComponent(id)}&ownerToken=${encodeURIComponent(ownerToken)}`
    }]
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'Méthode non autorisée.' });
  const id = String(req.query?.id || '');
  const ownerToken = String(req.query?.ownerToken || '');
  if (!validJobId(id)) return send(res, 400, { error: 'Identifiant de rendu invalide.' });

  try {
    let owner = null;
    if (ownerToken) {
      if (!validOwnerToken(ownerToken)) return send(res, 403, { error: 'Clé privée invalide.' });
      owner = await verifyOwnerToken(id, ownerToken);
      if (!owner) return send(res, 403, { error: 'Cette tâche ne vous appartient pas.' });
    } else {
      owner = await readOwnerRecord(id);
      if (owner) return send(res, 403, { error: 'Une clé privée est requise pour suivre ce rendu.' });
    }

    const runs = await githubRequest('/repos/kidasniger/RENDRAX/actions/runs?event=workflow_dispatch&per_page=100');
    const run = (runs.data.workflow_runs || []).find(item =>
      item.display_title === `Rendu ${id}` && item.path === '.github/workflows/render.yml'
    );
    if (!run) return send(res, 200, { found: false });
    const result = {
      found: true,
      runId: run.id,
      status: run.status,
      conclusion: run.conclusion,
      html_url: run.html_url,
      release: null
    };

    if (req.query?.details === '1' || (run.status === 'completed' && run.conclusion !== 'success')) {
      try {
        const response = await githubRequest(`/repos/kidasniger/RENDRAX/actions/runs/${run.id}/jobs?per_page=20`);
        const jobs = Array.isArray(response.data?.jobs) ? response.data.jobs : [];
        const activeJob = jobs.find(item => item.status === 'in_progress') ||
          jobs.find(item => item.conclusion === 'failure') || jobs[0];
        if (activeJob && Array.isArray(activeJob.steps)) {
          const step = activeJob.steps.find(item => item.status === 'in_progress') ||
            activeJob.steps.find(item => item.conclusion === 'failure') ||
            (run.status === 'completed' ? activeJob.steps.find(item => item.conclusion === 'cancelled') : null);
          if (step) {
            result.currentStep = step.name;
            result.currentStepStatus = step.status;
            result.stepConclusion = step.conclusion;
          }
        }
      } catch (detailsError) {
        console.warn('[RENDRAX job details]', detailsError?.status || detailsError?.name || 'error');
      }
    }

    if (run.status === 'completed' && run.conclusion === 'success') {
      if (owner) {
        const output = String(owner.output || 'mp4');
        const metadata = await head(`outputs/${id}.${output}`);
        result.release = privateOutputSummary(id, owner, metadata, ownerToken, run.html_url);
      } else {
        try {
          const release = await githubRequest(`/repos/kidasniger/RENDRAX/releases/tags/${encodeURIComponent(id)}`);
          result.release = releaseSummary(release.data);
        } catch (error) {
          if (error.status !== 404) throw error;
        }
      }
    }
    return send(res, 200, result);
  } catch (error) {
    const result = publicError(error);
    return send(res, result.status, result.body);
  }
}
