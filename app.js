import { DEMO_TEX } from './demo.js';

const AT = window.alphaTab;
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------
const state = {
  mode: 'synth',           // 'synth' | 'youtube'
  score: null,
  scoreKey: null,
  fileName: '',
  tracks: [],              // { track, kind, visible, mute, solo, volume }
  onlyStrings: load('gt:onlyStrings', false),
  yt: null,
  ytReady: false,
  videoId: null,
  lastVideoMs: -1,
  sync: [],                // [{ bar, occ, ms }]
  history: [],
  recording: false,
  recIndex: 0,
  playing: false,
  endTime: 0,
};

// ---------------------------------------------------------------------------
// alphaTab
// ---------------------------------------------------------------------------
const viewport = $('#viewport');
const abs = (p) => new URL(p, location.href).href;

const api = new AT.AlphaTabApi($('#tab'), {
  core: { fontDirectory: abs('vendor/alphatab/font/'), useWorkers: true },
  display: {
    layoutMode: AT.LayoutMode.Page,
    staveProfile: AT.StaveProfile.Tab,
    scale: 1,
    resources: { mainGlyphColor: '#111', staffLineColor: '#a9adb6', barSeparatorColor: '#6b7180' },
  },
  player: {
    enablePlayer: true,
    playerMode: AT.PlayerMode.EnabledSynthesizer,
    soundFont: abs('vendor/alphatab/soundfont/sonivox.sf2'),
    scrollElement: viewport,
    enableCursor: true,
    enableAnimatedBeatCursor: true,
    enableUserInteraction: true,
    scrollOffsetY: -40,
  },
});
window.gtApi = api; // úteis para depuração no console
window.gtState = state;

api.renderStarted.on(() => { $('#loading').hidden = false; });
api.renderFinished.on(() => { $('#loading').hidden = true; });
api.error.on((e) => { console.error(e); toast('Erro: ' + (e?.message || e)); $('#loading').hidden = true; });

api.scoreLoaded.on((score) => onScoreLoaded(score));
api.playerReady.on(() => {
  $('#btn-play').disabled = false;
  $('#btn-stop').disabled = false;
  attachYouTubeHandler();
});
api.soundFontLoad.on((e) => {
  if (state.mode === 'synth' && e.total) $('#time').textContent = `Sons ${Math.round((e.loaded / e.total) * 100)}%`;
});
api.playerStateChanged.on((e) => {
  state.playing = e.state === AT.synth.PlayerState.Playing;
  $('#btn-play').textContent = state.playing ? '❚❚' : '▶';
});
api.playerPositionChanged.on((e) => {
  state.endTime = e.endTime;
  if (state.mode === 'synth') setTime(e.currentTime, e.endTime);
});
// Obs.: não usar api.midiLoaded.on(...) — no alphaTab 1.8.x isso entra em recursão infinita
// (getter loadedMidiInfo do player em worker). O renderFinished abaixo cobre a atualização.
api.renderFinished.on(() => updateSyncUI());

// ---------------------------------------------------------------------------
// Carregar arquivos
// ---------------------------------------------------------------------------
async function openBytes(bytes, name) {
  try {
    const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const score = AT.importer.ScoreLoader.loadScoreFromBytes(data, api.settings);
    state.fileName = name;
    api.renderScore(score, [defaultTrackIndex(score)]);
    saveRecent(name, data).catch(() => {});
  } catch (err) {
    console.error(err);
    toast('Não consegui ler esse arquivo. Formatos aceitos: Guitar Pro 3–8, MusicXML, Capella.');
  }
}

function openDemo() {
  state.fileName = 'demo';
  api.tex(DEMO_TEX, [0]);
}

function defaultTrackIndex(score) {
  const i = score.tracks.findIndex((t) => trackKind(t) === 'guitar');
  return i >= 0 ? i : 0;
}

$('#file-input').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (f) openBytes(await f.arrayBuffer(), f.name);
  e.target.value = '';
});
$('#btn-demo').addEventListener('click', openDemo);

