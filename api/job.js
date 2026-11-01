import { b2GetJson, b2Put, isB2NotFound } from '../lib/b2-storage.js';
import { githubRequest, readBody, send, validJobId, verifyGitHubActionsRequest, publicError } from '../lib/kidas-server.js';

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
    let progress;
    try { progress = await b2GetJson(`progress/${id}.json`); }
    catch (error) { if (isB2NotFound(error)) return null; throw error; }
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
  if (req.method === 'POST') {
    const { id, run_id: runId, current, total, phase } = readBody(req);
    if (!validJobId(id) || !/^\d{1,20}$/.test(String(runId || ''))) {
      return send(res, 400, { error: 'Création non reconnue.' });
    }

    const currentFrame = Number(current);
    const totalFrames = Number(total);
    if (!Number.isSafeInteger(currentFrame) || currentFrame < 0 ||
        !Number.isSafeInteger(totalFrames) || totalFrames < 0 ||
        (totalFrames > 0 && currentFrame > totalFrames) ||
        !['rendu', 'temps_reel', 'assemblage'].includes(phase)) {
      return send(res, 400, { error: 'Les informations d’avancement sont incorrectes.' });
    }

    try {
      await verifyGitHubActionsRequest(req, runId);
      await b2Put(`progress/${id}.json`, JSON.stringify({
        current: currentFrame,
        total: totalFrames,
        phase,
        updatedAt: Date.now()
      }), {
        contentType: 'application/json; charset=utf-8',
        cacheControl: 'private, no-store'
      });
      return send(res, 200, { success: true });
    } catch (error) {
      const result = publicError(error);
      return send(res, result.status, result.body);
    }
  }

  if (req.method !== 'GET') return send(res, 405, { error: 'Cette action n’est pas autorisée.' });
  const id = String(req.query?.id || '');
  if (!validJobId(id)) return send(res, 400, { error: 'Création non reconnue.' });
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
      let metadata = null;
      try { metadata = await b2GetJson(`video-meta/${id}.json`); }
      catch (error) { if (!isB2NotFound(error)) throw error; }
      if (metadata) {
        if (metadata.id === id && Date.parse(metadata.expires_at) > Date.now()) {
          result.release = {
            id,
            tag_name: id,
            name: metadata.name,
            created_at: metadata.created_at,
            expires_at: metadata.expires_at,
            assets: [{
              name: `${metadata.name || 'video'}.mp4`,
              size: metadata.size,
              browser_download_url: `/d/${id}`,
              thumbnail_url: `/api/videos?action=thumbnail&id=${id}`
            }]
          };
        }
      }
    }
    return send(res, 200, result);
  } catch (error) {
    const result = publicError(error);
    return send(res, result.status, result.body);
  }
}
