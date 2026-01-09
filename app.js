// Field-simple offline-first PWA (read-only)
const state = {
  list: [],
  detail: [],
  segments: [],
  byCpt: new Map(),
  segByCpt: new Map(),
  filtered: [],
  deferredPrompt: null,
};

const el = (id) => document.getElementById(id);

function fmt(v){
  if (v === null || v === undefined || v === '') return '-';
  if (typeof v === 'number') return (Math.round(v*100)/100).toLocaleString();
  return String(v);
}

function loadRecent(){
  try { return JSON.parse(localStorage.getItem('recent_cpt') || '[]'); }
  catch(e){ return []; }
}
function saveRecent(arr){
  localStorage.setItem('recent_cpt', JSON.stringify(arr.slice(0, 12)));
}
function pushRecent(cpt){
  const arr = loadRecent().filter(x => x !== cpt);
  arr.unshift(cpt);
  saveRecent(arr);
  renderRecent();
}
function renderRecent(){
  const arr = loadRecent();
  const box = el('recentList');
  box.innerHTML = '';
  if (!arr.length){
    box.innerHTML = '<div class="muted" style="font-size:13px">최근 조회가 없습니다.</div>';
    return;
  }
  for (const cpt of arr){
    const d = state.byCpt.get(cpt);
    const meta = d ? [
      d['지역'] ? `지역 ${d['지역']}` : null,
      d['식재년도'] ? `식재 ${d['식재년도']}` : null,
      d['Species Amended_1'] ? `수종 ${d['Species Amended_1']}` : null,
      (d['HA'] ?? null) !== null ? `면적 ${fmt(d['HA'])}ha` : null,
    ].filter(Boolean).join(' · ') : '';
    const div = document.createElement('div');
    div.className = 'card item';
    div.innerHTML = `<h3>${cpt}</h3><div class="meta muted">${meta}</div>`;
    div.addEventListener('click', () => openDetail(cpt));
    box.appendChild(div);
  }
}


function renderQuickSummary(){
  const box = el('quickSummary');
  if (!box) return;
  const q = el('q').value.trim().toUpperCase();
  if (!q){
    box.textContent = '';
    return;
  }
  // Exact CPT match → show totals immediately
  if (state.byCpt.has(q)){
    const d = state.byCpt.get(q);
    const area = fmt(d['HA']);
    const asset = fmt(d['조림자산 계']);
    box.textContent = `면적(HA): ${area}  ·  자산(합계): ${asset}`;
    return;
  }
  // Otherwise show first candidate summary (if any)
  if (state.filtered && state.filtered.length){
    const cpt = state.filtered[0].CPT;
    const d = state.byCpt.get(cpt);
    if (d){
      const area = fmt(d['HA']);
      const asset = fmt(d['조림자산 계']);
      box.textContent = `가장 가까운 CPT: ${cpt}  |  면적(HA): ${area}  ·  자산(합계): ${asset}`;
      return;
    }
  }
  box.textContent = '일치하는 CPT가 없습니다.';
}

function applySearch(){
  const q = el('q').value.trim().toUpperCase();
  if (!q){
    state.filtered = state.list.slice(0, 30);
  } else {
    state.filtered = state.list.filter(r => (r.CPT||'').toUpperCase().includes(q)).slice(0, 30);
  }
  el('pillCount').textContent = `표시: ${state.filtered.length}건`;
  renderList();
  renderQuickSummary();
}

function renderList(){
  const listEl = el('list');
  listEl.innerHTML = '';
  if (!state.filtered.length){
    listEl.innerHTML = '<div class="muted" style="font-size:13px">검색 결과가 없습니다.</div>';
    return;
  }
  for (const r of state.filtered){
    const cpt = r.CPT;
    const meta = [
      r['지역'] ? `지역 ${r['지역']}` : null,
      r['식재년도'] ? `식재 ${r['식재년도']}` : null,
      r['Species Amended_1'] ? `수종 ${r['Species Amended_1']}` : null,
      (r['HA'] ?? null) !== null ? `면적 ${fmt(r['HA'])}ha` : null,
    ].filter(Boolean).join(' · ');
    const div = document.createElement('div');
    div.className = 'card item';
    div.innerHTML = `<h3>${cpt}</h3><div class="meta muted">${meta}</div>`;
    div.addEventListener('click', () => openDetail(cpt));
    listEl.appendChild(div);
  }
}

function kvGrid(obj){
  const keys = [
    ['지역','지역'],
    ['식재년도','식재년도'],
    ['식재일','식재일'],
    ['Species Amended_1','수종'],
    ['Spacing Amended','간격'],
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
  for (const c of cols) head.insertAdjacentHTML('beforeend', `<th>${c}</th>`);
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
  pushRecent(cpt);

  el('listView').classList.add('hidden');
  el('detailView').classList.remove('hidden');
  window.scrollTo({top:0, behavior:'smooth'});
}

function backToList(){
  el('detailView').classList.add('hidden');
  el('listView').classList.remove('hidden');
}

function openExactOrFirst(){
  const q = el('q').value.trim().toUpperCase();
  if (!q) return;
  // exact match first
  if (state.byCpt.has(q)) return openDetail(q);
  // otherwise open first in filtered
  applySearch();
  if (state.filtered.length) openDetail(state.filtered[0].CPT);
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

  state.byCpt = new Map(detail.map(d => [d.CPT, d]));
  state.segByCpt = new Map();
  for (const s of segments){
    const cpt = s.CPT;
    if (!state.segByCpt.has(cpt)) state.segByCpt.set(cpt, []);
    state.segByCpt.get(cpt).push(s);
  }

  el('stats').textContent = `CPT ${state.list.length.toLocaleString()}개 로드 완료 (조회 전용)`;
  renderRecent();
  applySearch();
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
  el('q').addEventListener('input', applySearch);
  el('q').addEventListener('keydown', (e) => { if (e.key === 'Enter') openExactOrFirst(); });
  el('openBtn').addEventListener('click', openExactOrFirst);
  el('clear').addEventListener('click', () => { el('q').value=''; applySearch(); });
  el('back').addEventListener('click', backToList);
}

async function registerSW(){
  if (!('serviceWorker' in navigator)) return;
  try { await navigator.serviceWorker.register('sw.js'); } catch(e) {}
}

setupEvents();
setupInstall();
loadData();
registerSW();