// arrastar e soltar
let dragDepth = 0;
window.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; document.body.classList.add('dragging'); });
window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('dragging'); } });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', async (e) => {
  e.preventDefault();
  dragDepth = 0;
  document.body.classList.remove('dragging');
  const f = e.dataTransfer?.files?.[0];
  if (!f) return;
  if (f.name.toLowerCase().endsWith('.json')) importSync(f);
  else openBytes(await f.arrayBuffer(), f.name);
});

// ---------------------------------------------------------------------------
// Busca: só monta links para as páginas de busca dos sites (abrem em outra aba).
// Não baixa nada desses sites — o conteúdo deles é licenciado.
// ---------------------------------------------------------------------------
const SEARCH_SITES = {
  's-songsterr': (q) => `https://www.songsterr.com/?pattern=${encodeURIComponent(q)}`,
  's-ug': (q) => `https://www.ultimate-guitar.com/search.php?search_type=title&value=${encodeURIComponent(q)}`,
  's-yt': (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q + ' guitar')}`,
};
function updateSearchLinks() {
  const q = $('#search-q').value.trim();
  for (const [id, url] of Object.entries(SEARCH_SITES)) {
    const a = document.getElementById(id);
    if (q) { a.href = url(q); a.removeAttribute('aria-disabled'); }
    else { a.removeAttribute('href'); a.setAttribute('aria-disabled', 'true'); }
  }
}
$('#search-q').addEventListener('input', updateSearchLinks);
$('#search-form').addEventListener('submit', (e) => {
  e.preventDefault();
  if ($('#search-q').value.trim()) $('#s-songsterr').click();
});
updateSearchLinks();

// ---------------------------------------------------------------------------
// Música carregada
// ---------------------------------------------------------------------------
function onScoreLoaded(score) {
  state.score = score;
  state.scoreKey = hash([score.title, score.artist, score.masterBars.length, score.tracks.map((t) => t.name).join('|')].join('#'));
  $('#drop-hint').hidden = true;
  $('#song-title').textContent = score.title || state.fileName || 'Sem título';
  $('#song-artist').textContent = score.artist || '';
  document.title = (score.title ? score.title + ' – ' : '') + 'GuitarTab';
  if (score.title && state.fileName !== 'demo') {
    $('#search-q').value = [score.artist, score.title].filter(Boolean).join(' ');
    updateSearchLinks();
  }

  const shown = new Set((api.tracks || []).map((t) => t.index));
  state.tracks = score.tracks.map((t) => ({
    track: t,
    kind: trackKind(t),
    visible: shown.has(t.index),
    mute: !!t.playbackInfo.isMute,
    solo: !!t.playbackInfo.isSolo,
    volume: 1,
  }));
  renderTrackList();

  // sincronia salva / último vídeo usado com esta música
  const lastVideo = load(`gt:video:${state.scoreKey}`, null);
  if (lastVideo) loadVideo(lastVideo, { silent: true });
  else { state.sync = []; applySync(); }
  updateSyncUI();
}

/** Classifica o canal para ícone e filtro. */
function trackKind(t) {
  const staff = t.staves[0];
  if (!staff) return 'other';
  if (staff.isPercussion) return 'drums';
  const p = t.playbackInfo.program;
  if (p >= 32 && p <= 39) return 'bass';
  if (p >= 24 && p <= 31) return 'guitar';
  // instrumentos de corda sem programa GM de guitarra (ex.: arquivo com programa genérico)
  if (staff.tuning.length >= 4 && staff.showTablature && p === 0 && t.staves.length === 1) {
    return Math.min(...staff.tuning) < 36 ? 'bass' : 'guitar';
  }
  return 'other';
}

const KIND_ICON = { guitar: 'G', bass: 'B', drums: 'D', other: '♪' };
const KIND_LABEL = { guitar: 'Guitarra', bass: 'Baixo', drums: 'Bateria', other: 'Outro' };

function renderTrackList() {
  const ul = $('#tracks');
  ul.textContent = '';
  const rows = state.tracks.filter((r) => !state.onlyStrings || r.kind === 'guitar' || r.kind === 'bass');
  if (!rows.length) {
    ul.innerHTML = '<li class="empty">Nenhum canal de guitarra ou baixo neste arquivo.</li>';
    return;
  }
  for (const r of rows) {
    const t = r.track;
    const li = document.createElement('li');
    li.className = 'track' + (r.visible ? ' visible' : '');
    const staff = t.staves[0];
    const tuning = staff?.tuning?.length ? tuningName(staff.tuning) : '';
    li.innerHTML = `
      <button class="t-name" title="Ver só este canal">
        <span class="ic ${r.kind}">${KIND_ICON[r.kind]}</span>
        <span class="lbl"><b></b><small></small></span>
      </button>
      <button class="t-btn eye ${r.visible ? 'on' : ''}" title="Mostrar junto com os outros">👁</button>
      <button class="t-btn mute ${r.mute ? 'on' : ''}" title="Mudo">M</button>
      <button class="t-btn solo ${r.solo ? 'on' : ''}" title="Solo">S</button>
      <input class="vol" type="range" min="0" max="2" step="0.05" value="${r.volume}" title="Volume">`;
    li.querySelector('b').textContent = t.name || KIND_LABEL[r.kind];
    li.querySelector('small').textContent = [KIND_LABEL[r.kind], tuning].filter(Boolean).join(' · ');
    li.querySelector('.t-name').onclick = () => showTracks([r]);
    li.querySelector('.eye').onclick = () => {
      const vis = state.tracks.filter((x) => x.visible && x !== r);
      showTracks(r.visible ? vis : [...vis, r]);
    };
    li.querySelector('.mute').onclick = () => {
      r.mute = !r.mute;
      api.changeTrackMute([t], r.mute);
      renderTrackList();
    };
    li.querySelector('.solo').onclick = () => {
      r.solo = !r.solo;
      api.changeTrackSolo([t], r.solo);
      renderTrackList();
    };
    li.querySelector('.vol').oninput = (e) => {
      r.volume = Number(e.target.value);
      api.changeTrackVolume([t], r.volume);
    };
    ul.appendChild(li);
  }
}

function showTracks(rows) {
  if (!rows.length) return; // precisa ao menos um canal visível
  const set = new Set(rows);
  state.tracks.forEach((r) => (r.visible = set.has(r)));
  api.renderTracks(state.tracks.filter((r) => r.visible).map((r) => r.track));
  renderTrackList();
  document.body.classList.remove('sidebar-open');
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function tuningName(tuning) {
  // alphaTab guarda da corda mais aguda para a mais grave
  return [...tuning].reverse().map((m) => NOTE_NAMES[m % 12]).join('');
}

$('#only-strings').checked = state.onlyStrings;
$('#only-strings').addEventListener('change', (e) => {
  state.onlyStrings = e.target.checked;
  save('gt:onlyStrings', state.onlyStrings);
  if (state.onlyStrings) {
    // esconde e silencia o que não é guitarra/baixo
    const others = state.tracks.filter((r) => r.kind !== 'guitar' && r.kind !== 'bass');
    others.forEach((r) => (r.mute = true));
    if (others.length) api.changeTrackMute(others.map((r) => r.track), true);
    const vis = state.tracks.filter((r) => r.visible && !others.includes(r));
    const strings = state.tracks.filter((r) => !others.includes(r));
    if (others.some((r) => r.visible) && strings.length) showTracks(vis.length ? vis : [strings[0]]);
  } else {
    const others = state.tracks.filter((r) => r.kind !== 'guitar' && r.kind !== 'bass');
    others.forEach((r) => (r.mute = false));
    if (others.length) api.changeTrackMute(others.map((r) => r.track), false);
  }
  renderTrackList();
});

// ---------------------------------------------------------------------------
// Controles do player
// ---------------------------------------------------------------------------
$('#btn-play').addEventListener('click', () => api.playPause());
$('#btn-stop').addEventListener('click', () => { api.stop(); });
$('#speed').addEventListener('change', (e) => { api.playbackSpeed = Number(e.target.value); });
$('#btn-loop').addEventListener('click', (e) => {
  api.isLooping = !api.isLooping;
  e.currentTarget.classList.toggle('on', api.isLooping);
});
$('#btn-metro').addEventListener('click', (e) => {
  api.metronomeVolume = api.metronomeVolume > 0 ? 0 : 1;
  e.currentTarget.classList.toggle('on', api.metronomeVolume > 0);
});
$('#btn-countin').addEventListener('click', (e) => {
  api.countInVolume = api.countInVolume > 0 ? 0 : 1;
  e.currentTarget.classList.toggle('on', api.countInVolume > 0);
});

const PROFILES = { tab: AT.StaveProfile.Tab, default: AT.StaveProfile.Default, score: AT.StaveProfile.Score };
$('#notation').addEventListener('change', (e) => {
  api.settings.display.staveProfile = PROFILES[e.target.value];
  api.updateSettings();
  api.render();
});
$('#layout').addEventListener('change', (e) => {
  api.settings.display.layoutMode = e.target.value === 'horizontal' ? AT.LayoutMode.Horizontal : AT.LayoutMode.Page;
  api.updateSettings();
  api.render();
});
$('#zoom').addEventListener('change', (e) => {
  api.settings.display.scale = Number(e.target.value);
  api.updateSettings();
  api.render();
});

$$('#source button').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));

function setMode(mode) {
  if (mode === state.mode) return;
  if (mode === 'youtube' && !state.ytReady) return toast('Carregue um vídeo do YouTube primeiro.');
  api.pause();
  if (state.mode === 'youtube') state.yt?.pauseVideo?.();
  state.mode = mode;
  api.settings.player.playerMode = mode === 'youtube' ? AT.PlayerMode.EnabledExternalMedia : AT.PlayerMode.EnabledSynthesizer;
  api.updateSettings();
  attachYouTubeHandler();
  applySync();
  document.body.classList.toggle('mode-youtube', mode === 'youtube');
  $$('#source button').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
  updateSyncUI();
}

document.addEventListener('keydown', (e) => {
  if (e.target?.closest?.('input, select, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.code === 'Space') { e.preventDefault(); if (!$('#btn-play').disabled) api.playPause(); }
  else if (e.code === 'KeyS' && state.recording) { e.preventDefault(); tap(); }
  else if (e.code === 'Escape' && state.recording) stopRecording();
});

$('#btn-tracks').addEventListener('click', () => document.body.classList.toggle('sidebar-open'));

// ---------------------------------------------------------------------------
// YouTube
// ---------------------------------------------------------------------------
let ytApiPromise = null;
function loadYouTubeApi() {
  ytApiPromise ??= new Promise((resolve, reject) => {
    window.onYouTubeIframeAPIReady = () => resolve(window.YT);
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => { ytApiPromise = null; reject(new Error('Não foi possível carregar o YouTube.')); };
    document.head.appendChild(s);
  });
  return ytApiPromise;
}

function parseVideoId(input) {
  const s = (input || '').trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    if (u.hostname.endsWith('youtu.be')) return u.pathname.slice(1, 12);
    const v = u.searchParams.get('v');
    if (v) return v.slice(0, 11);
    const m = u.pathname.match(/\/(?:embed|shorts|live|v)\/([\w-]{11})/);
    if (m) return m[1];
  } catch { /* não é URL */ }
  return null;
}

$('#video-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const id = parseVideoId($('#video-url').value);
  if (!id) return toast('Link do YouTube inválido.');
  loadVideo(id);
});

async function loadVideo(id, { silent = false } = {}) {
  let YT;
  try { YT = await loadYouTubeApi(); } catch (err) { return toast(err.message); }
  state.videoId = id;
  $('#video-url').value = `https://youtu.be/${id}`;
  $('#yt-wrap').hidden = false;
  if (state.scoreKey) save(`gt:video:${state.scoreKey}`, id);
  loadSyncFor(id);

  if (state.yt) {
    state.yt.cueVideoById(id);
    afterVideoReady(silent);
  } else {
    state.yt = new YT.Player('yt-player', {
      videoId: id,
      playerVars: { playsinline: 1, rel: 0, modestbranding: 1 },
      events: {
        onReady: () => { state.ytReady = true; afterVideoReady(silent); },
        onStateChange: onYouTubeState,
        onError: (e) => toast(`O YouTube recusou este vídeo (erro ${e.data}). Alguns vídeos não permitem incorporação.`),
      },
    });
  }
}

