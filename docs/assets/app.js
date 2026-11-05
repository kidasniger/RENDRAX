(function(){
  var root = document.documentElement;
  var done = function(){
    root.classList.add('rdx-ready');
    if (fallbackTimer) clearTimeout(fallbackTimer);
    if (readyTimer) clearTimeout(readyTimer);
  };
  var fallbackTimer = null;
  var readyTimer = null;
  var visited = false;
  var reduceMotion = false;

  try {
    visited = localStorage.getItem('rdx-visited') === '1';
    localStorage.setItem('rdx-visited', '1');
  } catch (e) {}

  try {
    reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) {}

  if (visited || reduceMotion) {
    done();
    return;
  }

  if (document.readyState === 'complete') readyTimer = setTimeout(done, 600);
  else window.addEventListener('load', function(){ readyTimer = setTimeout(done, 600); }, { once:true });

  fallbackTimer = setTimeout(done, 2400);
})();

const API = '/api';

function rdxTrack(name, data = {}) {
  try { if (typeof window.va === 'function') window.va('event', { name, data }); } catch (error) {}
}
function rdxTrackFile(file, source = 'upload') {
  if (!file) return;
  const type = source === 'example' ? 'example' : file.name.toLowerCase().endsWith('.zip') ? 'zip' : 'html';
  const sizeBucket = file.size < 1048576 ? 'lt_1mb' : file.size < 10485760 ? '1_10mb' : 'gt_10mb';
  rdxTrack('file_selected', { type, size_bucket: sizeBucket });
}
document.addEventListener('change', event => {
  const target = event.target;
  if (target && ['mode','format','duration','watermark','loudnorm','audioOffset'].includes(target.id)) {
    rdxTrack('settings_changed', { setting: target.id });
  }
}, true);
document.addEventListener('click', event => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  if (target.closest('#go, #testRender, #rdx-paste-create')) rdxTrack('render_started');
  if (target.closest('#res a[download], #rdxPlayerDownload')) rdxTrack('download_started');
}, true);

const MODES = {
  full: { scale: '1', test: '0' },
  half: { scale: '0.5', test: '0' },
  test: { scale: '0.5', test: '10' }
};
const MAX_BYTES = 50e6;
const MAX_ZIP_ENTRIES = 2000;
const MAX_ZIP_UNCOMPRESSED_BYTES = 250e6;
const MAX_ZIP_LIST_ITEMS = 500;
const JSZIP_CDN = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
const $ = s => document.querySelector(s);
window.RDXButton = {
  create({ label, variant = 'secondary', size = 'md', type = 'button', disabled = false } = {}) {
    const button = document.createElement('button');
    button.type = type;
    button.className = 'rdx-btn rdx-btn--' + variant + (size !== 'md' ? ' rdx-btn--' + size : '');
    button.textContent = String(label || '');
    button.disabled = Boolean(disabled);
    return button;
  },
  setLoading(button, loading, label) {
    if (!button) return;
    if (loading) {
      if (!button.dataset.rdxOriginalLabel) button.dataset.rdxOriginalLabel = button.textContent;
      button.dataset.loading = 'true';
      button.setAttribute('aria-busy', 'true');
      button.disabled = true;
      if (label) button.textContent = label;
    } else {
      delete button.dataset.loading;
      button.removeAttribute('aria-busy');
      button.disabled = false;
      if (button.dataset.rdxOriginalLabel) button.textContent = button.dataset.rdxOriginalLabel;
      delete button.dataset.rdxOriginalLabel;
    }
  }
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const mmss = ms => { const s = Math.floor(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const size = n => n >= 1048576 ? (n / 1048576).toFixed(1) + ' Mo' : Math.max(1, Math.round(n / 1024)) + ' Ko';
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} }
};

const PREFS_KEY = 'rendrax_prefs';
const PREFS_ALLOWED = {
  mode: ['full', 'half', 'test'],
  format: ['auto', 'portrait', 'landscape', 'square'],
  duration: ['0', '10', '30', '60', '120', '300']
};
function readRenderPrefs() {
  const raw = store.get(PREFS_KEY);
  if (!raw) return;
  let prefs;
  try { prefs = JSON.parse(raw); } catch (e) { return; }
  if (!prefs || typeof prefs !== 'object' || Array.isArray(prefs)) return;
  for (const key of Object.keys(PREFS_ALLOWED)) {
    if (PREFS_ALLOWED[key].includes(prefs[key])) $('#' + key).value = prefs[key];
  }
  if (typeof prefs.watermark === 'boolean') $('#watermark').checked = prefs.watermark;
  if (typeof prefs.loudnorm === 'boolean') $('#loudnorm').checked = prefs.loudnorm;
  setAdvancedSettings(prefs.advanced === true, false);
  updateRenderPrefsMemory(prefs.savedAt || null);
}
function updateRenderPrefsMemory(savedAt) {
  const output = $('#renderPrefsMemory');
  if (!output) return;
  if (!savedAt) {
    output.textContent = 'Aucun réglage personnalisé mémorisé.';
    return;
  }
  const date = new Date(savedAt);
  const dateLabel = Number.isNaN(date.getTime())
    ? 'date non disponible'
    : new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  output.textContent = 'Réglages mémorisés sur cet appareil · ' + dateLabel;
}
function saveRenderPrefs() {
  const savedAt = new Date().toISOString();
  store.set(PREFS_KEY, JSON.stringify({
    mode: $('#mode').value,
    format: $('#format').value,
    duration: $('#duration').value,
    watermark: $('#watermark').checked,
    loudnorm: $('#loudnorm').checked,
    advanced: $('#advancedSettingsToggle').getAttribute('aria-expanded') === 'true',
    savedAt
  }));
  updateRenderPrefsMemory(savedAt);
}
function updateAdvancedSettingsSummary() {
  const summary = $('#advancedSettingsSummary');
  const text = $('#advancedSettingsSummaryText');
  const dot = summary && summary.querySelector('.advanced-settings-dot');
  if (!summary || !text || !dot) return;
  const formatLabels = { auto: 'Auto', portrait: 'Portrait', landscape: 'Paysage', square: 'Carré' };
  const durationLabels = { '0': 'Auto', '10': '10 s', '30': '30 s', '60': '60 s', '120': '2 min', '300': '5 min' };
  const format = $('#format').value;
  const duration = $('#duration').value;
  const offset = Number($('#audioOffset').value) || 0;
  const loudnorm = $('#loudnorm').checked;
  text.textContent = (formatLabels[format] || 'Auto') + ' · ' +
    (durationLabels[duration] || 'Auto') + ' · Son ' + offset + ' ms · ' +
    (loudnorm ? 'Volume égalisé' : 'Volume non égalisé');
  const changed = format !== 'auto' || duration !== '0' || offset !== 0 || !loudnorm;
  dot.hidden = !changed;
  summary.classList.toggle('has-changes', changed);
  summary.setAttribute('aria-label', text.textContent + (changed ? ' · Réglages modifiés' : ' · Valeurs par défaut'));
}
function setAdvancedSettings(expanded, persist = true) {
  const toggle = $('#advancedSettingsToggle');
  const panel = $('#advancedSettings');
  toggle.setAttribute('aria-expanded', String(expanded));
  panel.hidden = !expanded;
  toggle.textContent = expanded ? 'Masquer les réglages avancés' : 'Réglages avancés';
  if (persist) saveRenderPrefs();
  updateAdvancedSettingsSummary();
}
function initAdvancedSettings() {
  initContextualHelp();
  $('#audioOffset').addEventListener('input', updateAdvancedSettingsSummary);
  $('#audioOffset').addEventListener('change', () => { saveRenderPrefs(); updateAdvancedSettingsSummary(); });
  ['format', 'duration', 'loudnorm'].forEach(id => $('#' + id).addEventListener('change', updateAdvancedSettingsSummary));
  updateAdvancedSettingsSummary();
  $('#advancedSettingsToggle').addEventListener('click', () => {
    const expanded = $('#advancedSettingsToggle').getAttribute('aria-expanded') === 'true';
    setAdvancedSettings(!expanded);
  });
}
function initModeCards() {
  const select = $('#mode'), group = $('#modeCards');
  const cards = [...group.querySelectorAll('[role="radio"]')];
  function sync(focusSelected) {
    cards.forEach(card => {
      const selected = card.dataset.mode === select.value;
      card.setAttribute('aria-checked', String(selected));
      card.tabIndex = selected ? 0 : -1;
      card.classList.toggle('is-selected', selected);
      if (selected && focusSelected) card.focus();
    });
  }
  function choose(card, moveFocus = false) {
    if (!card || !cards.includes(card)) return;
    select.value = card.dataset.mode;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    sync(moveFocus);
  }
  cards.forEach((card, index) => {
    card.addEventListener('click', () => choose(card));
    card.addEventListener('keydown', event => {
      let target = index;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') target = (index + 1) % cards.length;
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') target = (index - 1 + cards.length) % cards.length;
      else if (event.key === 'Home') target = 0;
      else if (event.key === 'End') target = cards.length - 1;
      else if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); choose(card); return; }
      else return;
      event.preventDefault();
      choose(cards[target], true);
    });
  });
  select.addEventListener('change', () => { sync(false); updateRenderEstimate(); });
  sync(false);
}

