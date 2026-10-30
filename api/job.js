import { get } from '@vercel/blob';
import { githubRequest, send, validJobId, publicError } from '../lib/kidas-server.js';

function releaseSummary(release) {
  return {
    id: release.id,
    tag_name: release.tag_name,
    name: release.name,
    created_at: release.created_at,
    html_url: release.html_url,
    assets: (release.assets || [])
      .filter(asset => asset.name.toLowerCase().endsWith('.mp4'))
      .map(asset => ({
        name: asset.name,
        size: asset.size,
        browser_download_url: asset.browser_download_url
      }))
  };
}

async function readProgress(id) {
  try {
    const result = await get(`progress/${id}.json`, { access: 'private' });
    if (!result || result.statusCode !== 200) return null;
    const progress = await new Response(result.stream).json();
    const current = Number(progress.current);
    const total = Number(progress.total);
    const phase = ['rendu', 'temps_reel', 'assemblage'].includes(progress.phase)
      ? progress.phase
      : null;
    if (!Number.isSafeInteger(current) || current < 0 ||
        !Number.isSafeInteger(total) || total < 0 || !phase ||
        (total > 0 && current > total)) return null;
    return {
      current,
      total,
      phase,
      percent: total > 0 ? Math.min(100, Math.floor((current / total) * 100)) : null,
      updatedAt: Number.isFinite(Number(progress.updatedAt)) ? Number(progress.updatedAt) : null
    };
  } catch (error) {
    console.warn('[RENDRAX progress]', error?.status || error?.name || 'error');
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'Méthode non autorisée.' });
  const id = String(req.query?.id || '');
  if (!validJobId(id)) return send(res, 400, { error: 'Identifiant de rendu invalide.' });
  try {
    const runs = await githubRequest('/repos/kidasniger/RENDRAX/actions/runs?event=workflow_dispatch&per_page=100');
    const run = (runs.data.workflow_runs || []).find(item => item.display_title === `Rendu ${id}`);
    if (!run) return send(res, 200, { found: false });
    const result = {
      found: true,
      runId: run.id,
      status: run.status,
      conclusion: run.conclusion,
      html_url: run.html_url,
      progress: null,
      release: null
    };

    if (run.status === 'in_progress' || run.status === 'queued') {
      result.progress = await readProgress(id);
    }

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
      try {
        const release = await githubRequest(`/repos/kidasniger/RENDRAX/releases/tags/${encodeURIComponent(id)}`);
        result.release = releaseSummary(release.data);
      } catch (error) {
        if (error.status !== 404) throw error;
      }
    }
    return send(res, 200, result);
  } catch (error) {
    const result = publicError(error);
    return send(res, result.status, result.body);
  }
}