function afterVideoReady(silent) {
  $('#source button[data-mode=youtube]').disabled = false;
  if (!silent || state.sync.length) setMode('youtube');
  updateSyncUI();
}

function onYouTubeState(e) {
  if (state.mode !== 'youtube') return;
  const S = window.YT.PlayerState;
  if (e.data === S.PLAYING && !state.playing) api.play();
  else if ((e.data === S.PAUSED || e.data === S.ENDED) && state.playing) api.pause();
}

/** Ponte entre o alphaTab (modo mídia externa) e o player do YouTube. */
const ytHandler = {
  get backingTrackDuration() { return (state.yt?.getDuration?.() || 0) * 1000; },
  get playbackRate() { return state.yt?.getPlaybackRate?.() ?? 1; },
  set playbackRate(v) { state.yt?.setPlaybackRate?.(v); },
  get masterVolume() { return (state.yt?.getVolume?.() ?? 100) / 100; },
  set masterVolume(v) { state.yt?.setVolume?.(Math.round(v * 100)); },
  seekTo(ms) { state.yt?.seekTo?.(Math.max(0, ms) / 1000, true); },
  play() { state.yt?.playVideo?.(); },
  pause() { state.yt?.pauseVideo?.(); },
};

function externalOutput() {
  const p = api.player;
  const out = p?.output ?? p?.instance?.output;
  return out && 'handler' in out ? out : null;
}

