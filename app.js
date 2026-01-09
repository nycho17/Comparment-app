// Minimal offline-first PWA for read-only CPT lookup
const state = {
  list: [],
  detail: [],
  segments: [],
  filtered: [],
  byCpt: new Map(),
  segByCpt: new Map(),
  deferredPrompt: null,
};

const el = (id) => document.getElementById(id);

function uniq(arr){ return [...new Set(arr.filter(v => v!==null && v!==undefined && String(v).trim()!==''))].sort(); }

function fmt(v){
  if (v === null || v === undefined || v === '') return '-';
  if (typeof v === 'number') return (Math.round(v*100)/100).toLocaleString();
  return String(v);
}

function buildOptions(){
  const regions = uniq(state.list.map(r => r['지역']));
  const years = uniq(state.list.map(r => r['식재년도']));
  const species = uniq(state.list.map(r => r['Species Amended_1']));
  for (const r of regions){ el('region').insertAdjacentHTML('beforeend', `<option value="${r}">${r}</option>`); }
  for (const y of years){ el('year').insertAdjacentHTML('beforeend', `<option value="${y}">${y}</option>`); }
  for (const s of species){ el('species').insertAdjacentHTML('beforeend', `<option value="${s}">${s}</option>`); }
}

function applyFilters(){
  const q = el('q').value.trim().toUpperCase();
  const region = el('region').value;
  const year = el('year').value;
  const species = el('species').value;

  state.filtered = state.list.filter(r => {
    const cpt = (r['CPT']||'').toUpperCase();
    if (q && !cpt.includes(q)) return false;
    if (region && (r['지역']||'') !== region) return false;
    if (year && String(r['식재년도']||'') !== String(year)) return false;
    if (species && (r['Species Amended_1']||'') !== species) return false;
    return true;
  });

  el('pillCount').textContent = `결과: ${state.filtered.length.toLocaleString()}건`;
  renderList();
}

function renderList(){
  const listEl = el('list');
  listEl.innerHTML = '';
  const max = 150; // keep UI snappy
  const slice = state.filtered.slice(0, max);

  for (const r of slice){
    const cpt = r['CPT'];
    const meta = [
      r['지역'] ? `지역 ${r['지역']}` : null,
      r['식재년도'] ? `식재 ${r['식재년도']}` : null,
      r['Species Amended_1'] ? `수종 ${r['Species Amended_1']}` : null,
      (r['HA'] ?? null) !== null ? `면적 ${fmt(r['HA'])} ha` : null,
      (r['조림자산 계'] ?? null) !== null ? `자산 ${fmt(r['조림자산 계'])}` : null,
    ].filter(Boolean).join(' · ');

    const div = document.createElement('div');
    div.className = 'card item';
    div.innerHTML = `<h3>${cpt}</h3><div class="meta muted">${meta || ''}</div>`;
    div.addEventListener('click', () => openDetail(cpt));
    listEl.appendChild(div);
  }

  if (state.filtered.length > max){
    listEl.insertAdjacentHTML('beforeend', `<div class="muted" style="padding:6px 2px">※ 표시 제한: ${max}건만 보여줍니다. 검색어/필터를 더 좁혀 주세요.</div>`);
  }
}

function kvGrid(obj){
  const keys = [
    ['지역','지역'],
    ['식재년도','식재년도'],
    ['식재일','식재일'],
    ['Species Amended_1','수종'],
    ['Spacing Amended','간격(Spacing)'],
    ['HA','면적(HA)'],
    ['조림자산 계','조림자산(계)'],
    ['23 자산전환','23 자산전환'],
    ['24년 자산전환','24년 자산전환'],
    ['segment_count','세그먼트 수'],
  ];
  const grid = el('summaryGrid');
  grid.innerHTML = '';
  for (const [k,label] of keys){
    if (!(k in obj)) continue;
    grid.insertAdjacentHTML('beforeend', `
      <div class="kv">
        <div class="k">${label}</div>
        <div class="v">${fmt(obj[k])}</div>
      </div>
    `);
  }
}

function renderSegments(cpt){
  const segs = state.segByCpt.get(cpt) || [];
  const head = el('segHead');
  const body = el('segBody');
  head.innerHTML = '';
  body.innerHTML = '';

  if (!segs.length){
    head.innerHTML = '<th>정보</th>';
    body.innerHTML = '<tr><td class="muted">세그먼트 데이터가 없습니다.</td></tr>';
    return;
  }

  const cols = Object.keys(segs[0]).filter(k => k !== 'CPT');
  for (const c of cols){
    head.insertAdjacentHTML('beforeend', `<th>${c}</th>`);
  }
  for (const s of segs){
    const tds = cols.map(c => `<td>${fmt(s[c])}</td>`).join('');
    body.insertAdjacentHTML('beforeend', `<tr>${tds}</tr>`);
  }
}

function openDetail(cpt){
  const d = state.byCpt.get(cpt);
  if (!d) return;
  el('cptPill').textContent = `CPT: ${cpt}`;
  kvGrid(d);
  renderSegments(cpt);

  el('listView').classList.add('hidden');
  el('detailView').classList.remove('hidden');
  window.scrollTo({top:0, behavior:'smooth'});
}

function backToList(){
  el('detailView').classList.add('hidden');
  el('listView').classList.remove('hidden');
}

async function loadData(){
  const [list, detail, segments] = await Promise.all([
    fetch('data/comp_list.json').then(r=>r.json()),
    fetch('data/comp_detail.json').then(r=>r.json()),
    fetch('data/segments.json').then(r=>r.json()),
  ]);

  state.list = list;
  state.detail = detail;
  state.segments = segments;

  // build maps
  state.byCpt = new Map(detail.map(d => [d.CPT, d]));
  state.segByCpt = new Map();
  for (const s of segments){
    const cpt = s.CPT;
    if (!state.segByCpt.has(cpt)) state.segByCpt.set(cpt, []);
    state.segByCpt.get(cpt).push(s);
  }

  buildOptions();
  state.filtered = state.list;
  el('stats').textContent = `Compartment ${state.list.length.toLocaleString()}개 · 세그먼트(원본행) ${state.segments.length.toLocaleString()}개 로드 완료`;
  applyFilters();
}

function setupInstall(){
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.deferredPrompt = e;
    el('installBtn').classList.remove('hidden');
  });

  el('installBtn').addEventListener('click', async () => {
    if (!state.deferredPrompt) return;
    state.deferredPrompt.prompt();
    await state.deferredPrompt.userChoice;
    state.deferredPrompt = null;
    el('installBtn').classList.add('hidden');
  });
}

function setupEvents(){
  ['q','region','year','species'].forEach(id => el(id).addEventListener('input', applyFilters));
  el('clear').addEventListener('click', () => {
    el('q').value = '';
    el('region').value = '';
    el('year').value = '';
    el('species').value = '';
    applyFilters();
  });
  el('back').addEventListener('click', backToList);
}

async function registerSW(){
  if (!('serviceWorker' in navigator)) return;
  try { await navigator.serviceWorker.register('sw.js'); } catch(e) { /* ignore */ }
}

setupEvents();
setupInstall();
loadData();
registerSW();