const USAGE_PRESETS = {
  social: { mode: 'full', format: 'portrait', duration: '0' },
  youtube: { mode: 'full', format: 'landscape', duration: '0' },
  preview: { mode: 'test', format: 'portrait', duration: '10' }
};
function syncUsagePresets() {
  const mode = $('#mode').value;
  const format = $('#format').value;
  const duration = $('#duration').value;
  document.querySelectorAll('[data-preset]').forEach(button => {
    const preset = USAGE_PRESETS[button.dataset.preset];
    const selected = !!preset && preset.mode === mode && preset.format === format && preset.duration === duration;
    button.setAttribute('aria-pressed', String(selected));
  });
}
function initUsagePresets() {
  document.querySelectorAll('[data-preset]').forEach(button => {
    button.addEventListener('click', () => {
      const preset = USAGE_PRESETS[button.dataset.preset];
      if (!preset) return;
      [['mode', preset.mode], ['format', preset.format], ['duration', preset.duration]].forEach(([id, value]) => {
        const control = $('#' + id);
        control.value = value;
        control.dispatchEvent(new Event('change', { bubbles: true }));
      });
      syncUsagePresets();
    });
  });
  ['mode', 'format', 'duration'].forEach(id => $('#' + id).addEventListener('change', syncUsagePresets));
  syncUsagePresets();
}
function getEstimateProfile(source) {
  if (!source) return 'generic';
  if (source.includes('const [t,setT]=useState(0),') &&
      /[.#]stage\s*\{/.test(source) && /\bAUD\s*=\s*'data:audio\//.test(source) &&
      /\bD\s*=\s*\d/.test(source)) return 'kidas';
  if (source.includes('function render(t)') && source.includes('(function loop(){let t=') &&
      source.includes('const IM=') && /"voice"\s*:\s*"[A-Za-z0-9+\/=]{1000,}"/.test(source)) return 'editpro';
  if (source.includes('window.__video') && /\bseek\s*\(/.test(source) &&
      /<audio\b[^>]*\ssrc=["']data:audio\//i.test(source) && /\bDUR\s*=/.test(source)) return 'voicevideo';
  if (source.includes('function render(t)') && /atob\(\s*VOICE\s*\)/.test(source) &&
      /function\s+music\s*\(/.test(source) && /function\s+go\s*\(/.test(source) &&
      /\(function\s+lp\s*\(\)\s*\{/.test(source) && /\bconst\s+D\s*=\s*\d/.test(source) &&
      /\bvP\s*=/.test(source) && /\bmP\s*=/.test(source)) return 'musicpro';
  if (/<audio\b[^>]*\bsrc=["']data:audio\/[a-z0-9.+-]+;base64,/i.test(source) &&
      /\b(?:const\s+T\s*=\s*\[\s*\d|const\s+D\s*=\s*\d)/.test(source) &&
      /\bSUB\s*=/.test(source) && /\btl\s*=\s*gsap\.timeline\(\s*\{\s*paused\s*:\s*true\s*\}\s*\)/.test(source) &&
      /\btl\.time\([^;]*?,\s*false\s*\)/.test(source) &&
      /\bstarted\s*\?\s*a\.currentTime|\bif\s*\(\s*started\s*\)\s*\{[\s\S]{0,1200}?\ba\.currentTime\b/.test(source) &&
      /requestAnimationFrame\s*\(\s*lp\s*\)/.test(source) &&
      /[.#]st\s*\{[^}]*?width:\s*\d+px;\s*height:\s*\d+px/.test(source)) return 'gsapvideo';
  return 'generic';
}
function getDetectedDuration(source, profile) {
  const readNumber = pattern => {
    const match = source.match(pattern);
    return match ? Number(match[1]) : 0;
  };
  let seconds = 0;
  if (profile === 'voicevideo') seconds = readNumber(/\bDUR\s*=\s*(\d+(?:\.\d+)?)/);
  else if (profile === 'editpro') seconds = readNumber(/if\s*\(\s*t\s*>=\s*(\d+(?:\.\d+)?)/);
  else if (profile === 'kidas' || profile === 'musicpro') seconds = readNumber(/\bD\s*=\s*(\d+(?:\.\d+)?)/);
  else if (profile === 'gsapvideo') {
    seconds = readNumber(/\bD\s*=\s*(\d+(?:\.\d+)?)/);
    if (!seconds) {
      const timeline = source.match(/\b(?:const|let|var)\s+T\s*=\s*\[([^\]]+)\]/);
      if (timeline) {
        const values = timeline[1].match(/\d+(?:\.\d+)?/g) || [];
        seconds = values.length ? Number(values[values.length - 1]) : 0;
      }
    }
  }
  if (!seconds) {
    seconds = readNumber(/\b(?:const|let|var)\s+(?:D|DUR|DURATION|TOTAL|TOTAL_DURATION|VIDEO_DURATION)\s*=\s*(\d+(?:\.\d+)?)/i);
  }
  return Number.isFinite(seconds) && seconds >= 2 && seconds <= 900 ? seconds : 60;
}
function updatePreRenderSummary() {
  const output = $('#preRenderSummary');
  if (!output) return;
  const file = $('#file').files[0];
  const isZip = !!(file && /\.zip$/i.test(file.name));
  const fileName = isZip && zipSelection && zipSelection.mainPath
    ? zipSelection.mainPath.split('/').pop()
    : file ? file.name : 'en attente';
  const formats = { auto: 'Automatique', portrait: 'Portrait 9:16', landscape: 'Paysage 16:9', square: 'Carré 1:1' };
  const qualities = { full: 'Complète', half: 'Allégée', test: 'Aperçu 10 s' };
  const estimate = ($('#renderEstimate').textContent.match(/Durée estimée\s*:\s*(.*?)(?:\s*·|$)/) || [])[1] || '—';
  output.textContent = 'Fichier : ' + fileName + ' · Format : ' + (formats[$('#format').value] || 'Automatique') +
    ' · Qualité : ' + (qualities[$('#mode').value] || 'Complète') + ' · Durée estimée : ' + estimate;
}
function updateRenderEstimate() {
  const output = $('#renderEstimate');
  if (!output) return;
  const source = zipSelection && zipSelection.mainText ? zipSelection.mainText : fileText;
  if (!source || !source.trim()) {
    output.textContent = 'Durée estimée : en attente du fichier · Poids : —';
    updatePreRenderSummary();
    return;
  }
  const profile = getEstimateProfile(source);
  const fps = profile === 'generic' ? 30 : 60;
  let seconds = getDetectedDuration(source, profile);
  const maximum = Number($('#duration').value);
  if (maximum > 0) seconds = Math.min(seconds, maximum);
  const mode = $('#mode').value;
  if (mode === 'test') seconds = Math.min(seconds, 10);
  const scale = mode === 'full' ? 1 : 0.5;
  const frames = Math.max(1, Math.round(seconds * fps));
  const estimatedMinutes = Math.max(0.2, frames / (mode === 'full' ? 8 : 18) / 60);
  const videoBitrateMbps = mode === 'full' ? 4.5 : 1.8;
  const estimatedMegabytes = Math.max(0.1, seconds * (videoBitrateMbps * scale * scale + 0.192) / 8);
  const durationLabel = estimatedMinutes < 1
    ? Math.max(1, Math.round(estimatedMinutes * 60)) + ' s'
    : (estimatedMinutes < 10 ? estimatedMinutes.toFixed(1) : Math.round(estimatedMinutes)).toString().replace('.', ',') + ' min';
  const weightLabel = estimatedMegabytes < 1
    ? Math.max(1, Math.round(estimatedMegabytes * 1024)) + ' Ko'
    : estimatedMegabytes.toFixed(1).replace('.', ',') + ' Mo';
  output.textContent = 'Durée estimée : ~' + durationLabel + ' · Poids : ~' + weightLabel + ' · ' + fps + ' i/s auto';
  updatePreRenderSummary();
}
function initRenderPrefs() {
  readRenderPrefs();
  updateRenderEstimate();
  ['mode', 'format', 'duration', 'watermark', 'loudnorm'].forEach(id => {
    $('#' + id).addEventListener('change', () => { saveRenderPrefs(); updateRenderEstimate(); });
  });
  const dialog = $('#resetPrefsDialog');
  $('#resetRenderPrefs').addEventListener('click', () => {
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else status('La boîte de confirmation n’est pas prise en charge par ce navigateur.');
  });
  $('#cancelResetPrefs').addEventListener('click', () => dialog.close());
  $('#confirmResetPrefs').addEventListener('click', () => {
    resetRenderPrefsToDefaults();
    dialog.close();
  });
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
}
function resetRenderPrefsToDefaults() {
  $('#mode').value = 'full';
  $('#mode').dispatchEvent(new Event('change', { bubbles: true }));
  $('#format').value = 'auto';
  $('#format').dispatchEvent(new Event('change', { bubbles: true }));
  $('#duration').value = '0';
  $('#duration').dispatchEvent(new Event('change', { bubbles: true }));
  $('#watermark').checked = false;
  $('#watermark').dispatchEvent(new Event('change', { bubbles: true }));
  $('#loudnorm').checked = true;
  $('#loudnorm').dispatchEvent(new Event('change', { bubbles: true }));
  setAdvancedSettings(false, false);
  store.set(PREFS_KEY, null);
  updateRenderPrefsMemory(null);
  updateRenderEstimate();
  if (typeof syncUsagePresets === 'function') syncUsagePresets();
  if (typeof syncAudioOffsetControls === 'function') syncAudioOffsetControls();
}

let busy = false, cancelled = false, currentRunId = null, currentUploadXhr = null, fileText = '', verdict = null, lastAttemptTestOnly = false;
let resultExpiryTimer = null;
let openHistoryPlayer = null;
let localSource = null, lastSourceForRetry = null;
let zipSelection = null, zipLoading = false, zipInspectToken = 0, zipMainToken = 0;
let securityReady = false, securityMessage = '', captchaWidgetId = null, captchaResolve = null, captchaReject = null;

async function api(path, opts = {}) {
  let response;
  try {
    response = await fetch(API + path, {
      method: opts.method || 'GET',
      headers: opts.body ? { 'Content-Type': 'application/json' } : {},
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      cache: 'no-store'
    });
  } catch (e) {
    const error = new Error('Connexion au serveur impossible. Vérifie le réseau puis réessaie.');
    error.status = 0;
    throw error;
  }
  const responseText = await response.text();
  let data = {};
  try { data = responseText ? JSON.parse(responseText) : {}; }
  catch (parseError) {
    data = { error: responseText.slice(0, 600) || 'Réponse serveur non JSON.' };
  }
  if (!response.ok) {
    const message = data.error || data.message || ('Erreur serveur HTTP ' + response.status);
    const details = [
      'HTTP ' + response.status,
      data.code ? 'code=' + data.code : '',
      data.requestId ? 'requestId=' + data.requestId : '',
      data.details ? String(data.details).slice(0, 500) : ''
    ].filter(Boolean).join(' · ');
    const error = new Error(message + (details ? ' [' + details + ']' : ''));
    error.status = response.status;
    error.response = data;
    throw error;
  }
  return data;
}

function setNetworkBanner(visible) {
  const banner = document.getElementById('rdxNetworkBanner');
  if (banner) banner.hidden = !visible;
}
function isRetryableJobError(error) {
  const status = Number(error && error.status) || 0;
  return status === 0 || status === 408 || status === 429 || status >= 500;
}
async function apiWithRetry(path, opts = {}) {
  const isJobGet = (opts.method || 'GET') === 'GET' && path.startsWith('/job');
  if (!isJobGet) return api(path, opts);
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await api(path, opts);
      setNetworkBanner(false);
      return result;
    } catch (error) {
      lastError = error;
      if (!isRetryableJobError(error) || attempt === 2) { setNetworkBanner(true); throw error; }
      setNetworkBanner(true);
      await new Promise(resolve => window.setTimeout(resolve, 800 * (2 ** attempt)));
    }
  }
  throw lastError;
}
function waitForVisiblePoll(delay) {
  return new Promise(resolve => {
    let timer = null, finished = false;
    const cleanup = () => {
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
    const finish = () => { if (finished) return; finished = true; cleanup(); resolve(); };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        if (timer !== null) window.clearTimeout(timer);
        timer = null;
      } else finish();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    if (document.visibilityState === 'visible') timer = window.setTimeout(finish, delay);
  });
}

function explain(e) {
  const t = (key, fallback) => window.rdxT ? window.rdxT(key, fallback) : fallback;
  if (e.cancelled) return t('error.cancelled', 'Rendu annulé.');
  if (e.status === 0) return t('error.network', 'Connexion interrompue. Vérifie le réseau puis réessaie.');
  if (e.status === 408 || /timeout|timed out|délai dépassé/i.test(e.message || '')) return t('error.timeout', 'Le délai de réponse est dépassé. Le serveur ou le transfert a probablement été interrompu.');
  if (e.status === 413) return t('error.fileSize', 'Fichier trop volumineux (limite : 50 Mo). Réduis les ressources intégrées ou utilise un ZIP optimisé.');
  if (e.status === 429) return t('error.rateLimit', 'Trop de demandes ont été envoyées. Attends quelques instants avant de réessayer.');
  if (e.status === 502) return t('error.gateway', 'La passerelle a reçu une réponse invalide du service de rendu. Le service est peut-être temporairement indisponible.');
  if (e.status === 503) return t('error.unavailable', 'Le service de rendu est momentanément indisponible ou en maintenance.');
  if (e.status === 401 || e.status === 403) return t('error.security', 'La vérification de sécurité a échoué. Recharge la page puis relance la vérification.');
  return e.message || 'Une erreur inattendue a interrompu le rendu.';
}
function technicalErrorText(e) {
  const r = e && e.response ? e.response : {};
  return ['RENDRAX — diagnostic du rendu','Date : ' + new Date().toISOString(),'HTTP : ' + (e.status || 'non disponible'),'Message : ' + (e.message || String(e)),'Code : ' + (r.code || 'non fourni'),'Request ID : ' + (r.requestId || 'non fourni'),'Détails : ' + (r.details || 'non fournis'),'Workflow : ' + (e.url || 'non disponible')].join('\n');
}
function renderErrorActions(e) {
  rdxTrack('render_error', { status: Number(e && e.status) || 0 });
  const box = $('#res'); box.textContent = '';
  const panel = document.createElement('section'); panel.className = 'rdx-error-panel'; panel.setAttribute('role', 'alert');
  const title = document.createElement('h3'); title.textContent = e.status === 413 ? 'Fichier trop volumineux' : e.status === 429 ? 'Trop de demandes' : e.status === 502 || e.status === 503 || e.status === 0 || e.status === 408 ? 'Service temporairement indisponible' : 'Le rendu n’a pas abouti';
  const cause = document.createElement('p'); cause.textContent = explain(e);
  const actions = document.createElement('div'); actions.className = 'actions';
  if (e.status !== 413) {
    const same = document.createElement('button'); same.type = 'button'; same.className = 'sec'; same.textContent = 'Réessayer avec les mêmes réglages'; same.addEventListener('click', () => go(lastAttemptTestOnly, false)); actions.append(same);
    if (!lastAttemptTestOnly) {
      const light = document.createElement('button'); light.type = 'button'; light.className = 'sec'; light.textContent = 'Réessayer en qualité allégée'; light.addEventListener('click', () => go(false, true)); actions.append(light);
    }
  } else {
    const optimize = document.createElement('button'); optimize.type = 'button'; optimize.className = 'sec'; optimize.textContent = 'Vérifier le fichier'; optimize.addEventListener('click', () => $('#file').focus()); actions.append(optimize);
  }
  panel.append(title, cause, actions); box.append(panel);
  $('#rdx-technical-log').textContent = technicalErrorText(e); $('#stl').hidden = false;
  $('#stla').hidden = !e.url; if (e.url) $('#stla').href = e.url;
}

function loadTurnstileScript() {
  return new Promise((resolve, reject) => {
    if (window.turnstile) return resolve();
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Le service de vérification anti-robot est indisponible.'));
    document.head.appendChild(script);
  });
}
function setRdxServiceStatus(state, label) {
  const badge = $('#rdx-service-status');
  const text = $('#rdx-service-label');
  if (!badge || !text) return;
  badge.dataset.state = state;
  text.textContent = label;
}
async function initSecurity() {
  const statusEl = $('#securityStatus');
  let configReceived = false;
  try {
    const config = await api('/config');
    configReceived = true;
    const serviceState = ['online', 'degraded', 'offline'].includes(config.status)
      ? config.status
      : (config.ready ? 'online' : 'degraded');
    const serviceLabels = {
      online: window.rdxT ? window.rdxT('service.online', 'ATELIER DE RENDU · EN LIGNE') : 'ATELIER DE RENDU · EN LIGNE',
      degraded: window.rdxT ? window.rdxT('service.degraded', 'ATELIER DE RENDU · Service dégradé') : 'ATELIER DE RENDU · Service dégradé',
      offline: window.rdxT ? window.rdxT('service.offline', 'ATELIER DE RENDU · Service indisponible') : 'ATELIER DE RENDU · Service indisponible'
    };
    setRdxServiceStatus(serviceState, serviceLabels[serviceState]);
    if (!config.ready || !config.turnstileSiteKey) {
      const missing = Array.isArray(config.missing) ? config.missing : [];
      const details = missing.length ? 'Variables Vercel manquantes : ' + missing.join(', ') + '.' :
        'La clé publique Turnstile est absente.';
      throw new Error('Configuration incomplète. ' + details);
    }
    await loadTurnstileScript();
    captchaWidgetId = window.turnstile.render('#captchaMount', {
      sitekey: config.turnstileSiteKey,
      size: 'invisible',
      appearance: 'interaction-only',
      callback: token => {
        if (captchaResolve) { const resolve = captchaResolve; captchaResolve = null; captchaReject = null; resolve(token); }
      },
      'error-callback': () => {
        if (captchaReject) { const reject = captchaReject; captchaResolve = null; captchaReject = null; reject(new Error('Vérification anti-robot impossible. Réessaie.')); }
      },
      'expired-callback': () => {
        if (captchaReject) { const reject = captchaReject; captchaResolve = null; captchaReject = null; reject(new Error('La validation a expiré. Réessaie.')); }
      }
    });
    securityReady = true;
    securityMessage = '';
    statusEl.textContent = '';
    statusEl.hidden = true;
  } catch (e) {
    securityReady = false;
    if (!configReceived) {
      setRdxServiceStatus('offline', 'ATELIER DE RENDU · Service indisponible');
    } else {
      setRdxServiceStatus('degraded', 'ATELIER DE RENDU · Service dégradé');
    }
    securityMessage = e.message || 'Le serveur de rendu est indisponible.';
    statusEl.textContent = securityMessage;
    statusEl.className = 'mut';
    statusEl.hidden = false;
  }
  syncGoButton();
}
function captchaToken() {
  return new Promise((resolve, reject) => {
    if (!securityReady || captchaWidgetId === null) return reject(new Error(securityMessage || 'Protection de sécurité non configurée.'));
    const statusEl = $('#securityStatus');
    if (statusEl) { statusEl.textContent = 'Vérification de sécurité…'; statusEl.className = 'mut'; statusEl.hidden = false; }
    captchaResolve = token => { if (statusEl) statusEl.hidden = true; resolve(token); };
    captchaReject = error => {
      if (statusEl) { statusEl.textContent = error.message || 'Vérification de sécurité impossible. Réessaie.'; statusEl.hidden = false; }
      reject(error);
    };
    try {
      window.turnstile.reset(captchaWidgetId);
      window.turnstile.execute(captchaWidgetId);
    } catch (e) {
      captchaResolve = null; captchaReject = null;
      if (statusEl) { statusEl.textContent = 'Vérification de sécurité impossible. Réessaie.'; statusEl.hidden = false; }
      reject(new Error('Impossible de lancer la vérification anti-robot.'));
    }
  });
}
function setSteps(active, failed) {
  [...$('#steps').children].forEach((li, i) => {
    const state = failed === i ? 'err' : i < active ? 'done' : i === active ? 'active' : 'pending';
    li.dataset.s = state;
    const icon = li.querySelector('.step-icon');
    if (icon) icon.textContent = state === 'done' ? '✓' : (li.dataset.icon || icon.textContent);
    if (state === 'active') li.setAttribute('aria-current', 'step');
    else li.removeAttribute('aria-current');
  });
}
function status(msg, cls, url) {
  const s = $('#st'); s.textContent = msg; s.className = cls || 'mut';
  $('#stl').hidden = !url;
  if (url) { $('#stla').href = url; $('#stla').hidden = false; }
}
function hint(msg) { const h = $('#hint'); h.hidden = !msg; h.textContent = msg || ''; }
function revealTransition(el) {
  if (!el) return;
  el.hidden = false;
  el.classList.add('rdx-transition');
  el.classList.remove('rdx-transition-visible');
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) {
    el.classList.add('rdx-transition-visible');
    return;
  }
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (!el.hidden) el.classList.add('rdx-transition-visible');
  }));
}
function resetTransition(el) {
  if (!el) return;
  el.classList.add('rdx-transition');
  el.classList.remove('rdx-transition-visible');
}
function resetUploadProgress() {
  const panel = $('#rdx-upload-progress');
  if (!panel) return;
  panel.hidden = true;
  $('#rdx-upload-label').textContent = 'Envoi sécurisé du fichier';
  $('#rdx-upload-percent').textContent = '0 %';
  $('#rdx-upload-bar').value = 0;
  $('#rdx-upload-speed').textContent = 'Préparation du transfert…';
}
function updateUploadProgress(loaded, total, samples) {
  const panel = $('#rdx-upload-progress');
  const percent = Math.max(0, Math.min(100, Math.round(loaded / total * 100)));
  panel.hidden = false;
  $('#rdx-upload-bar').value = percent;
  $('#rdx-upload-percent').textContent = percent + ' %';
  const now = Date.now();
  const previous = samples[samples.length - 1];
  if (!previous || loaded > previous.loaded) samples.push({ at: now, loaded });
  while (samples.length > 2 && now - samples[0].at > 5000) samples.shift();
  if (samples.length >= 2) {
    const first = samples[0], last = samples[samples.length - 1];
    const seconds = (last.at - first.at) / 1000;
    const bytes = last.loaded - first.loaded;
    const speed = seconds > 0 && bytes > 0 ? bytes / seconds : 0;
    $('#rdx-upload-speed').textContent = speed > 0
      ? 'Vitesse : ' + (speed / 1048576).toFixed(2).replace('.', ',') + ' Mo/s · ' +
        (loaded / 1048576).toFixed(1).replace('.', ',') + ' / ' + (total / 1048576).toFixed(1).replace('.', ',') + ' Mo'
      : 'Calcul de la vitesse…';
  } else {
    $('#rdx-upload-speed').textContent = 'Calcul de la vitesse…';
  }
}
function resetRenderProgress() {
  $('#renderProgress').hidden = true;
  $('#renderProgressPhase').textContent = 'Préparation du rendu';
  $('#renderProgressPercent').textContent = '';
  $('#renderProgressEta').textContent = 'Calcul…';
  $('#renderProgressBar').removeAttribute('value');
}
function updateRenderProgress(progress, elapsedMs, samples, state, fallbackPhase) {
  const panel = $('#renderProgress');
  const bar = $('#renderProgressBar');
  const phase = progress && progress.phase;
  const labels = {
    rendu: 'Rendu des images',
    temps_reel: 'Rendu en temps réel',
    assemblage: 'Assemblage'
  };
  panel.hidden = false;
  $('#renderProgressPhase').textContent = labels[phase] || fallbackPhase || 'Préparation du rendu';
  const percentValue = progress && phase === 'rendu' &&
    Number.isFinite(Number(progress.percent)) ? Number(progress.percent) : null;
  if (percentValue !== null) state.maxPercent = Math.max(state.maxPercent, Math.max(0, Math.min(100, percentValue)));
  bar.value = state.maxPercent;
  $('#renderProgressPercent').textContent = Math.round(state.maxPercent) + ' %';

  let etaText = 'Estimation en cours';
  if (phase === 'temps_reel' || phase === 'assemblage') {
    etaText = 'Durée écoulée : ' + mmss(elapsedMs);
  } else if (phase === 'rendu' && progress &&
      Number.isSafeInteger(progress.current) && Number.isSafeInteger(progress.total) &&
      progress.total > 0) {
    const usable = samples.filter(sample => sample.current >= 0);
    if (usable.length >= 3) {
      const first = usable[0];
      const last = usable[usable.length - 1];
      const seconds = (last.at - first.at) / 1000;
      const frames = last.current - first.current;
      const fresh = Date.now() - last.at <= 18000;
      if (Number.isFinite(seconds) && seconds > 0 && Number.isFinite(frames) && frames > 0 && fresh) {
        const framesPerSecond = frames / seconds;
        const remaining = Math.max(0, progress.total - Math.max(progress.current, state.maxCurrent));
        const remainingMs = (remaining / framesPerSecond) * 1000;
        if (remaining === 0) etaText = 'Finalisation du rendu…';
        else if (Number.isFinite(remainingMs) && remainingMs >= 0) etaText = 'Environ ' + Math.max(1, Math.round(remainingMs / 60000)) + ' min restantes · estimation';
      }
    }
  } else if (fallbackPhase && etaText === 'Estimation en cours') {
    etaText = 'Estimation en cours · durée écoulée : ' + mmss(elapsedMs);
  }
  $('#renderProgressEta').textContent = etaText;
}
function workflowStepIndex(name, progressPhase) {
  if (progressPhase === 'assemblage' ||
      /Publier le MP4|Supprimer les fichiers temporaires/i.test(name || '')) return 3;
  if (/Rendre la vidéo/i.test(name || '')) return 2;
  if (/Préparer le HTML source|Installer FFmpeg|Vérifier les outils média|Installer websocket-client|Set up job|actions\/checkout|setup-python/i.test(name || '')) return 1;
  return 1;
}
function workflowStepLabel(name, progressPhase) {
  if (progressPhase === 'assemblage') return 'Création et assemblage de la vidéo…';
  if (/Préparer le HTML source/i.test(name || '')) return 'Préparation du HTML temporaire…';
  if (/Installer FFmpeg/i.test(name || '')) return 'Préparation de l’outil de création vidéo…';
  if (/Vérifier les outils média/i.test(name || '')) return 'Vérification des outils de rendu…';
  if (/Installer websocket-client/i.test(name || '')) return 'Préparation des dépendances…';
  if (/Rendre la vidéo/i.test(name || '')) return 'Génération des images et synchronisation du son…';
  if (/Publier le MP4 \(artefact\)/i.test(name || '')) return 'Finalisation et vérification de la vidéo…';
  if (/Publier le MP4 \(Release/i.test(name || '')) return 'Préparation de la vidéo finale…';
  if (/Supprimer les fichiers temporaires/i.test(name || '')) return 'Nettoyage final…';
  return 'En attente du démarrage du rendu…';
}
function hasBlockingFinding(v) {
  return !!(v && (v.blocking === true || v.kind === 'invalid' ||
    (Array.isArray(v.findings) && v.findings.some(item => item.level === 'blocking'))));
}
function syncGoButton() {
  const disabled = busy || !securityReady || hasBlockingFinding(verdict);
  const reason = busy ? 'Un rendu est déjà en cours.' : !securityReady ? 'Le service de rendu n’est pas prêt.' : hasBlockingFinding(verdict) ? 'Corrige les éléments bloquants du rapport de compatibilité.' : '';
  ['#go', '#testRender'].forEach(selector => {
    const button = $(selector);
    button.disabled = disabled;
    if (reason) {
      button.setAttribute('aria-describedby', 'rdx-render-disabled-help');
      button.title = reason;
    } else {
      button.removeAttribute('aria-describedby');
      button.removeAttribute('title');
    }
  });
}
function setBusy(b) {
  busy = b;
  syncGoButton();
  $('#go').hidden = b;
  $('#testRender').hidden = b;
  $('#testRender').disabled = b || !securityReady || hasBlockingFinding(verdict);
  $('#file').disabled = b;
  $('#cancel').hidden = !b;
  $('#cancel').disabled = false;
}
function analyze(t, sizeBytes = null) {
  const count = (s, sub) => s.split(sub).length - 1;
  const findings = [];
  const add = (level, title, detail, action = '') => findings.push({ level, title, detail, action });

  if (typeof t !== 'string' || !t.trim()) {
    const label = 'Le fichier HTML est vide : aucun contenu à analyser.';
    add('blocking', 'Fichier HTML vide', label, 'Ajoute le code HTML puis sélectionne à nouveau le fichier.');
    return { kind: 'invalid', label, findings, blocking: true };
  }
  if (t.trim().length < 20 ||
      !/<(?:!doctype|html|head|body|script|svg|canvas|div|style)\b/i.test(t)) {
    const label = 'Ce fichier ne ressemble pas à une page HTML valide.';
    add('blocking', 'Format HTML invalide', label, 'Vérifie le contenu et sélectionne une page HTML ou HTM complète.');
    return { kind: 'invalid', label, findings, blocking: true };
  }

  const kidas = count(t, 'const [t,setT]=useState(0),') === 1 && /[.#]stage\s*\{/.test(t)
    && /\bAUD\s*=\s*'data:audio\//.test(t) && /\bD\s*=\s*\d/.test(t);
  const editpro = t.includes('function render(t)') && count(t, '(function loop(){let t=') === 1
    && t.includes('const IM=') && /"voice"\s*:\s*"[A-Za-z0-9+\/=]{1000,}"/.test(t);
  const voicevideo = t.includes('window.__video') && /\bseek\s*\(/.test(t)
    && /<audio\b[^>]*\ssrc=["']data:audio\//i.test(t) && /\bDUR\s*=/.test(t);
  const musicpro = t.includes('function render(t)') && /atob\(\s*VOICE\s*\)/.test(t)
    && /function\s+music\s*\(/.test(t) && /function\s+go\s*\(/.test(t)
    && /\(function\s+lp\s*\(\)\s*\{/.test(t) && /\bconst\s+D\s*=\s*\d/.test(t)
    && /\bvP\s*=/.test(t) && /\bmP\s*=/.test(t);
  const gsapvideo = /<audio\b[^>]*\bsrc=["']data:audio\/[a-z0-9.+-]+;base64,/i.test(t)
    && /\b(?:const\s+T\s*=\s*\[\s*\d|const\s+D\s*=\s*\d)/.test(t) && /\bSUB\s*=/.test(t)
    && /\btl\s*=\s*gsap\.timeline\(\s*\{\s*paused\s*:\s*true\s*\}\s*\)/.test(t)
    && /\btl\.time\([^;]*?,\s*false\s*\)/.test(t)
    && (
      /\bstarted\s*\?\s*a\.currentTime/.test(t)
      || /\bif\s*\(\s*started\s*\)\s*\{[\s\S]{0,1200}?\ba\.currentTime\b/.test(t)
    )
    && /requestAnimationFrame\s*\(\s*lp\s*\)/.test(t)
    && /[.#]st\s*\{[^}]*?width:\s*\d+px;\s*height:\s*\d+px/.test(t);

  let kind = 'generic';
  let label = 'Page HTML générique';
  if (kidas) [kind, label] = ['kidas', 'KIDAS (React + audio intégré)'];
  else if (editpro) [kind, label] = ['editpro', 'EditPro (canvas + voix intégrée)'];
  else if (voicevideo) [kind, label] = ['voicevideo', 'Vidéo React (audio intégré + window.__video)'];
  else if (musicpro) [kind, label] = ['musicpro', 'MusicPro (canvas + voix et musique synchronisées)'];
  else if (gsapvideo) [kind, label] = ['gsapvideo', 'Vidéo GSAP synchronisée sur la piste audio'];

  add('good', 'Format HTML reconnu', 'Le fichier contient une structure HTML exploitable.');
  if (kind === 'generic') {
    add('warn', 'Animation non identifiée', 'Aucun format vidéo pris en charge n’a été reconnu.',
      'Vérifie que les animations sont pilotées par CSS, Canvas ou GSAP.');
  } else {
    add('good', 'Type d’animation reconnu', label);
  }

  const hasAudio = /<audio\b/i.test(t) || /\bdata:audio\//i.test(t)
    || /\b(?:webkit)?AudioContext\b/.test(t);
  add(hasAudio ? 'good' : 'warn',
    hasAudio ? 'Audio détecté' : 'Aucun audio intégré détecté',
    hasAudio ? 'Une balise audio, une source audio intégrée ou Web Audio a été détecté.'
      : 'Aucune balise audio, source data:audio ou API Web Audio détectée.',
    hasAudio ? '' : 'Ajoute une balise <audio> ou utilise Web Audio pour intégrer du son.');

  const hasDuration = /\b(?:const|let|var)\s+(?:D|DUR|duration|TOTAL_DURATION)\s*=\s*(?:\d+(?:\.\d+)?|['"][^'"]+['"])/i.test(t)
    || /\bduration\s*:\s*\d+(?:\.\d+)?/i.test(t)
    || /\b(?:duration|durée)\s*=\s*["']?\d+(?:\.\d+)?/i.test(t);
  add(hasDuration ? 'good' : 'warn',
    hasDuration ? 'Durée détectée' : 'Durée non identifiée',
    hasDuration ? 'Une variable ou configuration de durée a été repérée.'
      : 'Aucune configuration de durée courante n’a été repérée.',
    hasDuration ? '' : 'Vérifie et définis explicitement la durée de l’animation.');

  const hasGsap = /\b(?:gsap\.|TweenMax\b|TimelineMax\b)/.test(t);
  const hasCanvas = /<canvas\b/i.test(t) || /\.getContext\s*\(\s*['"](?:2d|webgl2?|bitmaprenderer)['"]/.test(t);
  const hasCss = /<style\b/i.test(t) || /<link\b[^>]*rel=["']stylesheet["']/i.test(t)
    || /\bstyle\s*=/.test(t) || /@(?:keyframes|media|supports)\b/.test(t);
  add(hasCss ? 'good' : 'warn', hasCss ? 'CSS détecté' : 'CSS non détecté',
    hasCss ? 'Des styles intégrés ou une feuille de style sont présents.'
      : 'Aucun style CSS courant n’a été repéré.',
    hasCss ? '' : 'Ajoute des styles CSS si la page en dépend.');
  add(hasCanvas ? 'good' : 'warn', hasCanvas ? 'Canvas détecté' : 'Canvas non détecté',
    hasCanvas ? 'Un élément ou contexte Canvas a été repéré.'
      : 'Aucun élément ou contexte Canvas détecté.',
    hasCanvas ? '' : 'Si ton animation utilise Canvas, vérifie sa création et son initialisation.');
  add(hasGsap ? 'good' : 'warn', hasGsap ? 'GSAP détecté' : 'GSAP non détecté',
    hasGsap ? 'La bibliothèque GSAP ou une API historique a été repérée.'
      : 'Aucune référence GSAP détectée.',
    '');

  const external = new Set();
  const addExternalUrl = raw => {
    if (typeof raw !== 'string') return;
    const value = raw.trim().replace(/^['"]|['"]$/g, '');
    if (!/^https?:\/\//i.test(value) && !/^\/\//.test(value)) return;
    try {
      const parsed = new URL(value, window.location.href);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        parsed.hash = '';
        external.add(parsed.href);
      }
    } catch (_) {}
  };

  // Ressources déclarées dans les balises HTML concernées.
  try {
    const parsedHtml = new DOMParser().parseFromString(t, 'text/html');
    const resourceSelectors = [
      'script[src]', 'link[href]', 'img[src]', 'img[srcset]',
      'source[src]', 'source[srcset]', 'audio[src]',
      'video[src]', 'video[poster]'
    ].join(',');
    for (const element of parsedHtml.querySelectorAll(resourceSelectors)) {
      for (const attribute of ['src', 'href', 'poster']) {
        if (element.hasAttribute(attribute)) addExternalUrl(element.getAttribute(attribute));
      }
      if (element.hasAttribute('srcset')) {
        for (const candidate of element.getAttribute('srcset').split(',')) {
          addExternalUrl(candidate.trim().split(/\s+/)[0]);
        }
      }
    }

    // CSS intégré : url(...) couvre aussi les sources de @font-face.
    const cssSources = [
      ...Array.from(parsedHtml.querySelectorAll('style'), element => element.textContent || ''),
      ...Array.from(parsedHtml.querySelectorAll('[style]'), element => element.getAttribute('style') || '')
    ];
    const cssUrlPattern = /url\(\s*(?:(["'])(.*?)\1|([^)'"]*?))\s*\)/gi;
    const cssImportPattern = /@import\s+(?:url\(\s*)?(?:(["'])(.*?)\1|([^)'";\s]+))\s*\)?/gi;
    for (const css of cssSources) {
      let cssMatch;
      while ((cssMatch = cssUrlPattern.exec(css)) !== null) {
        addExternalUrl(cssMatch[2] || cssMatch[3] || '');
      }
      while ((cssMatch = cssImportPattern.exec(css)) !== null) {
        addExternalUrl(cssMatch[2] || cssMatch[3] || '');
      }
    }
  } catch (_) {
    // Le diagnostic principal reste disponible même si le parseur HTML échoue.
  }

  add(external.size ? 'info' : 'good',
    external.size ? 'Fichiers chargés depuis Internet' : 'Aucun fichier externe',
    external.size
      ? external.size + ' fichier(s) chargé(s) depuis Internet seront vérifiés automatiquement.'
      : 'Aucun lien externe courant n’a été trouvé.');
  if (Number.isFinite(sizeBytes) && sizeBytes >= 0) {
    if (sizeBytes > MAX_BYTES) {
      add('blocking', 'Fichier trop volumineux', 'Le fichier dépasse la limite actuelle de 50 Mo.',
        'Réduis la taille du fichier avant de recommencer.');
    } else if (sizeBytes >= 20 * 1024 * 1024) {
      add('warn', 'Fichier volumineux', 'Le fichier atteint au moins 20 Mo.',
        'Réduis sa taille si le chargement ou le rendu est lent.');
    } else {
      add('good', 'Taille du fichier acceptable', 'Le fichier reste sous le seuil d’avertissement de 20 Mo.');
    }
  }

  const blocking = findings.some(item => item.level === 'blocking');
  return { kind, label, findings, blocking, resources: Array.from(external) };
}
async function verifyExternalResources(v) {
  if (!v || v.resourceCheckStarted || !Array.isArray(v.resources) || !v.resources.length) return;
  v.resourceCheckStarted = true;
  const previousClass = $('#verdict').className;
  const previousMessage = $('#verdict').textContent;

  try {
    const data = await api('/check-resources', {
      method: 'POST',
      body: { urls: v.resources }
    });
    if (verdict !== v) return;

    const results = Array.isArray(data.results) ? data.results : [];
    const byUrl = new Map(results.map(result => [result.url, result]));
    v.findings = (Array.isArray(v.findings) ? v.findings : [])
      .filter(item => item.title !== 'Ressource externe à vérifier' && item.title !== 'Ressources externes');

    for (const url of v.resources) {
      const result = byUrl.get(url);
      const accessible = !!(result && result.ok === true &&
        Number(result.status) >= 200 && Number(result.status) < 400);
      v.findings.push({
        level: accessible ? 'good' : 'warn',
        title: accessible ? 'Fichier accessible' : 'Fichier inaccessible',
        detail: url + (result && result.status ? ' — réponse du serveur : ' + result.status
          : result && result.error ? ' — ' + result.error : ' — aucune réponse valide'),
        action: accessible ? '' : 'Télécharge ce fichier et intègre-le dans ton HTML.'
      });
    }
  } catch (error) {
    if (verdict !== v) return;
    v.findings = (Array.isArray(v.findings) ? v.findings : [])
      .filter(item => item.title !== 'Ressource externe à vérifier' && item.title !== 'Ressources externes');
    for (const url of v.resources) {
      v.findings.push({
        level: 'warn',
        title: 'Vérification du fichier impossible',
        detail: url + ' — ' + (error.message || 'Le serveur de vérification ne répond pas.'),
        action: 'Télécharge ce fichier et intègre-le dans ton HTML.'
      });
    }
  }

  if (verdict === v) showVerdict(v, previousClass, previousMessage);
}
function compatHelpUrl(finding) {
  const title = String(finding.title || '').toLowerCase();
  if (title.includes('audio')) return 'https://developer.mozilla.org/fr/docs/Web/Media/Audio_and_video_delivery';
  if (title.includes('canvas')) return 'https://developer.mozilla.org/fr/docs/Web/API/Canvas_API/Tutorial';
  if (title.includes('css') || title.includes('style')) return 'https://developer.mozilla.org/fr/docs/Web/CSS';
  if (title.includes('taille') || title.includes('volumineux')) return 'https://developer.mozilla.org/fr/docs/Learn_web_development/Extensions/Performance';
  if (title.includes('externe') || title.includes('internet') || title.includes('accessible') || title.includes('inaccessible')) return 'https://developer.mozilla.org/fr/docs/Web/HTTP';
  if (title.includes('html') || title.includes('format') || title.includes('vide')) return 'https://developer.mozilla.org/fr/docs/Learn_web_development/Getting_started/Your_first_website/Creating_the_content';
  if (title.includes('gsap') || title.includes('animation')) return 'https://developer.mozilla.org/fr/docs/Web/API/Animation';
  return 'https://developer.mozilla.org/fr/docs/Learn_web_development/Getting_started/Your_first_website';
}
function showVerdict(v, cls, msg) {
  verdict = v;
  const e = $('#verdict');
  e.hidden = !msg;
  e.textContent = msg || '';
  e.className = cls || 'mut';

  const report = $('#compatReport');
  const blockingList = $('#rdx-compat-blocking');
  const blockingCountEl = $('#rdx-compat-blocking-count');
  const blockingEmpty = $('#rdx-compat-blocking-empty');
  const warningList = $('#compatFindings');
  const warningCountEl = $('#rdx-compat-warn-count');
  const warningEmpty = $('#rdx-compat-warn-empty');
  const passed = $('#compatPassed');
  const passedList = $('#compatPassedFindings');
  const passedSummary = $('#compatPassedSummary');
  const summary = $('#compatSummary');
  blockingList.textContent = '';
  warningList.textContent = '';
  passedList.textContent = '';
  passed.open = false;

  let findings = v && Array.isArray(v.findings) ? v.findings : [];
  if (v && !findings.length && v.kind !== 'invalid') {
    findings = [{
      level: 'warn',
      title: 'Vérifications détaillées indisponibles',
      detail: 'Le serveur a fourni un verdict général, sans assez d’informations pour contrôler le HTML.',
      action: 'Importe directement le fichier HTML ou un ZIP pour obtenir toutes les vérifications.'
    }];
    if (Number.isFinite(v.sizeBytes) && v.sizeBytes >= 0) {
      findings.push({
        level: v.sizeBytes >= 20 * 1024 * 1024 ? 'warn' : 'good',
        title: 'Taille du fichier',
        detail: size(v.sizeBytes)
      });
    }
  }
  if (v && v.kind === 'invalid' && !findings.length) {
    findings = [{ level: 'blocking', title: 'Import bloqué', detail: v.label || 'Le fichier ne peut pas être traité.' }];
  }

  const blocking = findings.filter(item => item.level === 'blocking');
  const review = findings.filter(item => item.level !== 'blocking' && item.level !== 'good');
  const successful = findings.filter(item => item.level === 'good');
  blockingCountEl.textContent = String(blocking.length);
  warningCountEl.textContent = String(review.length);
  blockingEmpty.hidden = blocking.length > 0;
  warningEmpty.hidden = review.length > 0;

  if (blocking.length) {
    summary.textContent = 'Rendu bloqué · ' + blocking.length + ' problème' + (blocking.length > 1 ? 's' : '') + ' à corriger.';
  } else if (review.length) {
    summary.textContent = successful.length + ' contrôle' + (successful.length > 1 ? 's' : '') + ' réussi' + (successful.length > 1 ? 's' : '') +
      ' · ' + review.length + ' point' + (review.length > 1 ? 's' : '') + ' à vérifier.';
  } else {
    summary.textContent = successful.length + ' contrôle' + (successful.length > 1 ? 's' : '') + ' réussi' +
      (successful.length > 1 ? 's' : '') + ' · Aucun problème détecté.';
  }

  const appendFinding = (finding, target, level) => {
    const item = document.createElement('li');
    item.dataset.level = level;
    const heading = document.createElement('strong');
    heading.textContent = (level === 'blocking' ? 'Bloquant' : 'À vérifier') + ' · ' + (finding.title || 'Constat');
    item.append(heading);

    const detail = document.createElement('p');
    detail.textContent = finding.detail || 'Ce point mérite une vérification avant le rendu.';
    item.append(detail);

    if (finding.action) {
      const action = document.createElement('p');
      action.className = 'compat-action';
      action.textContent = 'À faire : ' + finding.action;
      item.append(action);
    }
    const help = document.createElement('a');
    help.className = 'compat-help-link';
    help.href = compatHelpUrl(finding);
    help.target = '_blank';
    help.rel = 'noopener noreferrer';
    help.textContent = 'Consulter l’aide';
    item.append(help);
    target.append(item);
  };

  for (const finding of blocking) appendFinding(finding, blockingList, 'blocking');
  for (const finding of review) appendFinding(finding, warningList, finding.level || 'warn');

  for (const finding of successful) {
    const item = document.createElement('li');
    const title = document.createElement('strong');
    title.textContent = finding.title || 'Vérification réussie';
    item.append(title);
    const detail = document.createElement('p');
    detail.textContent = finding.detail || 'Le contrôle est réussi.';
    item.append(detail);
    const help = document.createElement('a');
    help.className = 'compat-help-link';
    help.href = compatHelpUrl(finding);
    help.target = '_blank';
    help.rel = 'noopener noreferrer';
    help.textContent = 'En savoir plus';
    item.append(help);
    passedList.append(item);
  }

  passed.hidden = successful.length === 0;
  passedSummary.textContent = '✓ OK · Afficher les ' + successful.length + ' contrôle' + (successful.length > 1 ? 's' : '') + ' réussi' + (successful.length > 1 ? 's' : '');
  report.hidden = findings.length === 0;
  syncGoButton();
  if (v && v.kind !== 'invalid' && !hasBlockingFinding(v)) {
    revealTransition($('#settingsCard'));
  }
  if (v && Array.isArray(v.resources) && v.resources.length && !v.resourceCheckStarted) {
    verifyExternalResources(v);
  }
}
function applyPreviewFormat() {
  const format = $('#format').value;
  const resolvedFormat = format === 'auto' ? 'portrait' : format;
  $('#previewFrame').dataset.format = resolvedFormat;
  $('#watermarkPreviewFrame').dataset.format = resolvedFormat;
}
function updateWatermarkPreview() {
  const enabled = $('#watermark').checked;
  $('#watermarkPreview').hidden = !enabled;
  if (enabled) {
    const format = $('#format').value;
    $('#watermarkPreviewFrame').dataset.format = format === 'auto' ? 'portrait' : format;
  }
}
function loadIsolatedPreview(frame, source) {
  if (!frame) return;
  const html = String(source || '');
  const send = () => {
    if (frame.contentWindow) frame.contentWindow.postMessage({ type: 'RENDRAX_PREVIEW_HTML', html }, '*');
  };
  if (frame.dataset.rdxPreviewReady === '1' && frame.contentWindow) {
    send();
    return;
  }
  frame.addEventListener('load', () => {
    frame.dataset.rdxPreviewReady = '1';
    send();
  }, { once: true });
  frame.src = '/preview.html';
}
function renderPreview(source) {
  if (!source) return;
  const frame = $('#prev');
  $('#previewPanel').hidden = false;
  $('#prevBtn').hidden = false;
  applyPreviewFormat();
  frame.hidden = false;
  loadIsolatedPreview(frame, source);
}
function resetPreview() {
  const frame = $('#prev');
  frame.hidden = true;
  frame.src = 'about:blank';
  delete frame.dataset.rdxPreviewReady;
  $('#previewPanel').hidden = true;
  $('#prevBtn').textContent = 'Actualiser l’aperçu';
}
async function loadJsZip() {
  if (window.JSZip) return window.JSZip;
  if (window.__rendraxJsZipPromise) return window.__rendraxJsZipPromise;
  window.__rendraxJsZipPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = JSZIP_CDN;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.onload = () => window.JSZip
      ? resolve(window.JSZip)
      : reject(new Error('La bibliothèque ZIP a été chargée, mais elle est indisponible.'));
    script.onerror = () => reject(new Error('Impossible de charger l’outil de lecture des fichiers ZIP. Vérifie la connexion puis réessaie.'));
    document.head.appendChild(script);
  }).catch(error => {
    window.__rendraxJsZipPromise = null;
    throw error;
  });
  return window.__rendraxJsZipPromise;
}
function clearZipInspector() {
  $('#zipInspector').hidden = true;
  $('#zipSummary').textContent = '';
  $('#zipMainPicker').hidden = true;
  $('#zipMainFile').textContent = '';
  $('#zipResourceMeta').textContent = '';
  $('#zipResourceList').textContent = '';
}
function zipResourceType(path) {
  const ext = (String(path).split('.').pop() || '').toLowerCase();
  if (['html', 'htm'].includes(ext)) return 'html';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'bmp', 'ico', 'tif', 'tiff'].includes(ext)) return 'image';
  if (ext === 'css') return 'css';
  if (['js', 'mjs', 'cjs'].includes(ext)) return 'script';
  if (['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'opus', 'weba'].includes(ext)) return 'audio';
  if (['woff', 'woff2', 'ttf', 'otf', 'eot'].includes(ext)) return 'font';
  return 'other';
}
function renderZipResources(entries) {
  const labels = { html: 'HTML', image: 'IMAGE', css: 'CSS', script: 'SCRIPT', audio: 'AUDIO', font: 'POLICE', other: 'FICHIER' };
  const counts = { html: 0, image: 0, css: 0, script: 0, audio: 0, font: 0, other: 0 };
  for (const entry of entries) counts[zipResourceType(entry.path)]++;
  $('#zipResourceMeta').textContent = entries.length + ' fichier(s) · ' +
    counts.image + ' image(s) · ' + counts.css + ' CSS · ' + counts.script + ' script(s) · ' +
    counts.audio + ' audio · ' + counts.font + ' police(s)';
  const list = $('#zipResourceList');
  list.textContent = '';
  for (const entry of entries.slice(0, MAX_ZIP_LIST_ITEMS)) {
    const item = document.createElement('li');
    const kind = document.createElement('span');
    kind.className = 'zip-resource-kind';
    kind.textContent = labels[zipResourceType(entry.path)];
    const path = document.createElement('code');
    path.className = 'zip-resource-path';
    path.textContent = entry.path;
    const fileSize = document.createElement('span');
    fileSize.className = 'zip-resource-size';
    fileSize.textContent = size(entry.size);
    fileSize.setAttribute('aria-label', 'Taille : ' + size(entry.size));
    item.append(kind, path, fileSize);
    list.append(item);
  }
  if (entries.length > MAX_ZIP_LIST_ITEMS) {
    const more = document.createElement('li');
    more.className = 'empty';
    more.textContent = (entries.length - MAX_ZIP_LIST_ITEMS) + ' autre(s) fichier(s) non affiché(s) pour préserver la fluidité.';
    list.append(more);
  }
}
function configureZipMainPicker(htmlPaths, selectedPath, entries = []) {
  const select = $('#zipMainFile');
  select.textContent = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Choisis un fichier HTML…';
  select.append(placeholder);
  for (const path of htmlPaths) {
    const option = document.createElement('option');
    const entry = entries.find(item => item.path === path);
    option.value = path;
    option.textContent = path + (entry ? ' · ' + size(entry.size) : '');
    select.append(option);
  }
  select.value = selectedPath || '';
  $('#zipMainPicker').hidden = htmlPaths.length < 2;
  $('#zipMainHelp').textContent = selectedPath
    ? 'Sélection automatique : ' + selectedPath + '. Tu peux choisir une autre page ; la taille de chaque candidat est indiquée.'
    : 'Choisis la page à convertir. La taille de chaque candidat est indiquée dans la liste.';
}
async function chooseZipMain(path) {
  const selection = zipSelection;
  if (!selection) return;
  const mainToken = ++zipMainToken;
  selection.mainPath = path || '';
  selection.mainText = '';
  selection.analysis = { kind: 'invalid', label: 'Choisis le HTML principal du ZIP.' };
  fileText = '';
  resetPreview();
  if (!path) {
    $('#zipSummary').textContent = 'ZIP chargé. Sélectionne le HTML principal pour analyser la page.';
    return showVerdict(selection.analysis, 'warn', 'Choisis le HTML principal dans la liste avant de continuer.');
  }
  const entry = selection.entries.find(item => item.path === path);
  if (!entry || !selection.archive.file(path)) {
    selection.analysis = { kind: 'invalid', label: 'Le HTML sélectionné est introuvable dans le ZIP.' };
    setDropState('error', selection.analysis.label);
    return showVerdict(selection.analysis, 'err', '✗ Le HTML sélectionné est introuvable dans le ZIP.');
  }
  if (entry.size > MAX_BYTES) {
    selection.analysis = { kind: 'invalid', label: 'Le HTML principal dépasse 50 Mo une fois extrait.' };
    setDropState('error', selection.analysis.label);
    return showVerdict(selection.analysis, 'err', '✗ Le HTML principal dépasse 50 Mo une fois extrait.');
  }
  $('#zipSummary').textContent = 'Lecture de la page principale : ' + path + '…';
  status('Lecture de la page principale du fichier ZIP…');
  try {
    const html = await selection.archive.file(path).async('string');
    if (zipSelection !== selection || mainToken !== zipMainToken) return;
    selection.mainText = html;
    updateRenderEstimate();
    selection.analysis = analyze(html, entry.size);
    $('#zipSummary').textContent = 'ZIP : ' + selection.file.name + ' · HTML principal : ' + path +
      ' · taille extraite : ' + size(entry.size) + '. Les chemins des fichiers associés seront conservés lors de leur extraction.';
    if (selection.analysis.kind === 'invalid') {
      const action = selection.analysis.label.includes('vide')
        ? 'Ajoute le code HTML puis sélectionne à nouveau le fichier.'
        : 'Vérifie le HTML principal et sélectionne une page complète.';
      setDropState('error', selection.analysis.label + ' ' + action);
      showVerdict(selection.analysis, 'err', '✗ ' + selection.analysis.label + ' ' + action);
    } else if (selection.analysis.kind === 'generic') {
      renderPreview(selection.mainText);
      showVerdict(selection.analysis, 'warn', '⚠ ' + selection.analysis.label + '. Rendu universel en temps réel ; durée, synchronisation et son non garantis.');
    } else {
      renderPreview(selection.mainText);
      showVerdict(selection.analysis, 'ok', '✓ HTML principal reconnu : ' + selection.analysis.label + '.');
    }
  } catch (error) {
    if (zipSelection !== selection || mainToken !== zipMainToken) return;
    selection.analysis = { kind: 'invalid', label: 'Lecture du HTML principal impossible.' };
    setDropState('error', selection.analysis.label);
    showVerdict(selection.analysis, 'err', '✗ Lecture du HTML principal impossible : ' + (error.message || 'archive illisible') + '.');
  }
}
async function inspectZip(file, token) {
  zipLoading = true;
  zipSelection = null;
  $('#zipInspector').hidden = false;
  $('#zipSummary').textContent = 'Lecture du contenu ZIP…';
  $('#zipMainPicker').hidden = true;
  $('#zipResourceMeta').textContent = '';
  $('#zipResourceList').textContent = '';
  $('#prevBtn').hidden = true;
  showVerdict(null, 'mut', 'Lecture de la structure ZIP…');
  try {
    const JSZip = await loadJsZip();
    if (token !== zipInspectToken) return;
    const archive = await JSZip.loadAsync(file, { checkCRC32: false });
    if (token !== zipInspectToken) return;
    const entries = Object.keys(archive.files)
      .map(path => ({ path, file: archive.files[path], size: Number(archive.files[path]._data && archive.files[path]._data.uncompressedSize) || 0 }))
      .filter(entry => !entry.file.dir)
      .sort((a, b) => a.path.localeCompare(b.path));
    if (entries.length > MAX_ZIP_ENTRIES) throw new Error('Le ZIP contient plus de ' + MAX_ZIP_ENTRIES + ' fichiers. Réduis le nombre de fichiers puis réessaie.');
    const expandedBytes = entries.reduce((sum, entry) => sum + entry.size, 0);
    if (expandedBytes > MAX_ZIP_UNCOMPRESSED_BYTES) throw new Error('Le contenu extrait dépasse la limite de ' + size(MAX_ZIP_UNCOMPRESSED_BYTES) + '.');
    const htmlPaths = entries.filter(entry => /\.html?$/i.test(entry.path)).map(entry => entry.path);
    zipSelection = { file, archive, entries, htmlPaths, mainPath: '', mainText: '', analysis: null };
    renderZipResources(entries);
    if (!htmlPaths.length) {
      zipSelection.analysis = { kind: 'invalid', label: 'Le ZIP ne contient aucun fichier .html ou .htm.' };
      $('#zipSummary').textContent = 'Archive ouverte · ' + entries.length + ' fichier(s) trouvé(s), aucun HTML principal.';
      configureZipMainPicker([], '', entries);
      const message = 'Ce ZIP ne contient aucune page HTML ou HTM.';
      setDropState('error', message + ' Ajoute une page .html ou .htm à l’archive, puis réessaie.');
      return showVerdict(zipSelection.analysis, 'err', '✗ ' + message + ' Ajoute une page .html ou .htm à l’archive, puis réessaie.');
    }
    const rootIndex = htmlPaths.filter(path => path.toLowerCase() === 'index.html');
    const indexFiles = htmlPaths.filter(path => path.split('/').pop().toLowerCase() === 'index.html');
    let chosen = '';
    if (rootIndex.length) chosen = rootIndex[0];
    else if (indexFiles.length) chosen = indexFiles[0];
    else if (htmlPaths.length === 1) chosen = htmlPaths[0];
    configureZipMainPicker(htmlPaths, chosen, entries);
    if (!chosen) {
      zipSelection.analysis = { kind: 'invalid', label: 'Le HTML principal doit être sélectionné.' };
      $('#zipSummary').textContent = 'Archive ouverte · ' + entries.length + ' fichier(s) · ' + htmlPaths.length + ' pages HTML à départager.';
      return showVerdict(zipSelection.analysis, 'warn', 'Choisis le HTML principal dans la liste. Un fichier index.html est présélectionné lorsqu’il existe ; tu peux modifier ce choix.');
    }
    await chooseZipMain(chosen);
  } catch (error) {
    if (token !== zipInspectToken) return;
    zipSelection = null;
    $('#zipInspector').hidden = false;
    $('#zipSummary').textContent = 'Le ZIP n’a pas pu être inspecté.';
    $('#zipMainPicker').hidden = true;
    $('#zipResourceMeta').textContent = '';
    $('#zipResourceList').textContent = '';
    setDropState('error', error.message || 'Archive ZIP invalide.');
    showVerdict({ kind: 'invalid', label: error.message || 'Archive ZIP invalide.' }, 'err', '✗ ' + (error.message || 'Archive ZIP invalide.'));
  } finally {
    if (token === zipInspectToken) zipLoading = false;
  }
}
async function checkFile() {
  resetPreview(); fileText = '';
  const f = $('#file').files[0];
  const token = ++zipInspectToken;
  zipLoading = false;
  zipMainToken++;
  $('#prevBtn').hidden = true;

  if (!f) {
    zipSelection = null;
    clearZipInspector();
    $('#fileinfo').hidden = true;
    setDropState('idle');
    return showVerdict(null);
  }
  $('#fileinfo').hidden = false;
  $('#fileinfo').textContent = f.name + ' · ' + size(f.size);
  if (!/\.(?:html?|zip)$/i.test(f.name)) {
    zipSelection = null; clearZipInspector();
    const message = 'Format refusé : « ' + f.name + ' ». Formats acceptés : .html, .htm et .zip. Renomme ou exporte ton fichier dans l’un de ces formats.';
    setDropState('error', message);
    return showVerdict({ kind: 'invalid', label: 'Format de fichier non pris en charge.' }, 'err', '✗ ' + message);
  }
  if (f.size > MAX_BYTES) {
    zipSelection = null; clearZipInspector();
    const actualSize = size(f.size);
    const message = 'Fichier trop volumineux : ' + actualSize + ' (limite : 50 Mo). Réduis sa taille ou compresse ses ressources, puis réessaie.';
    setDropState('error', message);
    return showVerdict({ kind: 'invalid', label: 'Fichier trop volumineux (' + actualSize + ').' }, 'err', '✗ ' + message);
  }
  setDropState('accepted', '', f);
  if (/\.zip$/i.test(f.name)) return inspectZip(f, token);

  zipSelection = null;
  clearZipInspector();
  showVerdict(null, 'mut', 'Vérification du fichier…');
  let v;
  try { fileText = await f.text(); v = analyze(fileText, f.size); } catch (e) { v = { kind: 'invalid', label: 'Lecture du fichier impossible.', blocking: true }; }
  if (v.kind === 'invalid') {
    setDropState('error', v.label + ' Action : vérifie le contenu du fichier et sélectionne une page HTML complète.');
    return showVerdict(v, 'err', '✗ ' + v.label + ' Vérifie le contenu puis réessaie.');
  }
  updateRenderEstimate();
  renderPreview(fileText);
  if (v.kind === 'generic') showVerdict(v, 'warn', '⚠ Fichier non reconnu : rendu universel en temps réel. La durée, la synchronisation et le son ne sont pas garantis.');
  else showVerdict(v, 'ok', '✓ Fichier reconnu : ' + v.label + '. Rendu image par image avec le son, synchronisé.');
}
function setDropState(state, message = '', file = null) {
  const zone = $('#drop');
  const title = $('#rdx-drop-title');
  const hint = $('#rdx-drop-hint');
  const feedback = $('#rdx-drop-feedback');
  const error = $('#rdx-drop-error');
  zone.dataset.state = state;
  error.hidden = state !== 'error';
  error.textContent = state === 'error' ? message : '';
  feedback.textContent = state === 'accepted' && file
    ? '✓ ' + file.name + ' · ' + size(file.size)
    : state === 'drag' ? 'Dépose le fichier ici' : '';
  if (state === 'idle') {
    title.textContent = 'Choisir un fichier';
    hint.textContent = 'ou déposer un fichier HTML, HTM ou ZIP · 50 Mo maximum';
  } else if (state === 'drag') {
    title.textContent = 'Relâche pour ajouter le fichier';
    hint.textContent = 'HTML, HTM ou ZIP · 50 Mo maximum';
  } else if (state === 'accepted') {
    title.textContent = 'Fichier ajouté';
    hint.textContent = 'Tu peux sélectionner un autre fichier à tout moment.';
  } else if (state === 'error') {
    title.textContent = 'Fichier refusé';
    hint.textContent = 'Choisis un autre fichier HTML, HTM ou ZIP.';
  }
}
function setFile(files) {
  if (!files || !files.length) return;
  const file = files[0];
  if (!/\.(?:html?|zip)$/i.test(file.name)) {
    setDropState('error', 'Format refusé : « ' + file.name + ' ». Formats acceptés : .html, .htm et .zip. Renomme ou exporte ton fichier dans l’un de ces formats.');
    return;
  }
  if (file.size > MAX_BYTES) {
    const actualSize = size(file.size);
    setDropState('error', 'Fichier trop volumineux : ' + actualSize + ' (limite : 50 Mo). Réduis sa taille ou compresse ses ressources, puis réessaie.');
    return;
  }
  rdxTrackFile(file);
  const dt = new DataTransfer(); dt.items.add(file); $('#file').files = dt.files;
  if (localSource && localSource.file !== file) localSource = null;
  checkFile();
}
async function tryExample(button) {
  if (!button || button.disabled) return;
  const path = button.dataset.examplePath;
  const originalLabel = button.textContent;
  window.RDXButton.setLoading(button, true, 'Chargement…');
  try {
    if (!path || !path.startsWith('exemples/')) throw new Error('Chemin de l’exemple invalide.');
    const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) throw new Error('Impossible de charger cet exemple (HTTP ' + response.status + ').');
    const blob = await response.blob();
    const filename = path.split('/').pop();
    const file = new File([blob], filename, { type: 'text/html;charset=utf-8', lastModified: Date.now() });
    if (file.size > MAX_BYTES) throw new Error('Cet exemple dépasse la limite de 50 Mo.');
    rdxTrackFile(file, 'example');
    const transfer = new DataTransfer();
    transfer.items.add(file);
    localSource = null;
    zipSelection = null;
    $('#file').files = transfer.files;
    setSourceTab('file');
    await checkFile();
    if (!verdict || verdict.kind === 'invalid' || hasBlockingFinding(verdict)) {
      $('#fileCard').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      return;
    }
    $('#settingsCard').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  } catch (error) {
    setDropState('error', error && error.message ? error.message : 'Impossible de charger cet exemple. Réessaie.');
    $('#fileCard').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  } finally {
    window.RDXButton.setLoading(button, false);
    button.textContent = originalLabel;
  }
}
document.querySelectorAll('.example-try').forEach(button => {
  button.addEventListener('click', () => tryExample(button));
});

function uploadPrivateBlob(url, file, type_fichier = 'html') {
  const contentType = type_fichier === 'zip' ? 'application/zip' : 'text/html';
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const samples = [];
    currentUploadXhr = xhr;
    $('#rdx-upload-label').textContent = 'Envoi sécurisé du ' + (type_fichier === 'zip' ? 'ZIP' : 'HTML');
    $('#rdx-upload-progress').hidden = false;
    $('#cancel').textContent = 'Annuler l’envoi';
    xhr.open('PUT', url, true);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.timeout = 480000;
    xhr.upload.onprogress = e => {
      if (e.lengthComputable) {
        updateUploadProgress(e.loaded, e.total, samples);
        status('Envoi sécurisé… ' + Math.round(e.loaded / e.total * 100) + '%');
      }
    };
    const xhrDiagnostics = eventName => {
      const responseText = String(xhr.responseText || '').trim().slice(0, 700);
      const parts = [
        'événement=' + eventName,
        'HTTP=' + (xhr.status || 0),
        'readyState=' + xhr.readyState,
        'responseURL=' + (xhr.responseURL ? 'présente' : 'absente'),
        responseText ? 'réponse=' + responseText : ''
      ].filter(Boolean);
      return parts.join(' | ');
    };
    xhr.onload = () => {
      currentUploadXhr = null;
      if (xhr.status >= 200 && xhr.status < 300) {
        updateUploadProgress(file.size, file.size, samples);
        $('#rdx-upload-speed').textContent = 'Envoi terminé · ' + (file.size / 1048576).toFixed(1).replace('.', ',') + ' Mo';
        resolve();
      }
      else reject(new Error('Backblaze a répondu avec HTTP ' + xhr.status + '. ' + xhrDiagnostics('load')));
    };
    xhr.onerror = () => {
      currentUploadXhr = null;
      reject(new Error('Échec réseau/CORS pendant le PUT vers Backblaze. Le navigateur masque parfois la réponse réelle quand CORS bloque la requête. ' + xhrDiagnostics('error')));
    };
    xhr.ontimeout = () => {
      currentUploadXhr = null;
      reject(new Error('Délai dépassé après 8 minutes. ' + xhrDiagnostics('timeout')));
    };
    xhr.onabort = () => { currentUploadXhr = null; const e = new Error('annulé'); e.cancelled = true; reject(e); };
    xhr.send(file);
  });
}
async function uploadPrivateBlobWithRecovery(url, id, file, type_fichier = 'html') {
  let activeUrl = url;
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) {
      $('#rdx-upload-bar').value = 0;
      $('#rdx-upload-percent').textContent = '0 %';
      $('#rdx-upload-speed').textContent = 'Nouvelle tentative…';
    }
    if (cancelled) { const e = new Error('annulé'); e.cancelled = true; throw e; }
    try {
      await uploadPrivateBlob(activeUrl, file, type_fichier);
      return;
    } catch (error) {
      if (error.cancelled || cancelled) {
        const e = new Error('annulé'); e.cancelled = true; throw e;
      }
      lastError = error;
      $('#rdx-upload-label').textContent = 'Vérification de la réception…';
      status('Vérification de la réception du fichier…');
      let confirmed = false;
      let checkFailure = null;
      try {
        const checkCaptcha = await captchaToken();
        if (cancelled) { const e = new Error('annulé'); e.cancelled = true; throw e; }
        const check = await api('/upload-check', {
          method: 'POST',
          body: { id, captchaToken: checkCaptcha, size: file.size, type_fichier }
        });
        confirmed = check.uploaded === true;
        if (!confirmed) checkFailure = 'upload-check : le serveur répond uploaded=false.';
      } catch (checkError) {
        if (checkError.cancelled || cancelled) {
          const e = new Error('annulé'); e.cancelled = true; throw e;
        }
        checkFailure = 'upload-check : ' + (checkError.message || String(checkError));
      }
      if (confirmed) {
        updateUploadProgress(file.size, file.size, []);
        $('#rdx-upload-speed').textContent = 'Envoi confirmé · ' + (file.size / 1048576).toFixed(1).replace('.', ',') + ' Mo';
        return;
      }
      if (attempt === 1) {
        throw new Error(
          'Échec de l’envoi après deux tentatives. Diagnostic PUT : ' +
          (lastError.message || 'erreur inconnue') +
          (checkFailure ? ' | Diagnostic upload-check : ' + checkFailure : '')
        );
      }
      status('Nouvelle tentative sécurisée…');
      const retryCaptcha = await captchaToken();
      if (cancelled) { const e = new Error('annulé'); e.cancelled = true; throw e; }
      const signed = await api('/upload-url', {
        method: 'POST',
        body: { id, captchaToken: retryCaptcha, type_fichier, size: file.size }
      });
      activeUrl = signed.url;
    }
  }
  throw lastError || new Error('Le transfert du HTML a échoué.');
}
function mp4Of(rel) { return (rel.assets || []).find(x => x.name.toLowerCase().endsWith('.mp4')); }
function safeDownloadName(value) {
  const base = String(value || 'video').normalize('NFKC')
    .replace(/[<>:"|?*]/g, '-').replaceAll('/', '-').replaceAll(String.fromCharCode(92), '-')
    .replace(/[\u0000-\u001f]/g, '').replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '').replace(/\.mp4$/i, '').slice(0, 100).trim();
  return (base || 'video') + '.mp4';
}
function setResultExpiry(target, expiresAt) {
  if (resultExpiryTimer) clearInterval(resultExpiryTimer);
  const expiry = Date.parse(expiresAt || '');
  if (!Number.isFinite(expiry)) { target.hidden = true; return; }
  const update = () => {
    const remaining = expiry - Date.now();
    const days = Math.max(0, Math.ceil(remaining / 86400000));
    target.hidden = false;
    target.dataset.alert = String(remaining <= 3 * 86400000);
    target.textContent = remaining <= 0 ? 'Lien expiré' : 'Disponible encore ' + days + (days > 1 ? ' jours' : ' jour');
  };
  update();
  resultExpiryTimer = setInterval(update, 60000);
}
function addVideoLoadFallback(container, url, name) {
  if (container.querySelector('.video-load-error')) return;
  const fallback = document.createElement('div');
  fallback.className = 'video-load-error';
  fallback.setAttribute('role', 'alert');
  const message = document.createElement('p');
  message.textContent = 'Impossible de lire cette vidéo. Tu peux essayer de la télécharger.';
  const download = document.createElement('a');
  download.className = 'btn';
  download.href = url;
  download.download = name;
  download.textContent = 'Télécharger la vidéo';
  fallback.append(message, download);
  container.append(fallback);
}
function showResult(rel) {
  rdxTrack('render_completed');
  const a = mp4Of(rel);
  const box = $('#res'); box.textContent = '';
  resetTransition(box);
  if (!a) {
    box.textContent = 'La création est terminée, mais le fichier MP4 est introuvable.';
    revealTransition(box);
    return;
  }
  const videoId = String(rel.id || rel.tag_name || '').match(/^v[a-z0-9]{12,40}$/)?.[0] || '';
  const downloadUrl = a.browser_download_url || (videoId ? '/api/videos?action=download&id=' + encodeURIComponent(videoId) : '');
  const streamUrl = videoId ? '/api/videos?action=stream&id=' + encodeURIComponent(videoId) : downloadUrl;
  const shareUrl = videoId ? new URL('/d/' + videoId, window.location.origin).href : new URL(downloadUrl, window.location.origin).href;
  const playerCard = document.createElement('section'); playerCard.className = 'rdx-result-player';
  const frame = document.createElement('div'); frame.className = 'rdx-player-frame';
  const width = Number(rel.width), height = Number(rel.height);
  if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) frame.style.aspectRatio = width + ' / ' + height;
  const v = document.createElement('video');
  v.className = 'rdx-player-video'; v.controls = true; v.playsInline = true;
  v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', '');
  v.setAttribute('aria-label', 'Lecteur vidéo : ' + a.name); v.setAttribute('title', 'Lecteur vidéo : ' + a.name);
  v.tabIndex = 0; v.preload = 'metadata';
  if (typeof a.thumbnail_url === 'string' && a.thumbnail_url) v.poster = a.thumbnail_url;
  v.addEventListener('loadedmetadata', () => {
    if (!(width > 0 && height > 0) && v.videoWidth > 0 && v.videoHeight > 0) frame.style.aspectRatio = v.videoWidth + ' / ' + v.videoHeight;
    const duration = Number.isFinite(Number(rel.duration)) && Number(rel.duration) > 0 ? Number(rel.duration) : v.duration;
    info.textContent = 'Durée ' + mmss(duration * 1000) + ' · ' + v.videoWidth + '×' + v.videoHeight + ' · ' + size(a.size);
  });
  v.addEventListener('error', () => addVideoLoadFallback(box, downloadUrl, a.name), { once: true });
  v.src = streamUrl; frame.append(v);
  const info = document.createElement('small'); info.textContent = 'Chargement des informations vidéo…';
  playerCard.append(frame, info);
  const quality = document.createElement('div'); quality.className = 'rdx-result-meta';
  const addMeta = value => { const item = document.createElement('span'); item.textContent = value; quality.append(item); };
  if (width > 0 && height > 0) addMeta('Résolution ' + width + ' × ' + height);
  if (Number.isFinite(Number(rel.duration)) && Number(rel.duration) > 0) addMeta('Durée ' + mmss(Number(rel.duration) * 1000));
  if (Number.isFinite(Number(rel.fps)) && Number(rel.fps) > 0) addMeta('FPS ' + Number(rel.fps).toLocaleString('fr-FR', { maximumFractionDigits: 3 }));
  addMeta(size(a.size));
  addMeta(typeof rel.watermark === 'boolean' ? (rel.watermark ? 'Avec filigrane RENDRAX' : 'Sans filigrane') : 'Filigrane non renseigné');
  const nameLabel = document.createElement('label'); nameLabel.className = 'rdx-download-name';
  nameLabel.textContent = 'Nom du fichier';
  const nameInput = document.createElement('input'); nameInput.type = 'text'; nameInput.maxLength = 100;
  nameInput.autocomplete = 'off'; nameInput.spellcheck = false;
  nameInput.value = String(a.name || 'video.mp4').replace(/\.mp4$/i, '');
  nameInput.setAttribute('aria-label', 'Nom du fichier MP4 téléchargé');
  nameLabel.append(nameInput);
  const actions = document.createElement('div'); actions.className = 'rdx-result-actions';
  const dl = document.createElement('a'); dl.className = 'btn rdx-download-primary';
  const updateDownloadName = () => {
    const filename = safeDownloadName(nameInput.value);
    dl.download = filename;
    dl.href = downloadUrl + (downloadUrl.includes('?') ? '&' : '?') + 'name=' + encodeURIComponent(filename.replace(/\.mp4$/i, ''));
  };
  dl.download = safeDownloadName(nameInput.value); dl.textContent = 'Télécharger le MP4'; updateDownloadName();
  nameInput.addEventListener('input', updateDownloadName);
  const cp = document.createElement('button'); cp.type = 'button'; cp.className = 'sec'; cp.textContent = 'Copier le lien';
  const copyStatus = document.createElement('p'); copyStatus.className = 'rdx-copy-status'; copyStatus.setAttribute('role', 'status'); copyStatus.setAttribute('aria-live', 'polite');
  cp.addEventListener('click', async () => {
    try {
      if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error('Clipboard indisponible');
      await navigator.clipboard.writeText(shareUrl);
      cp.textContent = 'Lien copié ✓'; copyStatus.textContent = 'Lien de partage copié.';
    } catch (e) {
      window.prompt('Copie ce lien de partage :', shareUrl);
      copyStatus.textContent = 'Le lien est prêt à être copié.';
    }
    setTimeout(() => { cp.textContent = 'Copier le lien'; copyStatus.textContent = ''; }, 2000);
  });
  const shareBtn = document.createElement('button'); shareBtn.type = 'button'; shareBtn.className = 'sec'; shareBtn.textContent = 'Partager';
  const more = document.createElement('details'); more.className = 'rdx-share-more';
  const moreSummary = document.createElement('summary'); moreSummary.textContent = 'Plus';
  const menu = document.createElement('div'); menu.className = 'rdx-share-menu';
  const shareText = 'Regarde cette vidéo créée avec RENDRAX :';
  const social = [
    { label: 'WhatsApp', href: 'https://wa.me/?text=' + encodeURIComponent(shareText + ' ' + shareUrl) },
    { label: 'Telegram', href: 'https://t.me/share/url?url=' + encodeURIComponent(shareUrl) + '&text=' + encodeURIComponent(shareText) },
    { label: 'Facebook', href: 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(shareUrl) }
  ];
  social.forEach(item => {
    const link = document.createElement('a'); link.href = item.href; link.target = '_blank'; link.rel = 'noopener';
    link.textContent = item.label; menu.append(link);
  });
  const qrBtn = document.createElement('button'); qrBtn.type = 'button'; qrBtn.textContent = 'Afficher le QR code';
  menu.append(qrBtn); more.append(moreSummary, menu);
  shareBtn.addEventListener('click', async () => {
    if (typeof navigator.share === 'function') {
      try { await navigator.share({ title: a.name || 'Vidéo RENDRAX', text: shareText, url: shareUrl }); }
      catch (error) { if (error && error.name !== 'AbortError') { more.open = true; moreSummary.focus(); } }
    } else { more.open = true; moreSummary.focus(); }
  });
  actions.append(dl, cp, shareBtn, more);
  const expiry = document.createElement('p'); expiry.className = 'rdx-expiry'; expiry.hidden = true;
  setResultExpiry(expiry, rel.expires_at);
  box.append(playerCard, quality, nameLabel, actions, copyStatus, expiry);
  const qrDialog = document.createElement('dialog'); qrDialog.className = 'rdx-qr-dialog';
  qrDialog.setAttribute('aria-labelledby', 'rdx-qr-title');
  const qrTitle = document.createElement('h2'); qrTitle.id = 'rdx-qr-title'; qrTitle.textContent = 'QR code de partage';
  const qrDescription = document.createElement('p'); qrDescription.textContent = 'Scanne ce code avec ton téléphone pour ouvrir la page de la vidéo.';
  const qrCode = document.createElement('div'); qrCode.className = 'rdx-qr-code';
  const qrStatus = document.createElement('p'); qrStatus.className = 'rdx-copy-status'; qrStatus.setAttribute('role', 'status');
  const qrActions = document.createElement('div'); qrActions.className = 'actions';
  const qrClose = document.createElement('button'); qrClose.type = 'button'; qrClose.className = 'sec'; qrClose.textContent = 'Fermer';
  qrActions.append(qrClose); qrDialog.append(qrTitle, qrDescription, qrCode, qrStatus, qrActions); box.append(qrDialog);
  const closeQr = () => { if (typeof qrDialog.close === 'function' && qrDialog.open) qrDialog.close(); else qrDialog.removeAttribute('open'); qrBtn.focus(); };
  qrClose.addEventListener('click', closeQr);
  qrDialog.addEventListener('click', event => { if (event.target === qrDialog) closeQr(); });
  qrBtn.addEventListener('click', () => {
    try {
      if (!window.qrgen || !window.qrgen.QrCode) throw new Error('Bibliothèque QR indisponible');
      const qr = window.qrgen.QrCode.encodeText(shareUrl, window.qrgen.QrCode.Ecc.MEDIUM);
      qrCode.innerHTML = qr.toSvgString(4);
      qrStatus.textContent = 'QR code généré localement sur cet appareil.';
      if (typeof qrDialog.showModal === 'function') qrDialog.showModal(); else qrDialog.setAttribute('open', '');
      qrClose.focus();
    } catch (error) { qrStatus.textContent = 'Impossible de générer le QR code sur ce navigateur.'; }
  });
  const next = document.createElement('section'); next.className = 'rdx-result-next';
  const nextTitle = document.createElement('strong'); nextTitle.textContent = 'Que veux-tu faire ensuite ?';
  const nextActions = document.createElement('div'); nextActions.className = 'actions';
  const newVideo = document.createElement('button'); newVideo.type = 'button'; newVideo.className = 'sec'; newVideo.textContent = 'Nouvelle vidéo';
  newVideo.addEventListener('click', () => window.location.reload());
  const redo = document.createElement('button'); redo.type = 'button'; redo.className = 'sec'; redo.textContent = "Refaire avec d'autres réglages";
  redo.addEventListener('click', () => {
    $('#settingsCard').hidden = false;
    $('#settingsCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('#mode').focus({ preventScroll: true });
  });
  const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'sec danger'; remove.textContent = 'Supprimer cette vidéo';
  remove.addEventListener('click', async () => {
    if (!videoId || !await openDeleteConfirmation(a.name || 'cette vidéo', remove)) return;
    remove.disabled = true;
    const original = box.innerHTML;
    const token = 'result-' + videoId;
    const toast = showToast('Vidéo supprimée · suppression dans 5 s', 'success', 'Annuler', () => {
      clearTimeout(window.__rdxResultDeleteTimer);
      remove.disabled = false;
      showToast('Suppression annulée.', 'success');
    });
    window.__rdxResultDeleteTimer = setTimeout(async () => {
      try {
        await api('/delete-video', { method: 'POST', body: { id: videoId } });
        if (resultExpiryTimer) clearInterval(resultExpiryTimer);
        box.textContent = 'Vidéo supprimée.';
        loadList();
        showToast('Vidéo supprimée définitivement.', 'success');
      } catch (error) {
        remove.disabled = false;
        copyStatus.textContent = 'Suppression impossible : ' + explain(error);
        showToast('Suppression impossible : ' + explain(error), 'error');
      }
    }, 5000);
  });
  nextActions.append(newVideo, redo, remove); next.append(nextTitle, nextActions); box.append(next);
  if (typeof fileText === 'string' && fileText.trim()) {
    const compareBtn = document.createElement('button');
    compareBtn.type = 'button';
    compareBtn.className = 'sec';
    compareBtn.textContent = 'Comparer';
    compareBtn.setAttribute('aria-expanded', 'false');
    compareBtn.setAttribute('aria-controls', 'rdxCompareView');

    const compareView = document.createElement('section');
    compareView.id = 'rdxCompareView';
    compareView.className = 'rdx-compare-view';
    compareView.hidden = true;
    compareView.setAttribute('aria-label', 'Comparaison de la source HTML et de la vidéo finale');

    const sourcePanel = document.createElement('div');
    sourcePanel.className = 'rdx-compare-panel';
    const sourceTitle = document.createElement('h3');
    sourceTitle.textContent = 'HTML d’origine';
    const sourceFrame = document.createElement('iframe');
    sourceFrame.className = 'rdx-compare-frame';
    sourceFrame.title = 'Animation HTML d’origine';
    sourceFrame.setAttribute('sandbox', 'allow-scripts');
    sourceFrame.setAttribute('allow', 'autoplay');
    sourceFrame.hidden = true;
    sourcePanel.append(sourceTitle, sourceFrame);

    const videoPanel = document.createElement('div');
    videoPanel.className = 'rdx-compare-panel';
    const videoTitle = document.createElement('h3');
    videoTitle.textContent = 'Vidéo finale';
    videoPanel.append(videoTitle, v);
    compareView.append(sourcePanel, videoPanel);

    const compareActions = document.createElement('div');
    compareActions.className = 'actions rdx-compare-actions';
    const playBothBtn = document.createElement('button');
    playBothBtn.type = 'button';
    playBothBtn.className = 'btn';
    playBothBtn.textContent = 'Lancer les deux';
    const muteVideoBtn = document.createElement('button');
    muteVideoBtn.type = 'button';
    muteVideoBtn.className = 'sec';
    muteVideoBtn.textContent = 'Couper le son de la vidéo';
    const compareStatus = document.createElement('small');
    compareStatus.setAttribute('role', 'status');
    compareActions.append(playBothBtn, muteVideoBtn, compareStatus);
    compareView.prepend(compareActions);

    playBothBtn.addEventListener('click', () => {
      if (compareView.hidden) return;
      playBothBtn.disabled = true;
      compareStatus.textContent = 'Redémarrage des deux lectures…';
      sourceFrame.hidden = false;
      loadIsolatedPreview(sourceFrame, fileText);
      try { v.currentTime = 0; } catch (_) {}
      const playback = v.play();
      if (playback && typeof playback.then === 'function') {
        playback.then(() => {
          compareStatus.textContent = 'HTML et vidéo lancés. Le démarrage de l’HTML dépend du chargement de son aperçu.';
        }).catch(() => {
          compareStatus.textContent = 'La vidéo n’a pas pu démarrer automatiquement. Appuie sur Lecture dans le panneau vidéo.';
        }).finally(() => { playBothBtn.disabled = false; });
      } else {
        compareStatus.textContent = 'HTML rechargé ; lecture vidéo demandée.';
        playBothBtn.disabled = false;
      }
    });

    muteVideoBtn.addEventListener('click', () => {
      v.muted = !v.muted;
      muteVideoBtn.textContent = v.muted ? 'Réactiver le son de la vidéo' : 'Couper le son de la vidéo';
      muteVideoBtn.setAttribute('aria-pressed', String(v.muted));
    });

    compareBtn.addEventListener('click', () => {
      const opening = compareView.hidden;
      compareView.hidden = !opening;
      compareBtn.setAttribute('aria-expanded', String(opening));
      compareBtn.textContent = opening ? 'Fermer la comparaison' : 'Comparer';
      if (opening) {
        sourceFrame.hidden = false;
        loadIsolatedPreview(sourceFrame, fileText);
      } else {
        sourceFrame.hidden = true;
        sourceFrame.src = 'about:blank';
        delete sourceFrame.dataset.rdxPreviewReady;
        v.pause();
        frame.append(v);
      }
    });
    box.append(compareBtn, compareView);
  }

  revealTransition(box);
}
let historyItems = [];
let pendingHistoryDeletes = new Map();
let historyDeleteDialogResolve = null;
let historyDeleteFocusTarget = null;
let historyPlayerFocusTarget = null;
let historyPlayerCurrent = null;

function showToast(message, type = 'info', actionLabel = '', onAction = null) {
  const region = $('#rdxToastRegion');
  if (!region) return;
  const toast = document.createElement('div');
  toast.className = 'rdx-toast' + (type === 'error' ? ' is-error' : type === 'success' ? ' is-success' : '');
  const text = document.createElement('span');
  text.textContent = message;
  toast.append(text);
  if (actionLabel && typeof onAction === 'function') {
    const action = document.createElement('button');
    action.type = 'button'; action.className = 'rdx-toast-action'; action.textContent = actionLabel;
    action.addEventListener('click', () => { onAction(); toast.remove(); });
    toast.append(action);
  }
  const close = document.createElement('button');
  close.type = 'button'; close.className = 'rdx-toast-close'; close.setAttribute('aria-label', 'Fermer la notification'); close.textContent = '×';
  close.addEventListener('click', () => toast.remove());
  toast.append(close); region.append(toast);
  window.setTimeout(() => { toast.classList.add('is-leaving'); window.setTimeout(() => toast.remove(), 180); }, actionLabel ? 5500 : 4000);
}

function openDeleteConfirmation(name, trigger) {
  const dialog = $('#rdxDeleteDialog');
  $('#rdxDeleteName').textContent = name;
  historyDeleteFocusTarget = trigger || document.activeElement;
  return new Promise(resolve => {
    historyDeleteDialogResolve = resolve;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    $('#rdxDeleteCancel').focus();
  });
}
function finishDeleteConfirmation(confirmed) {
  const dialog = $('#rdxDeleteDialog');
  if (dialog.open && typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
  const resolve = historyDeleteDialogResolve;
  historyDeleteDialogResolve = null;
  if (resolve) resolve(confirmed);
  if (historyDeleteFocusTarget && historyDeleteFocusTarget.isConnected) historyDeleteFocusTarget.focus();
  historyDeleteFocusTarget = null;
}
$('#rdxDeleteCancel').addEventListener('click', () => finishDeleteConfirmation(false));
$('#rdxDeleteConfirm').addEventListener('click', () => finishDeleteConfirmation(true));
$('#rdxDeleteDialog').addEventListener('cancel', event => { event.preventDefault(); finishDeleteConfirmation(false); });
$('#rdxDeleteDialog').addEventListener('click', event => { if (event.target === event.currentTarget) finishDeleteConfirmation(false); });

function updateBulkBar() {
  const selected = document.querySelectorAll('#list input[data-video-select]:checked').length;
  $('#rdxSelectedCount').textContent = selected + (selected > 1 ? ' vidéos sélectionnées' : ' vidéo sélectionnée');
  $('#rdxBulkBar').hidden = selected === 0;
  $('#rdxHistoryAnnounce').textContent = selected + ' vidéo(s) sélectionnée(s).';
}
function formatRelativeDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Date inconnue';
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const abs = Math.abs(seconds);
  const units = [['an',31536000],['mois',2592000],['sem.',604800],['j',86400],['h',3600],['min',60]];
  const unit = units.find(item => abs >= item[1]);
  if (!unit) return 'à l’instant';
  const amount = Math.round(abs / unit[1]);
  const label = amount + ' ' + unit[0];
  return seconds < 0 ? 'il y a ' + label : 'dans ' + label;
}
function expiryBadge(expiresAt) {
  const time = Date.parse(expiresAt);
  if (!Number.isFinite(time)) return null;
  const days = Math.ceil((time - Date.now()) / 86400000);
  const badge = document.createElement('span');
  badge.className = 'rdx-expiry-badge' + (days <= 1 ? ' is-urgent' : days <= 3 ? ' is-soon' : '');
  badge.textContent = days <= 0 ? 'Expire bientôt' : 'Expire dans ' + days + ' j';
  badge.title = 'Expiration : ' + new Date(time).toLocaleString('fr-FR');
  return badge;
}
function closeHistoryPlayer() {
  const dialog = $('#rdxPlayerDialog');
  const video = $('#rdxHistoryModalVideo');
  video.pause(); video.removeAttribute('src'); video.load();
  if (dialog.open && typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
  historyPlayerCurrent = null;
  if (historyPlayerFocusTarget && historyPlayerFocusTarget.isConnected) historyPlayerFocusTarget.focus();
  historyPlayerFocusTarget = null;
}
$('#rdxPlayerClose').addEventListener('click', closeHistoryPlayer);
$('#rdxPlayerDialog').addEventListener('cancel', event => { event.preventDefault(); closeHistoryPlayer(); });
$('#rdxPlayerDialog').addEventListener('click', event => { if (event.target === event.currentTarget) closeHistoryPlayer(); });
function openHistoryVideo(item, trigger) {
  const asset = mp4Of(item);
  if (!asset) return;
  closeHistoryPlayer();
  const video = $('#rdxHistoryModalVideo');
  const dialog = $('#rdxPlayerDialog');
  $('#rdxPlayerTitle').textContent = asset.name;
  $('#rdxPlayerDownload').href = item.id ? '/api/videos?action=download&id=' + encodeURIComponent(item.id) : asset.browser_download_url;
  $('#rdxPlayerDownload').setAttribute('download', asset.name || 'video.mp4');
  if (asset.thumbnail_url) video.poster = asset.thumbnail_url;
  video.src = item.id ? '/api/videos?action=stream&id=' + encodeURIComponent(item.id) : asset.browser_download_url;
  historyPlayerFocusTarget = trigger;
  historyPlayerCurrent = item.id;
  if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
  $('#rdxPlayerClose').focus();
}
function scheduleHistoryDelete(records, label) {
  const entries = records.map(({id,li}) => ({id,li,originalDisplay:li.style.display}));
  entries.forEach(entry => { entry.li.hidden = true; });
  const token = 'delete-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  const pending = {entries, timer:null};
  pending.timer = window.setTimeout(async () => {
    pendingHistoryDeletes.delete(token);
    const results = await Promise.allSettled(entries.map(entry => api('/delete-video', {method:'POST',body:{id:entry.id}})));
    const succeeded = results.filter(result => result.status === 'fulfilled').length;
    const deletedIds=new Set();
    entries.forEach((entry,index) => {
      if (results[index].status === 'fulfilled' || results[index].reason?.status === 404) { entry.li.remove(); deletedIds.add(entry.id); }
      else entry.li.hidden = false;
    });
    historyItems=historyItems.filter(item=>!deletedIds.has(item.id));
    renderHistoryList();
    showToast(succeeded + ' / ' + entries.length + ' vidéo(s) supprimée(s).' + (succeeded < entries.length ? ' Certaines suppressions ont échoué.' : ''), succeeded === entries.length ? 'success' : 'error');
    updateBulkBar();
  }, 5000);
  pendingHistoryDeletes.set(token,pending);
  showToast(label + ' · suppression dans 5 s', 'success', 'Annuler', () => {
    window.clearTimeout(pending.timer);
    pendingHistoryDeletes.delete(token);
    entries.forEach(entry => { entry.li.hidden = false; entry.li.style.display = entry.originalDisplay; });
    renderHistoryList();
    updateBulkBar();
    showToast('Suppression annulée.', 'success');
  });
}
function renderHistoryEmpty() {
  const ul = $('#list'); ul.textContent = '';
  const li = document.createElement('li'); li.className = 'empty rdx-history-empty';
  const icon = document.createElement('span'); icon.className = 'rdx-empty-icon'; icon.setAttribute('aria-hidden','true'); icon.textContent = '▣';
  const title = document.createElement('strong'); title.textContent = 'Ton historique est vide';
  const copy = document.createElement('span'); copy.textContent = 'Les vidéos générées apparaîtront ici. Importe un fichier HTML pour créer ta première vidéo.';
  const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Créer une vidéo'; button.addEventListener('click', () => $('#fileCard').scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'}));
  li.append(icon,title,copy,button); ul.append(li);
}
function renderHistoryList() {
  const ul=$('#list'); ul.textContent='';
  const query=($('#rdxHistorySearch')?.value||'').trim().toLocaleLowerCase('fr');
  const sort=$('#rdxHistorySort')?.value||'recent';
  const pendingIds=new Set([...pendingHistoryDeletes.values()].flatMap(pending=>pending.entries.map(entry=>entry.id)));
  const items=historyItems.filter(item=>!pendingIds.has(item.id)&&String(mp4Of(item)?.name||'').toLocaleLowerCase('fr').includes(query));
  items.sort((a,b)=>sort==='oldest'?Date.parse(a.created_at)-Date.parse(b.created_at):sort==='size'?(Number(mp4Of(b)?.size)||0)-(Number(mp4Of(a)?.size)||0):Date.parse(b.created_at)-Date.parse(a.created_at));
  if(!items.length){if(!historyItems.length)renderHistoryEmpty();else{const li=document.createElement('li');li.className='empty';li.textContent='Aucun résultat pour cette recherche.';ul.append(li);}$('#rdxHistoryAnnounce').textContent='0 résultat.';return;}
  for(const r of items){
    const a=mp4Of(r); if(!a)continue;
    const li=document.createElement('li'); li.dataset.videoId=r.id||'';
    const row=document.createElement('div');row.className='video-list-row';
    const selectLabel=document.createElement('label');selectLabel.className='rdx-video-select';
    const select=document.createElement('input');select.type='checkbox';select.dataset.videoSelect='';select.value=r.id||'';select.setAttribute('aria-label','Sélectionner '+a.name);select.addEventListener('change',updateBulkBar);
    selectLabel.append(select);
    const thumb=document.createElement('div');thumb.className='video-thumb';
    if(a.thumbnail_url){const image=document.createElement('img');image.src=a.thumbnail_url;image.alt='Aperçu de la vidéo : '+a.name;image.loading='lazy';image.decoding='async';image.width=176;image.height=112;image.onerror=()=>{image.remove();const fallback=document.createElement('span');fallback.className='video-thumb-fallback';fallback.textContent='Aperçu indisponible';thumb.append(fallback);};thumb.append(image);}
    else{const fallback=document.createElement('span');fallback.className='video-thumb-fallback';fallback.textContent='Aperçu indisponible';thumb.append(fallback);}
    const meta=document.createElement('div');meta.className='meta';
    const link=document.createElement('a');link.href=r.id?'/d/'+encodeURIComponent(r.id):a.browser_download_url;link.textContent=a.name;
    const date=document.createElement('small');date.textContent=formatRelativeDate(r.created_at);date.title=new Date(r.created_at).toLocaleString('fr-FR');
    const details=document.createElement('small');details.textContent=size(a.size);
    const expiry=expiryBadge(r.expires_at);meta.append(link,date,details);if(expiry)meta.append(expiry);
    const actions=document.createElement('div');actions.className='video-list-actions';
    const watch=document.createElement('button');watch.type='button';watch.className='sec';watch.textContent='Regarder';watch.setAttribute('aria-label','Regarder la vidéo '+a.name);watch.addEventListener('click',()=>openHistoryVideo(r,watch));
    const del=document.createElement('button');del.type='button';del.className='sec danger';del.textContent='Supprimer';del.setAttribute('aria-label','Supprimer la vidéo '+a.name);
    del.addEventListener('click',async()=>{
      if(!await openDeleteConfirmation(a.name,del))return;
      if(r.id)scheduleHistoryDelete([{id:r.id,li}], 'Vidéo supprimée');
      else showToast('Identifiant vidéo manquant : suppression impossible.','error');
    });
    actions.append(watch,del);
    const menu=document.createElement('button');menu.type='button';menu.className='rdx-row-menu';menu.textContent='⋯';menu.setAttribute('aria-label','Actions pour '+a.name);
    menu.addEventListener('click',()=>{
      const dialog=$('#rdxRowActionsDialog'),buttons=$('#rdxRowActionsButtons');
      $('#rdxRowActionsTitle').textContent=a.name;buttons.textContent='';
      [[watch,'Regarder'],[del,'Supprimer']].forEach(([original,label])=>{const action=document.createElement('button');action.type='button';action.className=original.className;action.textContent=label;action.addEventListener('click',()=>{dialog.close();original.click();});buttons.append(action);});
      if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
      $('#rdxRowActionsClose').focus();
    });
    row.append(selectLabel,thumb,meta,actions,menu);li.append(row);ul.append(li);
  }
  $('#rdxHistoryAnnounce').textContent=items.length+' résultat(s).';
}
async function loadList() {
  const ul=$('#list');
  try{
    const data=await api('/videos');
    const generatedCount=$('#rdx-generated-count');
    if(generatedCount&&Number.isSafeInteger(data.generatedCount)&&data.generatedCount>=0){generatedCount.textContent=data.generatedCount.toLocaleString('fr-FR')+' vidéos générées';generatedCount.hidden=false;}
    else if(generatedCount){generatedCount.textContent='';generatedCount.hidden=true;}
    historyItems=Array.isArray(data.items)?data.items:[];
    ul.setAttribute('aria-busy','false');
    renderHistoryList();
  }catch(error){
    closeHistoryPlayer();ul.setAttribute('aria-busy','false');ul.textContent='';
    const li=document.createElement('li');li.className='empty';li.textContent='Historique indisponible : '+explain(error);ul.append(li);
    showToast('Impossible de charger l’historique.','error');
  }
}
$('#rdxHistorySearch').addEventListener('input',renderHistoryList);
$('#rdxHistorySort').addEventListener('change',renderHistoryList);
$('#rdxSelectAll').addEventListener('click',()=>{
  const boxes=[...document.querySelectorAll('#list input[data-video-select]')];
  const all=boxes.length>0&&boxes.every(box=>box.checked);
  boxes.forEach(box=>{box.checked=!all;});
  updateBulkBar();
});
$('#rdxBulkDelete').addEventListener('click',async()=>{
  const boxes=[...document.querySelectorAll('#list input[data-video-select]:checked')];
  const records=boxes.map(box=>({id:box.value,li:box.closest('li'),name:box.closest('li')?.querySelector('.meta a')?.textContent||''})).filter(item=>item.id&&item.li);
  if(!records.length)return;
  if(!await openDeleteConfirmation(records.length+' vidéos sélectionnées', $('#rdxBulkDelete')))return;
  scheduleHistoryDelete(records,'Suppression groupée de '+records.length+' vidéos');
});
async function waitJob(id, t0) {
  let polls = 0, lastWorkflowStep = '', pollInterval = 6000;
  const progressSamples = [];
  const progressState = { maxPercent: 0, maxCurrent: 0 };
  resetRenderProgress();
  while (Date.now() - t0 < 95 * 60000) {
    if (cancelled) { const e = new Error('annulé'); e.cancelled = true; throw e; }
    if (polls > 0) await waitForVisiblePoll(pollInterval);
    if (cancelled) { const e = new Error('annulé'); e.cancelled = true; throw e; }
    const showDetails = polls++ % 3 === 0;
    let job;
    try {
      job = await apiWithRetry('/job?id=' + encodeURIComponent(id) + (showDetails ? '&details=1' : ''));
      setNetworkBanner(false);
      pollInterval = Math.min(30000, pollInterval + 3000);
    } catch (error) {
      if (!isRetryableJobError(error)) throw error;
      setNetworkBanner(true);
      pollInterval = Math.min(30000, Math.round(pollInterval * 1.5));
      continue;
    }
    const elapsedMs = Date.now() - t0;
    const elapsed = mmss(elapsedMs);
    if (!job.found) {
      updateRenderProgress(null, elapsedMs, progressSamples, progressState, 'En attente du démarrage');
      setSteps(1); status('Démarrage du rendu… (' + elapsed + ')');
      continue;
    }
    const progress = job.progress && typeof job.progress === 'object' ? job.progress : null;
    if (progress && progress.phase === 'rendu' &&
        Number.isSafeInteger(progress.current) && progress.current >= 0 &&
        Number.isSafeInteger(progress.total) && progress.total > 0) {
      progressState.maxCurrent = Math.max(progressState.maxCurrent, progress.current);
      const previous = progressSamples[progressSamples.length - 1];
      if (!previous || progress.current > previous.current) {
        progressSamples.push({ at: Date.now(), current: progress.current });
        if (progressSamples.length > 5) progressSamples.shift();
      }
    }
    updateRenderProgress(progress, elapsedMs, progressSamples, progressState,
      job.status === 'queued' ? 'En attente du démarrage' : 'Préparation du rendu');
    currentRunId = job.runId || currentRunId;
    if (job.currentStep) lastWorkflowStep = job.currentStep;
    if (job.status !== 'completed') {
      if (lastWorkflowStep) {
        setSteps(workflowStepIndex(lastWorkflowStep, progress && progress.phase));
        status(workflowStepLabel(lastWorkflowStep, progress && progress.phase) + ' (' + elapsed + ')', null, job.html_url);
      } else {
        setSteps(job.status === 'queued' ? 1 : 2);
        status((job.status === 'queued' ? 'En file d’attente… ' : 'Rendu en cours… ') + '(' + elapsed + ')', null, job.html_url);
      }
      hint('Le suivi identifie automatiquement l’étape en cours. Tu peux quitter cette page : il reprendra à ton retour.');
      continue;
    }
    if (job.conclusion !== 'success') {
      const failedStep = job.currentStep || lastWorkflowStep;
      const where = failedStep ? workflowStepLabel(failedStep).replace(/…$/, '') : '';
      const e = new Error(where ? 'La création a échoué : ' + where + '. Consulte les détails techniques pour en connaître la cause.' : 'La création de la vidéo a échoué. Consulte les détails techniques pour connaître la cause.');
      e.url = job.html_url; throw e;
    }
    if (job.release) return job.release;
    setSteps(3); status('Préparation de la vidéo finale… (' + elapsed + ')');
  }
  throw new Error('Délai dépassé (plus de 95 minutes).');
}
async function finish(rel, testOnly = false) {
  releaseWakeLock();
  showResult(rel); setSteps(5); status('Terminé ✓', 'ok'); hint('');
  document.title = '✅ Vidéo prête · RENDRAX';
  if ('Notification' in window && Notification.permission === 'granted') {
    try { new Notification('RENDRAX · Vidéo prête', { body: 'Ton rendu MP4 est terminé.' }); } catch (e) {}
  }
  if (testOnly) {
    store.set('kidas_test_render_success', '1');
    updateTestRenderRecommendation();
  }
  resetRenderProgress();
  store.set('kidas_job', null); loadList();
}
function fail(e, step) {
  releaseWakeLock();
  setSteps(step, step);
  status((e.cancelled ? '' : '✗ ') + explain(e), e.cancelled ? 'mut' : 'err', e.url);
  if (!e.cancelled) renderErrorActions(e);
  hint(''); resetRenderProgress(); store.set('kidas_job', null);
  $('#rdx-cancel-confirm').hidden = true; $('#cancel').setAttribute('aria-expanded', 'false');
  if (!e.cancelled) document.title = 'Échec du rendu · RENDRAX';
}
function currentStepIndex() { return [...$('#steps').children].findIndex(li => li.dataset.s === 'active'); }
async function cleanupUpload(id, type_fichier = 'html') {
  try { await api('/cleanup', { method: 'POST', body: { id, type_fichier } }); } catch (e) {}
}
function newRenderId() {
  return 'v' + Date.now().toString(36) + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}
async function go(testOnly = false, reducedQuality = false) {
  if (busy) return;
  lastAttemptTestOnly = testOnly;
  if ('Notification' in window && Notification.permission === 'default' && typeof Notification.requestPermission === 'function') {
    try { Notification.requestPermission().catch(() => {}); } catch (e) {}
  }
  const f = $('#file').files[0];
  if (zipLoading) return status('Inspection du ZIP en cours…', 'warn');
  const isZip = !!(f && /\.zip$/i.test(f.name));
  const type_fichier = isZip ? 'zip' : 'html';
  if (isZip) {
    if (!zipSelection || zipSelection.file !== f) return status('Le ZIP doit être inspecté avant de continuer.', 'err');
    if (!zipSelection.mainPath) return status('Choisis le HTML principal dans la liste des fichiers ZIP.', 'err');
    if (!zipSelection.analysis || zipSelection.analysis.kind === 'invalid') return status('La page principale du fichier ZIP n’a pas passé les vérifications.', 'err');
  }
  revealTransition($('#progCard'));
  if (!securityReady) { setSteps(-1); return status(securityMessage || 'La sécurité du serveur n’est pas configurée.', 'err'); }
  if (!f) { setSteps(-1); return status('Choisis un fichier HTML ou ZIP.', 'err'); }
  if (!verdict) await checkFile();
  if (!verdict || hasBlockingFinding(verdict)) { setSteps(-1); return status('Fichier refusé : le rapport contient un élément bloquant.', 'err'); }
  const m = testOnly ? MODES.test : (reducedQuality ? MODES.half : MODES[$('#mode').value]);
  const fileName = isZip ? zipSelection.mainPath.split('/').pop() : f.name;
  if (localSource && localSource.file !== f) localSource = null;
  const needsUpload = !localSource;
  const sourceId = localSource ? localSource.id : newRenderId();
  const id = newRenderId();
  const htmlPrincipal = isZip ? zipSelection.mainPath : '';
  const t0 = Date.now();
  cancelled = false; currentRunId = null; setBusy(true); $('#res').textContent = ''; resetTransition($('#res')); hint(''); resetRenderProgress();
  let step = 0, uploadComplete = false, dispatchAccepted = false;
  try {
    setSteps(0);
    resetUploadProgress();
    if (!needsUpload) {
      uploadComplete = true;
      status('Fichier déjà enregistré dans le stockage privé…');
    } else {
      localSource = { id: sourceId, file: f, type_fichier, name: fileName };
      status('Vérification de sécurité…');
      const uploadCaptcha = await captchaToken();
      if (cancelled) { const e = new Error('annulé'); e.cancelled = true; throw e; }
      const signed = await api('/upload-url', { method: 'POST', body: { id: sourceId, captchaToken: uploadCaptcha, type_fichier, size: f.size } });
      await uploadPrivateBlobWithRecovery(signed.url, sourceId, f, type_fichier);
      uploadComplete = true;
      $('#cancel').textContent = 'Annuler le rendu';
      resetUploadProgress();
    }
    if (cancelled) { const e = new Error('annulé'); e.cancelled = true; throw e; }
    step = 1; setSteps(1); status('Préparation du rendu…');
    const renderCaptcha = await captchaToken();
    if (cancelled) { const e = new Error('annulé'); e.cancelled = true; throw e; }
    await api('/render', { method: 'POST', body: {
      id, source_id: sourceId, captchaToken: renderCaptcha, type_fichier, html_principal: htmlPrincipal, scale: m.scale, test: m.test,
      duration: $('#duration').value, format: $('#format').value, watermark: $('#watermark').checked, loudnorm: $('#loudnorm').checked,
      audio_offset_ms: Number($('#audioOffset').value), name: fileName.replace(/\.(?:html?|zip)$/i, '')
    }});
    dispatchAccepted = true;
    lastSourceForRetry = { id: sourceId, type_fichier, html_principal: htmlPrincipal, name: fileName };
    store.set('kidas_job', JSON.stringify({ id, t0 }));
    step = 2;
    await requestWakeLock();
    await finish(await waitJob(id, t0), testOnly);
  } catch (e) {
    if (e.status === 410 && localSource) {
      localSource = null;
      lastSourceForRetry = null;
      $('#file').value = '';
      $('#fileinfo').hidden = true;
      zipSelection = null;
      clearZipInspector();
      resetPreview();
      verdict = null;
      syncGoButton();
    }
    if (needsUpload && e.cancelled && !dispatchAccepted) {
      await cleanupUpload(sourceId, type_fichier);
      if (localSource && localSource.id === sourceId) localSource = null;
    }
    if (needsUpload && uploadComplete && !dispatchAccepted && e.status && e.status >= 400) {
      await cleanupUpload(sourceId, type_fichier);
      if (localSource && localSource.id === sourceId) localSource = null;
    }
    const s = currentStepIndex();
    fail(e, s >= 0 ? s : step);
    resetUploadProgress();
    $('#cancel').textContent = 'Annuler le rendu';
  }
  setBusy(false);
}
async function cancel() {
  cancelled = true;
  $('#rdx-cancel-confirm').hidden = true; $('#cancel').setAttribute('aria-expanded', 'false');
  $('#cancel').disabled = true;
  status('Annulation en cours…');
  if (currentUploadXhr) currentUploadXhr.abort();
  if (currentRunId) {
    try { await api('/cancel', { method: 'POST', body: { runId: currentRunId } }); } catch (e) {}
  }
}
async function resume() {
  const raw = store.get('kidas_job');
  if (!raw) return false;
  let job;
  try { job = JSON.parse(raw); }
  catch (e) { store.set('kidas_job', null); return false; }
  if (!job.id || !Number.isFinite(job.t0) || Date.now() - job.t0 > 95 * 60000) {
    store.set('kidas_job', null);
    return false;
  }
  cancelled = false; setBusy(true); revealTransition($('#progCard')); setSteps(-1); status('Récupération de l’état du rendu…');
  try { await requestWakeLock(); await finish(await waitJob(job.id, job.t0)); }
  catch (e) {
    const activeStep = currentStepIndex();
    fail(e, activeStep >= 0 ? activeStep : 1);
  }
  setBusy(false);
  return true;
}
const TUTORIAL_KEY = 'rendrax_tuto_vu';
let tutorialReturnFocus = null;
let tutorialIndex = 0;
function setTutorialStep(index) {
  const dialog = $('#rdxTutorial');
  const steps = [...dialog.querySelectorAll('[data-tutorial-step]')];
  tutorialIndex = Math.max(0, Math.min(steps.length - 1, index));
  steps.forEach((step, i) => { step.hidden = i !== tutorialIndex; });
  [...dialog.querySelectorAll('.rdx-tutorial-progress span')].forEach((dot, i) => {
    dot.classList.toggle('is-active', i === tutorialIndex);
  });
  const activeHeading = steps[tutorialIndex].querySelector('h2');
  const activeDescription = steps[tutorialIndex].querySelector('.rdx-tutorial-copy');
  dialog.setAttribute('aria-labelledby', activeHeading.id);
  if (activeDescription) dialog.setAttribute('aria-describedby', activeDescription.id);
  else dialog.removeAttribute('aria-describedby');
  $('#rdxTutorialCount').textContent = (tutorialIndex + 1) + ' / ' + steps.length;
  $('#rdxTutorialPrev').hidden = tutorialIndex === 0;
  $('#rdxTutorialNext').textContent = tutorialIndex === steps.length - 1 ? 'Terminer' : 'Suivant';
}
function openTutorial(trigger = null) {
  const dialog = $('#rdxTutorial');
  if (busy || dialog.open || typeof dialog.showModal !== 'function') return;
  tutorialReturnFocus = trigger || document.activeElement;
  setTutorialStep(0);
  dialog.showModal();
  $('#rdxTutorialNext').focus();
}
function initTutorial() {
  const dialog = $('#rdxTutorial');
  $('#rdxTutorialLink').addEventListener('click', event => {
    event.preventDefault();
    openTutorial($('#rdxTutorialLink'));
  });
  $('#rdxTutorialPrev').addEventListener('click', () => {
    setTutorialStep(tutorialIndex - 1);
    $('#rdxTutorialPrev').focus();
  });
  $('#rdxTutorialNext').addEventListener('click', () => {
    if (tutorialIndex < 2) {
      setTutorialStep(tutorialIndex + 1);
      $('#rdxTutorialNext').focus();
    } else {
      dialog.close();
    }
  });
  $('#rdxTutorialSkip').addEventListener('click', () => dialog.close());
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const focusable = [...dialog.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter(element => !element.hidden && element.getClientRects().length > 0);
    if (!focusable.length) { event.preventDefault(); return; }
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
      event.preventDefault(); first.focus();
    }
  });
  dialog.addEventListener('close', () => {
    store.set(TUTORIAL_KEY, '1');
    const target = tutorialReturnFocus;
    tutorialReturnFocus = null;
    if (target && target.isConnected && typeof target.focus === 'function') target.focus();
    else $('#file').focus();
  });
}
$('#file').onchange = () => {
  if (localSource && localSource.file !== $('#file').files[0]) localSource = null;
  checkFile();
};
function setSourceTab(tab) {
  const paste = tab === 'paste';
  $('#rdx-file-tab').classList.toggle('is-active', !paste);
  $('#rdx-paste-tab').classList.toggle('is-active', paste);
  $('#rdx-file-tab').setAttribute('aria-selected', String(!paste));
  $('#rdx-paste-tab').setAttribute('aria-selected', String(paste));
  $('#rdx-file-panel').hidden = paste;
  $('#rdx-paste-panel').hidden = !paste;
  if (paste) $('#rdx-paste-html').focus();
}
function createFileFromPastedHtml() {
  const code = $('#rdx-paste-html').value;
  const error = $('#rdx-paste-error');
  error.hidden = true;
  error.textContent = '';
  const blob = new Blob([code], { type: 'text/html;charset=utf-8' });
  if (!code.trim()) {
    error.textContent = 'Colle une page HTML avant de continuer.';
    error.hidden = false;
    return;
  }
  if (blob.size > MAX_BYTES) {
    error.textContent = 'Code trop volumineux : ' + size(blob.size) + ' (limite : 50 Mo). Réduis le code ou ses ressources intégrées.';
    error.hidden = false;
    return;
  }
  const file = new File([blob], 'code-colle.html', { type: 'text/html', lastModified: Date.now() });
  localSource = null;
  zipSelection = null;
  const transfer = new DataTransfer();
  transfer.items.add(file);
  $('#file').files = transfer.files;
  setSourceTab('file');
  const createButton = $('#rdx-paste-create');
  window.RDXButton.setLoading(createButton, true, 'Analyse en cours…');
  checkFile().then(() => {
    if (verdict && verdict.kind !== 'invalid' && !hasBlockingFinding(verdict)) {
      $('#settingsCard').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    }
  }).catch(error => {
    $('#rdx-paste-error').textContent = error && error.message ? error.message : 'Impossible d’analyser ce code.';
    $('#rdx-paste-error').hidden = false;
  }).finally(() => window.RDXButton.setLoading(createButton, false));
}
$('#rdx-file-tab').addEventListener('click', () => setSourceTab('file'));
$('#rdx-paste-tab').addEventListener('click', () => setSourceTab('paste'));
$('#rdx-paste-html').addEventListener('input', () => {
  const bytes = new Blob([$('#rdx-paste-html').value]).size;
  $('#rdx-paste-size').textContent = size(bytes) + ' / 50 Mo';
  $('#rdx-paste-error').hidden = true;
});
$('#rdx-paste-create').addEventListener('click', createFileFromPastedHtml);

$('#rdx-hero-file-cta').addEventListener('click', () => {
  const fileCard = $('#fileCard');
  const drop = $('#drop');
  const fileInput = $('#file');
  fileCard.scrollIntoView({
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    block: 'start'
  });
  drop.focus({ preventScroll: true });
  if (!fileInput.disabled) fileInput.click();
});
$('#zipMainFile').onchange = () => chooseZipMain($('#zipMainFile').value);
$('#go').onclick = () => go(false);
updatePreRenderSummary();
function updateTestRenderRecommendation() {
  const completed = store.get('kidas_test_render_success') === '1';
  const recommendation = $('#testRenderRecommendation');
  const badge = $('#testRenderBadge');
  if (!recommendation || !badge) return;
  badge.hidden = completed;
  recommendation.classList.toggle('is-completed', completed);
}
$('#testRender').onclick = () => go(true);
updateTestRenderRecommendation();
function initContextualHelp() {
  const triggers = [...document.querySelectorAll('.help-trigger[aria-controls]')];
  function closeHelp(trigger, restoreFocus = false) {
    const tooltip = document.getElementById(trigger.getAttribute('aria-controls'));
    if (!tooltip) return;
    tooltip.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger.focus();
  }
  function closeOthers(except) {
    triggers.forEach(trigger => { if (trigger !== except) closeHelp(trigger); });
  }
  triggers.forEach(trigger => {
    const tooltip = document.getElementById(trigger.getAttribute('aria-controls'));
    if (!tooltip) return;
    const ids = {
      helpMode: ['modeCards', 'mode'],
      helpWatermark: ['watermark'],
      helpDuration: ['duration'],
      helpAudioOffset: ['audioOffset', 'audioOffsetNumber'],
      helpLoudnorm: ['loudnorm']
    };
    (ids[tooltip.id] || []).forEach(id => {
      const control = document.getElementById(id);
      if (control) {
        const describedBy = (control.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
        if (!describedBy.includes(tooltip.id)) describedBy.push(tooltip.id);
        control.setAttribute('aria-describedby', describedBy.join(' '));
      }
    });
    trigger.addEventListener('click', () => {
      const opening = trigger.getAttribute('aria-expanded') !== 'true';
      closeOthers(trigger);
      tooltip.hidden = !opening;
      trigger.setAttribute('aria-expanded', String(opening));
    });
    trigger.addEventListener('keydown', event => {
      if (event.key === 'Escape' && trigger.getAttribute('aria-expanded') === 'true') {
        event.preventDefault();
        closeHelp(trigger, true);
      }
    });
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const opened = triggers.find(trigger => trigger.getAttribute('aria-expanded') === 'true');
    if (opened) { event.preventDefault(); closeHelp(opened, true); }
  });
  document.addEventListener('click', event => {
    if (event.target.closest('.help-trigger, .help-tooltip')) return;
    triggers.forEach(trigger => closeHelp(trigger));
  });
}
function setAudioOffset(value, persist = true) {
  const slider = $('#audioOffset');
  const number = $('#audioOffsetNumber');
  const parsed = Number(value);
  const bounded = Number.isFinite(parsed) ? Math.round(Math.max(-2000, Math.min(2000, parsed)) / 10) * 10 : 0;
  slider.value = String(bounded);
  number.value = String(bounded);
  $('#audioOffsetValue').textContent = (bounded > 0 ? '+' : '') + bounded + ' ms';
  updateAdvancedSettingsSummary();
  if (persist) saveRenderPrefs();
}
$('#audioOffset').addEventListener('input', () => setAudioOffset($('#audioOffset').value, false));
$('#audioOffset').addEventListener('change', () => setAudioOffset($('#audioOffset').value));
$('#audioOffsetNumber').addEventListener('input', () => {
  if ($('#audioOffsetNumber').value.trim() !== '') setAudioOffset($('#audioOffsetNumber').value, false);
});
$('#audioOffsetNumber').addEventListener('change', () => setAudioOffset($('#audioOffsetNumber').value));
document.querySelectorAll('[data-offset-step]').forEach(button => {
  button.addEventListener('click', () => setAudioOffset(Number($('#audioOffset').value) + Number(button.dataset.offsetStep)));
});
$('#audioOffsetReset').addEventListener('click', () => setAudioOffset(0));
let activeWakeLock = null;
async function requestWakeLock() {
  if (!('wakeLock' in navigator) || typeof navigator.wakeLock.request !== 'function') return;
  try { if (activeWakeLock && !activeWakeLock.released) return; activeWakeLock = await navigator.wakeLock.request('screen'); activeWakeLock.addEventListener('release', () => { activeWakeLock = null; }); }
  catch (e) { activeWakeLock = null; }
}
function releaseWakeLock() {
  if (!activeWakeLock) return;
  const lock = activeWakeLock; activeWakeLock = null;
  try { lock.release().catch(() => {}); } catch (e) {}
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && busy) requestWakeLock(); });
async function offerResumeIfAvailable() {
  const raw = store.get('kidas_job'); if (!raw) return false;
  let saved; try { saved = JSON.parse(raw); } catch (e) { store.set('kidas_job', null); return false; }
  if (!saved || !saved.id || !Number.isFinite(saved.t0) || Date.now() - saved.t0 > 95 * 60000) { store.set('kidas_job', null); return false; }
  try {
    const job = await apiWithRetry('/job?id=' + encodeURIComponent(saved.id));
    if (!job || job.found !== true) { store.set('kidas_job', null); return false; }
    $('#rdx-resume-prompt').hidden = false; return true;
  } catch (e) { $('#rdx-resume-prompt').hidden = false; return true; }
}
$('#rdx-resume-button').onclick = async () => { $('#rdx-resume-prompt').hidden = true; await resume(); };
$('#rdx-resume-dismiss').onclick = () => { $('#rdx-resume-prompt').hidden = true; $('#file').focus(); };
$('#cancel').onclick = () => {
  const prompt = $('#rdx-cancel-confirm'); prompt.hidden = !prompt.hidden;
  $('#cancel').setAttribute('aria-expanded', String(!prompt.hidden));
  if (!prompt.hidden) $('#rdx-cancel-yes').focus();
};
$('#rdx-cancel-yes').onclick = cancel;
$('#rdx-cancel-no').onclick = () => { $('#rdx-cancel-confirm').hidden = true; $('#cancel').setAttribute('aria-expanded', 'false'); $('#cancel').focus(); };
$('#rdx-copy-log').onclick = async () => {
  const value = $('#rdx-technical-log').textContent, output = $('#rdx-copy-status');
  try { if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error('Clipboard indisponible'); await navigator.clipboard.writeText(value); output.textContent = 'Journal copié.'; }
  catch (e) {
    const area = document.createElement('textarea'); area.value = value; area.setAttribute('readonly', ''); area.style.position = 'fixed'; area.style.opacity = '0';
    document.body.append(area); area.select(); const copied = document.execCommand('copy'); area.remove();
    output.textContent = copied ? 'Journal copié.' : 'Copie impossible sur ce navigateur.';
  }
};
$('#refresh').onclick = loadList;
$('#format').addEventListener('change', applyPreviewFormat);
$('#watermark').addEventListener('change', updateWatermarkPreview);
applyPreviewFormat();
updateWatermarkPreview();
$('#prevBtn').onclick = () => {
  const source = zipSelection && zipSelection.mainText ? zipSelection.mainText : fileText;
  renderPreview(source);
};
const drop = $('#drop');
let dropDepth = 0;
drop.addEventListener('dragenter', e => {
  e.preventDefault();
  dropDepth++;
  if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) setDropState('drag');
});
drop.addEventListener('dragover', e => {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  if (drop.dataset.state !== 'drag') setDropState('drag');
});
drop.addEventListener('dragleave', e => {
  e.preventDefault();
  dropDepth = Math.max(0, dropDepth - 1);
  if (!dropDepth && drop.dataset.state === 'drag') {
    const file = $('#file').files[0];
    setDropState(file ? 'accepted' : 'idle', '', file);
  }
});
drop.addEventListener('drop', e => {
  e.preventDefault();
  dropDepth = 0;
  setFile(e.dataTransfer && e.dataTransfer.files);
});
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => e.preventDefault());

/* Proposition 100 — rapport de problème sans pièce jointe ni contenu utilisateur. */
(function initFeedback() {
  const link = document.getElementById('rdxFeedback');
  if (!link) return;
  link.addEventListener('click', () => {
    let jobId = '';
    try {
      const raw = store.get('kidas_job');
      const saved = raw ? JSON.parse(raw) : null;
      if (saved && typeof saved.id === 'string') jobId = saved.id;
    } catch (_) {}
    const quality = document.getElementById('mode');
    const format = document.getElementById('format');
    const duration = document.getElementById('duration');
    const lines = [
      'Décris le problème rencontré :',
      '',
      '--- Diagnostic automatique ---',
      'Identifiant de tâche : ' + (jobId || 'non disponible'),
      'Navigateur : ' + String(navigator.userAgent || 'non disponible').slice(0, 300),
      'Qualité : ' + (quality ? quality.value : 'non disponible'),
      'Format : ' + (format ? format.value : 'non disponible'),
      'Durée : ' + (duration ? duration.value : 'non disponible'),
      '',
      'Aucun fichier HTML/ZIP ni contenu utilisateur n’est joint automatiquement.'
    ];
    link.href = 'https://github.com/kidasniger/RENDRAX/issues/new?title=' +
      encodeURIComponent('[RENDRAX] Signalement de problème') + '&body=' + encodeURIComponent(lines.join('\n'));
  });
})();

/* Proposition 94 — numérotation continue des sections affichées. */
(function initSectionNumbers() {
  const selectors = ['#fileCard', '#settingsCard', '#progCard', '.examples-card', '.rdx-history-card'];
  const update = () => {
    let number = 0;
    selectors.forEach(selector => {
      const section = document.querySelector(selector);
      if (!section || section.hidden || getComputedStyle(section).display === 'none') return;
      const marker = section.querySelector('[data-section-number]');
      if (marker) marker.textContent = String(++number).padStart(2, '0');
    });
  };
  update();
  if ('MutationObserver' in window) {
    const observer = new MutationObserver(update);
    selectors.forEach(selector => {
      const section = document.querySelector(selector);
      if (section) observer.observe(section, { attributes: true, attributeFilter: ['hidden', 'open', 'class'] });
    });
  }
  window.addEventListener('resize', update, { passive: true });
})();

initAdvancedSettings();
initRenderPrefs();
initModeCards();
initUsagePresets();
updateRenderEstimate();
loadList();
initSecurity();
initTutorial();
offerResumeIfAvailable().then(hasJob => {
  if (!hasJob && store.get(TUTORIAL_KEY) !== '1') openTutorial($('#file'));
});

(function(){
const dialog=document.getElementById('rdxRowActionsDialog'),close=document.getElementById('rdxRowActionsClose');
if(dialog&&close){close.addEventListener('click',()=>dialog.close());dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});dialog.addEventListener('cancel',e=>{e.preventDefault();dialog.close()});}
})();

(function(){
const offline=document.getElementById('rdxOfflineBanner'),update=document.getElementById('rdxUpdateBanner'),install=document.getElementById('rdxInstallPrompt');
const network=()=>{if(offline)offline.hidden=navigator.onLine};addEventListener('online',network);addEventListener('offline',network);network();
let deferred=null,rendered=false;const result=document.getElementById('res');
const check=()=>{if(result&&/Télécharger le MP4/.test(result.textContent||'')){rendered=true;if(deferred&&install)install.hidden=false}};
if(result&&window.MutationObserver)new MutationObserver(check).observe(result,{childList:true,subtree:true,characterData:true});check();
addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferred=e;if(rendered&&install)install.hidden=false});
const ib=document.getElementById('rdxInstallButton');if(ib)ib.addEventListener('click',async()=>{if(!deferred)return;install.hidden=true;deferred.prompt();try{await deferred.userChoice}catch(e){}deferred=null});
addEventListener('appinstalled',()=>{if(install)install.hidden=true;deferred=null});
if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js',{scope:'/'}).then(reg=>{
const show=()=>{if(reg.waiting&&navigator.serviceWorker.controller&&update)update.hidden=false};show();
reg.addEventListener('updatefound',()=>{const w=reg.installing;if(w)w.addEventListener('statechange',()=>{if(w.state==='installed')show()})});
const b=document.getElementById('rdxApplyUpdate');if(b)b.addEventListener('click',()=>{if(reg.waiting)reg.waiting.postMessage({type:'SKIP_WAITING'})});
navigator.serviceWorker.addEventListener('controllerchange',()=>location.reload())
}).catch(e=>console.warn('Service worker:',e));
const nav=document.querySelector('.rdx-mobile-steps');if(nav){const links=[...nav.querySelectorAll('a')],mark=id=>links.forEach(a=>{if(a.hash==='#'+id)a.setAttribute('aria-current','step');else a.removeAttribute('aria-current')});
links.forEach(a=>a.addEventListener('click',e=>{const t=document.querySelector(a.hash);if(t){e.preventDefault();t.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});mark(t.id)}}));
if('IntersectionObserver'in window){const ids=['fileCard','settingsCard','progCard','res'],obs=new IntersectionObserver(entries=>{const v=entries.filter(x=>x.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];if(v)mark(v.target.id)},{rootMargin:'-15% 0px -68% 0px',threshold:[0,.2,.5]});ids.forEach(id=>{const el=document.getElementById(id);if(el)obs.observe(el)})}}
})();