function attachYouTubeHandler() {
  if (state.mode !== 'youtube') return;
  const out = externalOutput();
  if (out && out.handler !== ytHandler) out.handler = ytHandler;
}

// Envia o tempo do vídeo para o alphaTab (o cursor anda junto com o vídeo).
let lastFrame = 0;
function videoLoop(now) {
  lastFrame = now;
  requestAnimationFrame(videoLoop);
  pushVideoTime();
}
requestAnimationFrame(videoLoop);
// reserva: o requestAnimationFrame para quando a aba/janela não está sendo exibida
setInterval(() => { if (performance.now() - lastFrame > 200) pushVideoTime(); }, 100);

function pushVideoTime() {
  if (state.mode !== 'youtube' || !state.ytReady || !state.yt.getCurrentTime) return;
  const ms = state.yt.getCurrentTime() * 1000;
  if (Math.abs(ms - state.lastVideoMs) < 1) return;
  state.lastVideoMs = ms;
  externalOutput()?.updatePosition(ms);
  setTime(ms, (state.yt.getDuration() || 0) * 1000);
}

// ---------------------------------------------------------------------------
// Sincronia (pontos: compasso + repetição -> milissegundo do vídeo)
// ---------------------------------------------------------------------------

/** Ordem real de execução dos compassos, já expandindo repetições. */
function playbackOrder() {
  const lookups = api.tickCache?.masterBars;
  if (!lookups) return [];
  const count = new Map();
  return lookups.map((l) => {
    const bar = l.masterBar.index;
    const occ = count.get(bar) ?? 0;
    count.set(bar, occ + 1);
    return { bar, occ };
  });
}

