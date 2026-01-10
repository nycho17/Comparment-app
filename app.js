const APP_VERSION = 'v8.5';
// Field-simple offline-first PWA (read-only)
const state = {
  list: [],
  detail: [],
  segments: [],
  byCpt: new Map(),
  segByCpt: new Map(),
  filtered: [],
  deferredPrompt: null,
  scope: { type: 'all', value: null },
};

const el = (id) => document.getElementById(id);

function fmt(v){
  if (v === null || v === undefined || v === '') return '-';
  if (typeof v === 'number') return (Math.round(v*100)/100).toLocaleString();
  return String(v);
}

function fmt0(v){
  if (v === null || v === undefined || v === '') return '-';
  const n = (typeof v === 'number') ? v : Number(String(v).replace(/,/g,''));
  if (isNaN(n)) return '-';
  return Math.round(n).toLocaleString();
}

function _productionYearLegacy(r){
  // Prefer explicit production-year column if present.
  const candidates = ['생산연도','생산년도','Production Year','ProductionYear','ProdYear'];
  for (const k of candidates){
    if (r && Object.prototype.hasOwnProperty.call(r, k)){
      const v = r[k];
      if (v === null || v === undefined || String(v).trim() === '') continue;
      const n = parseInt(String(v).replace(/[^0-9]/g,''), 10);
      if (!isNaN(n)) return n;
    }
  }
  // Fallback to buckets (older datasets)
  const y26 = toNum(r['26생산']);
  const y25 = toNum(r['25생산']);
  const y24 = toNum(r['~24생산']);
  if (y26 > 0) return 2026;
  if (y25 > 0) return 2025;
  if (y24 > 0) return 2024;
  return null;
}

function isCompleted(r){
  const py = productionYear(r);
  return py !== null && py <= 2025;
}

function activeRows(rows){
  // Operational stats scope: production planned only (production year >= 2026)
  return (rows || []).filter(r => {
    const py = productionYear(r);
    return py !== null && py >= 2026;
  });
}
function toNum(v){
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  const n = Number(String(v).replace(/,/g,''));
  return isNaN(n) ? 0 : n;
}

function computeStats(rows, keyField){
  const m = new Map();
  for (const r of rows){
    const key = (r[keyField] === null || r[keyField] === undefined || String(r[keyField]).trim()==='') ? '미기재' : String(r[keyField]).trim();
    if (!m.has(key)){
      m.set(key, {key, area:0, asset:0, count:0});
    }
    const obj = m.get(key);
    obj.area += toNum(r['HA']);
    obj.asset += toNum(r['조림자산 계']);
    obj.count += 1;
  }
  return [...m.values()];
}

function renderStats(){
  // Use detail (1 row per CPT) for totals
  const rows = activeRows(state.detail || []);
  // Year stats
  const years = computeStats(rows, '식재년도')
    .sort((a,b) => (a.key==='미기재') - (b.key==='미기재') || Number(a.key)-Number(b.key));
  const yBody = el('yearStatsBody');
  if (yBody){
    yBody.innerHTML = '';
    for (const r of years){
      yBody.insertAdjacentHTML('beforeend', `<tr><td>${r.key}</td><td>${fmt(r.area)}</td><td>${fmt0(r.asset)}</td><td>${fmt(r.count)}</td></tr>`);
    }
  }

  
  // Production year stats (computed from ~24/25/26 production buckets) - use ALL rows for trend, but show ACTIVE only by default
  const prodBody = el('prodYearStatsBody');
  if (prodBody){
    // show ALL rows' production year distribution (including completed) to understand production history
    const prodRows = computeStats(rowsAll.map(r => ({...r, '생산연도_derived': productionYear(r) === null ? '미기재/미생산' : String(productionYear(r))})), '생산연도_derived')
      .sort((a,b) => {
        const order = (k) => (k==='미기재/미생산') ? 9999 : Number(k);
        return order(a.key) - order(b.key);
      });
    prodBody.innerHTML = '';
    for (const r of prodRows){
      prodBody.insertAdjacentHTML('beforeend', `<tr><td>${r.key}</td><td>${fmt(r.area)}</td><td>${fmt0(r.asset)}</td><td>${fmt(r.count)}</td></tr>`);
    }
  }

// Species stats (top by area)
  const species = computeStats(rows, 'Species Amended_1')
    .sort((a,b) => b.area - a.area);
  const sBody = el('speciesStatsBody');
  if (sBody){
    sBody.innerHTML = '';
    for (const r of species.slice(0,50)){
      sBody.insertAdjacentHTML('beforeend', `<tr><td>${r.key}</td><td>${fmt(r.area)}</td><td>${fmt0(r.asset)}</td><td>${fmt(r.count)}</td></tr>`);
    }
  }
}

