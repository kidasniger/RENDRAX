import { head } from '@vercel/blob';
import {
  githubRequest, send, validJobId, verifyOwnerToken, publicError
} from '../lib/kidas-server.js';

function privateVideoSummary(id, owner, metadata, ownerToken, runUrl) {
  const outputType = ['mp4', 'png', 'jpeg', 'webp'].includes(owner.output) ? owner.output : 'mp4';
  const filename = `${owner.name || 'RENDRAX'}.${outputType}`;
  return {
    id,
    tag_name: id,
    name: owner.name || 'RENDRAX',
    created_at: owner.createdAt || new Date().toISOString(),
    html_url: runUrl || '',
    assets: [{
      name: filename,
      size: Number(metadata.size) || 0,
      browser_download_url: `/api/video?id=${encodeURIComponent(id)}&ownerToken=${encodeURIComponent(ownerToken)}&output=${encodeURIComponent(outputType)}`
    }]
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'Méthode non autorisée.' });
  const id = String(req.query?.id || '');
  const ownerToken = String(req.query?.ownerToken || '');
  if (!validJobId(id)) return send(res, 400, { error: 'Identifiant de rendu invalide.' });

  try {
    if (!await verifyOwnerToken(id, ownerToken)) {
      return send(res, 403, { error: 'Clé privée invalide pour cette vidéo.' });
    }
    const runs = await githubRequest('/repos/kidasniger/RENDRAX/actions/runs?event=workflow_dispatch&per_page=100');
    const run = (runs.data.workflow_runs || []).find(item => item.display_title === `Rendu ${id}`);
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
      const owner = await verifyOwnerToken(id, ownerToken);
      if (!owner) return send(res, 403, { error: 'Clé privée invalide pour cette vidéo.' });
      const outputType = ['mp4', 'png', 'jpeg', 'webp'].includes(owner.output) ? owner.output : 'mp4';
      const output = await head(`outputs/${id}.${outputType}`);
      result.release = privateVideoSummary(id, owner, output, ownerToken, run.html_url);
    }
    return send(res, 200, result);
  } catch (error) {
    const result = publicError(error);
    return send(res, result.status, result.body);
  }
}