function orderIndexMap() {
  const m = new Map();
  playbackOrder().forEach((o, i) => m.set(`${o.bar}:${o.occ}`, i));
  return m;
}

function sortedSync() {
  const idx = orderIndexMap();
  return state.sync
    .map((p) => ({ ...p, i: idx.get(`${p.bar}:${p.occ}`) ?? Infinity }))
    .sort((a, b) => a.i - b.i);
}

function applySync() {
  const score = api.score;
  if (!score) return;
  for (const mb of score.masterBars) mb.syncPoints = undefined;
  for (const p of state.sync) {
    const mb = score.masterBars[p.bar];
    if (!mb) continue;
    const a = new AT.model.Automation();
    a.type = AT.model.AutomationType.SyncPoint;
    a.ratioPosition = 0;
    const d = new AT.model.SyncPointData();
    d.barOccurence = p.occ;
    d.millisecondOffset = p.ms;
    a.syncPointValue = d;
    (mb.syncPoints ??= []).push(a);
  }
  for (const mb of score.masterBars) mb.syncPoints?.sort((x, y) => x.syncPointValue.barOccurence - y.syncPointValue.barOccurence);
  if (api.player) api.updateSyncPoints();
}

function commitSync(next) {
  state.history.push(state.sync);
  if (state.history.length > 100) state.history.shift();
  state.sync = next;
  applySync();
  persistSync();
  updateSyncUI();
}