function showStatsView(){
  renderStats();
  el('listView').classList.add('hidden');
  el('detailView').classList.add('hidden');
  el('statsView').classList.remove('hidden');
  window.scrollTo({top:0, behavior:'smooth'});
}

function hideStatsView(){
  el('statsView').classList.add('hidden');
  el('listView').classList.remove('hidden');
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
    const asset = fmt0(d['조림자산 계']);
    box.textContent = `면적(HA): ${area}  ·  자산(합계): ${asset}`;
    return;
  }
  // Otherwise show first candidate summary (if any)
  if (state.filtered && state.filtered.length){
    const cpt = state.filtered[0].CPT;
    const d = state.byCpt.get(cpt);
    if (d){
      const area = fmt(d['HA']);
      const asset = fmt0(d['조림자산 계']);
      box.textContent = `가장 가까운 CPT: ${cpt}  |  면적(HA): ${area}  ·  자산(합계): ${asset}`;
      return;
    }
  }
  box.textContent = '일치하는 CPT가 없습니다.';
}

function applySearch(){
  const baseDetail = applyFilters(state.detail || []);
  const allowed = new Set(baseDetail.map(r=>r['CPT']));

  const q = el('q').value.trim().toUpperCase();

  // base set (optionally scoped)
  let base = (state.list || []).filter(r => allowed.has(r['CPT']));
  if (state.scope && state.scope.type === 'region' && state.scope.value){
    base = base.filter(r => String(r['지역'] || '').trim() === state.scope.value);
  }

  if (!q){
    state.filtered = base.slice(0, 200);
  } else {
    state.filtered = base.filter(r => (r.CPT||'').toUpperCase().includes(q)).slice(0, 200);
  }

  el('pillCount').textContent = `표시: ${state.filtered.length}건`;
  renderList();
  renderQuickSummary();
  renderHomeSummary(); // update scope label
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
        <div class="v">${(k==='조림자산 계')?fmt0(obj[k]):fmt(obj[k])}</div>
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
    const saved = loadSavedFilters();
    state.filters = saved ? {...defaultFilters(), ...saved} : defaultFilters();
    populateYearFilters();
    populateYearFilters();
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

async function refreshDataFromServer(){
  clearSavedFilters();
  state.filters = defaultFilters();

  const note = el('dataRefreshNote');
  const btn = el('dataRefreshBtn');
  try {
    if (btn) btn.disabled = true;
    if (note){
      note.style.display = 'block';
      note.textContent = '데이터 새로고침 중...';
    }
    const ts = Date.now();
    const [detail, list, segments] = await Promise.all([
      fetch(`data/comp_detail.json?ts=${ts}`, {cache:'no-store'}).then(r => r.json()),
      fetch(`data/comp_list.json?ts=${ts}`, {cache:'no-store'}).then(r => r.json()),
      fetch(`data/segments.json?ts=${ts}`, {cache:'no-store'}).then(r => r.json()).catch(()=>[])
    ]);
    state.detail = detail;
    const saved = loadSavedFilters();
    state.filters = saved ? {...defaultFilters(), ...saved} : defaultFilters();
    populateYearFilters();
    populateYearFilters();
    state.list = list;
    state.segments = segments || [];
        populateYearFilters();
        applyFiltersAndRerender();
    // reset scope/filter and rerender
    if (state.scope) state.scope = {type:'all', value:null};
    el('q').value = '';
    renderRecent();
    renderHomeSummary();
    applySearch();
    if (note){
      note.textContent = `완료: CPT ${fmt(state.detail.length)}개 (서버 최신 반영)`;
      setTimeout(()=>{ note.style.display='none'; }, 2500);
    }
  } catch (e) {
    if (note){
      note.style.display = 'block';
      note.textContent = '실패: 네트워크 또는 서버 응답을 확인하세요.';
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

function uniqSorted(nums){
  const set = new Set();
  for (const n of nums){
    if (n === null || n === undefined) continue;
    const x = parseInt(n,10);
    if (!isNaN(x)) set.add(x);
  }
  return Array.from(set).sort((a,b)=>a-b);
}

function applyFilters(rowsAll){
  const f = state.filters || {};
  const prodSel = f.prodYear;   // null means default planned(>=2026)
  const plantSel = f.plantYear; // null means no filter
  let rows = rowsAll || [];

  // Production-year filter
  if (prodSel === null || prodSel === undefined){
    // default operational view: planned only
    rows = rows.filter(r => {
      const py = productionYear(r);
      return py !== null && py >= 2026;
    });
  } else if (prodSel === 'ALL'){
    // include all production years (including blank)
    rows = rows;
  } else if (prodSel === 'BLANK'){
    rows = rows.filter(r => productionYear(r) === null);
  } else {
    const y = parseInt(prodSel,10);
    rows = rows.filter(r => productionYear(r) === y);
  }

  // Planting-year filter (exact match)
  if (plantSel && plantSel !== 'ALL'){
    const y = parseInt(plantSel,10);
    rows = rows.filter(r => {
      const v = r['식재년도'];
      const n = parseInt(String(v||'').replace(/[^0-9]/g,''),10);
      return !isNaN(y) && n === y;
    });
  }

  return rows;
}

function updateFilterHint(){
  const hint = el('filterHint');
  if (!hint) return;
  const f = state.filters || {};
  const prod = f.prodYear;
  const plant = f.plantYear;
  const prodText = (prod===null || prod===undefined) ? '생산연도: 예정지(≥2026)' :
    (prod==='ALL' ? '생산연도: 전체' : (prod==='BLANK' ? '생산연도: 미기재' : `생산연도: ${prod}`));
  const plantText = (!plant || plant==='ALL') ? '식재연도: 전체' : `식재연도: ${plant}`;
  hint.textContent = `${prodText} · ${plantText}`;
}

function populateYearFilters(){
  const rowsAll = state.detail || [];
  state.filters = state.filters || {prodYear: null, plantYear: 'ALL'};

  const prodSel = el('prodYearFilter');
  const plantSel = el('plantYearFilter');
  if (!prodSel || !plantSel) return;

  // Production years from data (derived)
  const prodYears = uniqSorted(rowsAll.map(r => productionYear(r)).filter(x=>x!==null));
  const plantYears = uniqSorted(rowsAll.map(r => r['식재년도']));

  // Build production options
  const currentProd = state.filters.prodYear;
  prodSel.innerHTML = '';
  // Default planned view
  prodSel.insertAdjacentHTML('beforeend', `<option value="" ${currentProd===null || currentProd===undefined ? 'selected':''}>예정지(생산연도 ≥ 2026) [기본]</option>`);
  prodSel.insertAdjacentHTML('beforeend', `<option value="ALL" ${currentProd==='ALL' ? 'selected':''}>전체(완료+예정)</option>`);
  prodSel.insertAdjacentHTML('beforeend', `<option value="BLANK" ${currentProd==='BLANK' ? 'selected':''}>생산연도 미기재</option>`);
  for (const y of prodYears){
    const val = String(y);
    const sel = (String(currentProd)===val) ? 'selected' : '';
    prodSel.insertAdjacentHTML('beforeend', `<option value="${val}" ${sel}>${val}</option>`);
  }

  // Planting options
  const currentPlant = state.filters.plantYear || 'ALL';
  plantSel.innerHTML = '';
  plantSel.insertAdjacentHTML('beforeend', `<option value="ALL" ${currentPlant==='ALL'?'selected':''}>전체</option>`);
  for (const y of plantYears){
    const val = String(y);
    const sel = (String(currentPlant)===val) ? 'selected' : '';
    plantSel.insertAdjacentHTML('beforeend', `<option value="${val}" ${sel}>${val}</option>`);
  }

  updateFilterHint();
}

function applyFiltersAndRerender(){
  // Re-render summary + current list view with filters applied
  renderHomeSummary();
  applySearch();
  updateFilterHint();
}

/* ---- Year Filters (Operational) ---- */
const FILTERS_KEY = 'cpt_filters_simple_v1';

function loadSavedFilters(){
  try{
    const raw = localStorage.getItem(FILTERS_KEY);
    if(!raw) return null;
    return JSON.parse(raw);
  }catch(e){ return null; }
}
function saveFilters(){
  try{ localStorage.setItem(FILTERS_KEY, JSON.stringify(state.filters||{})); }catch(e){}
}
function clearSavedFilters(){
  try{ localStorage.removeItem(FILTERS_KEY); }catch(e){}
}

function defaultFilters(){
  // prod: 'PLANNED' (>=2026) | 'ALL' | 'BLANK' | 'YYYY'
  // plant: 'ALL' | 'YYYY'
  return { prod:'PLANNED', plant:'ALL' };
}

function parseYear(v){
  if(v===null || v===undefined) return null;
  const n = parseInt(String(v).replace(/[^0-9]/g,''), 10);
  return isNaN(n) ? null : n;
}

function productionYear(row){
  // Prefer explicit 생산연도 column if present; else fallback to existing productionYear() if defined elsewhere
  // In this codebase, 생산연도 is already computed in other functions; keep compatible:
  const keys = ['생산연도','ProductionYear','ProdYear','생산년도','생산 년도'];
  for(const k of keys){
    if(row && row[k] !== undefined && row[k] !== null && String(row[k]).trim()!==''){
      const y = parseYear(row[k]);
      if(y) return y;
    }
  }
  // If older helper exists, try it
  try{
    if(typeof window !== 'undefined' && typeof window._productionYearLegacy === 'function'){
      return window._productionYearLegacy(row);
    }
  }catch(e){}
  // 마지막: detail에 '생산연도'가 없으면 null
  return null;
}

function applyFilters(rowsAll){
  const f = state.filters || defaultFilters();
  let rows = rowsAll || [];

  // prod filter
  if(f.prod === 'PLANNED'){
    rows = rows.filter(r => {
      const y = productionYear(r);
      return y !== null && y >= 2026;
    });
  } else if(f.prod === 'ALL'){
    // no filter
  } else if(f.prod === 'BLANK'){
    rows = rows.filter(r => productionYear(r) === null);
  } else {
    const y = parseInt(f.prod, 10);
    rows = rows.filter(r => productionYear(r) === y);
  }

  // plant filter (식재년도)
  if(f.plant && f.plant !== 'ALL'){
    const y = parseInt(f.plant, 10);
    rows = rows.filter(r => parseYear(r['식재년도']) === y);
  }
  return rows;
}

function updateFilterHint(){
  const hint = el('filterHint');
  if(!hint) return;
  const f = state.filters || defaultFilters();
  const prodText = (f.prod==='PLANNED') ? '생산연도: 예정지(≥2026)' :
                   (f.prod==='ALL') ? '생산연도: 전체' :
                   (f.prod==='BLANK') ? '생산연도: 미기재' : `생산연도: ${f.prod}`;
  const plantText = (!f.plant || f.plant==='ALL') ? '식재연도: 전체' : `식재연도: ${f.plant}`;
  hint.textContent = `${prodText} · ${plantText}`;
}

function uniqSortedYears(arr){
  const set = new Set();
  for(const v of arr){
    const y = parseYear(v);
    if(y) set.add(y);
  }
  return Array.from(set).sort((a,b)=>a-b);
}

function populateYearFilters(){
  const prodSel = el('prodYearFilter');
  const plantSel = el('plantYearFilter');
  if(!prodSel || !plantSel) return;

  const rowsAll = state.detail || [];
  const prodYears = uniqSortedYears(rowsAll.map(r => productionYear(r)));
  const plantYears = uniqSortedYears(rowsAll.map(r => r['식재년도']));

  // current
  state.filters = state.filters || defaultFilters();
  const f = state.filters;

  // prod options
  prodSel.innerHTML = '';
  prodSel.insertAdjacentHTML('beforeend', `<option value="PLANNED" ${f.prod==='PLANNED'?'selected':''}>예정지(≥2026) [기본]</option>`);
  prodSel.insertAdjacentHTML('beforeend', `<option value="ALL" ${f.prod==='ALL'?'selected':''}>전체(완료+예정)</option>`);
  prodSel.insertAdjacentHTML('beforeend', `<option value="BLANK" ${f.prod==='BLANK'?'selected':''}>미기재</option>`);
  for(const y of prodYears){
    const val = String(y);
    const sel = (String(f.prod)===val) ? 'selected' : '';
    prodSel.insertAdjacentHTML('beforeend', `<option value="${val}" ${sel}>${val}</option>`);
  }

  // plant options
  plantSel.innerHTML = '';
  plantSel.insertAdjacentHTML('beforeend', `<option value="ALL" ${(!f.plant || f.plant==='ALL')?'selected':''}>전체 [기본]</option>`);
  for(const y of plantYears){
    const val = String(y);
    const sel = (String(f.plant)===val) ? 'selected' : '';
    plantSel.insertAdjacentHTML('beforeend', `<option value="${val}" ${sel}>${val}</option>`);
  }

  updateFilterHint();
}

function applyFiltersAndRerender(){
  renderHomeSummary();
  applySearch();
  updateFilterHint();
  saveFilters();
}
/* ---- /Year Filters ---- */

function setupEvents(){
  const q = el('q');
  const openBtn = el('open');
  const clearBtn = el('clear');
  const statsBtn = el('statsBtn');
  const refreshBtn = el('dataRefreshBtn');
  const prodSel = el('prodYearFilter');
  const plantSel = el('plantYearFilter');

  // Ensure buttons are clickable even if previous run left them disabled
  [clearBtn, statsBtn, refreshBtn].forEach(b => { if (b) b.disabled = false; });

  if (q){
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') openFirst(); });
    q.addEventListener('input', () => applySearch());
  }
  if (openBtn) openBtn.addEventListener('click', openFirst);
  if (clearBtn) clearBtn.addEventListener('click', () => { if (q) q.value=''; applySearch(); });

  if (refreshBtn) refreshBtn.addEventListener('click', refreshDataFromServer);

  if (statsBtn) statsBtn.addEventListener('click', () => {
    el('stats').classList.toggle('hidden');
    renderStats();
  });

  if (prodSel){
    prodSel.addEventListener('change', (e)=>{
      state.filters = state.filters || {};
      state.filters.prodYear = (e.target.value===''?null:e.target.value);
      applyFiltersAndRerender();
    });
  }
  if (plantSel){
    plantSel.addEventListener('change', (e)=>{
      state.filters = state.filters || {};
      state.filters.plantYear = (e.target.value || 'ALL');
      applyFiltersAndRerender();
    });
  }

  // Region click delegation
  const regionTable = el('regionTable');
  if (regionTable){
    regionTable.addEventListener('click', (e)=>{
      const tr = e.target.closest('tr[data-region]');
      if (!tr) return;
      const region = tr.getAttribute('data-region');
      state.scope = {type:'region', value: region};
      applySearch();
    });
  }

  // Overall click
  const overallCard = el('overallCard');
  if (overallCard){
    overallCard.addEventListener('click', ()=>{
      state.scope = {type:'all', value:null};
      applySearch();
    });
  }
}



try{ window._productionYearLegacy = _productionYearLegacy; }catch(e){}