function videoNowMs() {
  return (state.yt?.getCurrentTime?.() || 0) * 1000;
}

// "Compasso 1 começa aqui": cria o primeiro ponto ou desloca toda a sincronia.
$('#btn-sync-start').addEventListener('click', () => {
  if (!state.ytReady || !api.score) return;
  const now = videoNowMs();
  const pts = sortedSync();
  if (!pts.length) return commitSync([{ bar: 0, occ: 0, ms: now }]);
  const first = pts[0];
  const delta = now - first.ms;
  commitSync(state.sync.map((p) => ({ ...p, ms: Math.max(0, p.ms + delta) })));
  toast('Sincronia movida.');
});

$('#btn-rec').addEventListener('click', () => (state.recording ? stopRecording() : startRecording()));
$('#btn-tap').addEventListener('click', () => tap());

function startRecording() {
  if (!state.ytReady || !api.score) return;
  if (state.mode !== 'youtube') setMode('youtube');
  const now = videoNowMs();
  // continua a partir do último ponto anterior ao instante atual do vídeo
  const pts = sortedSync();
  let k = 0;
  while (k < pts.length && pts[k].i === k && pts[k].ms < now - 30) k++;
  state.recIndex = k;
  state.recording = true;
  updateSyncUI();
  toast('Gravando: toque S (ou "Marcar") no início de cada compasso. Esc para parar.');
  if (!state.playing) api.play();
}

function stopRecording() {
  state.recording = false;
  updateSyncUI();
}

function tap() {
  const order = playbackOrder();
  const target = order[state.recIndex];
  if (!target) { stopRecording(); return toast('Chegou ao fim da música.'); }
  const now = videoNowMs();
  const S = window.YT?.PlayerState;
  if (S && state.yt.getPlayerState() !== S.PLAYING) return toast('Dê play no vídeo e marque no início de cada compasso.');
  const idx = orderIndexMap();
  const k = state.recIndex;
  const prev = state.sync.find((p) => idx.get(`${p.bar}:${p.occ}`) === k - 1);
  if (prev && now - prev.ms < 80) return; // toque duplo acidental
  const next = state.sync.filter((p) => {
    const i = idx.get(`${p.bar}:${p.occ}`);
    if (i === undefined || i === k) return false;
    if (i > k && p.ms <= now) return false; // pontos posteriores que ficaram inválidos
    if (i < k && p.ms >= now) return false;
    return true;
  });
  next.push({ bar: target.bar, occ: target.occ, ms: now });
  state.recIndex++;
  commitSync(next);
}

$$('[data-nudge]').forEach((b) =>
  b.addEventListener('click', () => {
    if (!state.sync.length) return toast('Ainda não há sincronia para ajustar.');
    const d = Number(b.dataset.nudge);
    commitSync(state.sync.map((p) => ({ ...p, ms: Math.max(0, p.ms + d) })));
  }),
);

$('#btn-undo').addEventListener('click', () => {
  if (!state.history.length) return;
  state.sync = state.history.pop();
  if (state.recording) state.recIndex = Math.max(0, state.recIndex - 1);
  applySync();
  persistSync();
  updateSyncUI();
});

$('#btn-clear').addEventListener('click', () => {
  if (!state.sync.length) return;
  if (!confirm('Apagar toda a sincronia deste vídeo?')) return;
  commitSync([]);
});

$('#btn-export').addEventListener('click', () => {
  const data = {
    app: 'GuitarTab', version: 1,
    title: api.score?.title || '', artist: api.score?.artist || '',
    bars: api.score?.masterBars.length || 0,
    videoId: state.videoId,
    points: sortedSync().map(({ bar, occ, ms }) => ({ bar, occ, ms: Math.round(ms) })),
  };
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${(data.title || 'sincronia').replace(/[^\w\- ]+/g, '')}-${state.videoId}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

$('#sync-import').addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (f) importSync(f);
  e.target.value = '';
});

async function importSync(file) {
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.points)) throw new Error();
    if (!api.score) return toast('Abra a música antes de importar a sincronia.');
    const points = data.points.filter((p) => Number.isFinite(p.bar) && Number.isFinite(p.occ) && Number.isFinite(p.ms));
    if (data.videoId && data.videoId !== state.videoId) {
      save(`gt:sync:${state.scoreKey}:${data.videoId}`, points);
      await loadVideo(data.videoId);
    } else {
      commitSync(points);
    }
    toast(`Sincronia importada (${points.length} pontos).`);
  } catch {
    toast('Arquivo de sincronia inválido.');
  }
}

function syncStorageKey(videoId = state.videoId) {
  return `gt:sync:${state.scoreKey}:${videoId}`;
}
function loadSyncFor(videoId) {
  state.history = [];
  state.sync = state.scoreKey ? load(syncStorageKey(videoId), []) : [];
  applySync();
  updateSyncUI();
}
function persistSync() {
  if (state.scoreKey && state.videoId) save(syncStorageKey(), state.sync);
}

function updateSyncUI() {
  const ready = !!(state.ytReady && api.score);
  $('#sync-box').hidden = !ready;
  if (!ready) return;
  const n = state.sync.length;
  $('#sync-count').textContent = n === 0 ? 'Sem sincronia (vídeo e tab começam juntos)' : `${n} ponto${n > 1 ? 's' : ''} de sincronia`;
  $('#btn-rec').classList.toggle('on', state.recording);
  $('#btn-rec').textContent = state.recording ? '■ Parar' : '● Gravar';
  $('#btn-tap').hidden = !state.recording;
  const target = state.recording ? playbackOrder()[state.recIndex] : null;
  $('#sync-next').textContent = target ? `Próximo: compasso ${target.bar + 1}${target.occ ? ` (${target.occ + 1}ª vez)` : ''}` : '';
  $('#btn-undo').disabled = !state.history.length;
}

// ---------------------------------------------------------------------------
// Arquivos recentes (IndexedDB, fica só neste navegador)
// ---------------------------------------------------------------------------
function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('guitartab', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('files', { keyPath: 'name' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbTx(mode, fn) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('files', mode);
    const out = fn(tx.objectStore('files'));
    tx.oncomplete = () => resolve(out?.result ?? out);
    tx.onerror = () => reject(tx.error);
  });
}
async function saveRecent(name, data) {
  await idbTx('readwrite', (s) => s.put({ name, data, time: Date.now() }));
  const all = await idbTx('readonly', (s) => s.getAll());
  all.sort((a, b) => b.time - a.time).slice(12).forEach((r) => idbTx('readwrite', (s) => s.delete(r.name)));
}

$('#btn-recent').addEventListener('click', async () => {
  const ul = $('#recent-list');
  ul.textContent = '';
  let all = [];
  try { all = (await idbTx('readonly', (s) => s.getAll())).sort((a, b) => b.time - a.time); } catch { /* indisponível */ }
  if (!all.length) ul.innerHTML = '<li class="empty">Nenhum arquivo aberto ainda.</li>';
  for (const r of all) {
    const li = document.createElement('li');
    const open = document.createElement('button');
    open.className = 'btn';
    open.type = 'button';
    open.textContent = r.name;
    open.onclick = () => { $('#recent-dialog').close(); openBytes(r.data, r.name); };
    const del = document.createElement('button');
    del.className = 'btn icon';
    del.type = 'button';
    del.title = 'Remover da lista';
    del.textContent = '✕';
    del.onclick = async () => { await idbTx('readwrite', (s) => s.delete(r.name)); li.remove(); };
    li.append(open, del);
    ul.appendChild(li);
  }
  $('#recent-dialog').showModal();
});

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
function setTime(cur, end) {
  $('#time').textContent = `${fmt(cur)} / ${fmt(end)}`;
}
function fmt(ms) {
  const s = Math.max(0, Math.floor((ms || 0) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}
function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* armazenamento indisponível */ }
}
let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 3500);
}
