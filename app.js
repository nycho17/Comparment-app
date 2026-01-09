const APP_VERSION = 'v5.0';
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
  const rows = state.detail || [];
  // Year stats
  const years = computeStats(rows, '식재년도')
    .sort((a,b) => (a.key==='미기재') - (b.key==='미기재') || Number(a.key)-Number(b.key));
  const yBody = el('yearStatsBody');
  if (yBody){
    yBody.innerHTML = '';
    for (const r of years){
      yBody.insertAdjacentHTML('beforeend', `<tr><td>${r.key}</td><td>${fmt(r.area)}</td><td>${fmt(r.asset)}</td><td>${fmt(r.count)}</td></tr>`);
    }
  }

  // Species stats (top by area)
  const species = computeStats(rows, 'Species Amended_1')
    .sort((a,b) => b.area - a.area);
  const sBody = el('speciesStatsBody');
  if (sBody){
    sBody.innerHTML = '';
    for (const r of species.slice(0,50)){
      sBody.insertAdjacentHTML('beforeend', `<tr><td>${r.key}</td><td>${fmt(r.area)}</td><td>${fmt(r.asset)}</td><td>${fmt(r.count)}</td></tr>`);
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

  // base set (optionally scoped)
  let base = state.list;
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
  el('statsBtn').addEventListener('click', showStatsView);
  el('statsBack').addEventListener('click', hideStatsView);
  el('back').addEventListener('click', backToList);
}



function renderHomeSummary(){
  const rows = state.detail || [];
  const areaSum = rows.reduce((acc,r)=> acc + toNum(r['HA']), 0);
  const assetSum = rows.reduce((acc,r)=> acc + toNum(r['조림자산 계']), 0);
  const count = rows.length;

  const oa = el('overallArea'); if (oa) oa.textContent = fmt(areaSum);
  const oc = el('overallCount'); if (oc) oc.textContent = fmt(count);
  const os = el('overallAsset'); if (os) os.textContent = fmt(assetSum);

  const scopeLabel = el('currentScope');
  const scopePill = el('scopePill');
  const clearBtn = el('clearScopeBtn');
  if (state.scope && state.scope.type === 'region' && state.scope.value){
    if (scopeLabel) scopeLabel.textContent = `지역: ${state.scope.value}`;
    if (scopePill){
      scopePill.style.display = 'inline-block';
      scopePill.textContent = `지역 필터: ${state.scope.value}`;
    }
    if (clearBtn) clearBtn.classList.remove('hidden');
  } else {
    if (scopeLabel) scopeLabel.textContent = '전체';
    if (scopePill){
      scopePill.style.display = 'none';
      scopePill.textContent = '';
    }
    if (clearBtn) clearBtn.classList.add('hidden');
  }

  // Region stats
  const regions = computeStats(rows, '지역').sort((a,b)=> b.area - a.area);
  const body = el('regionStatsBody');
  if (body){
    body.innerHTML = '';
    for (const r of regions){
      const keyEsc = r.key.replace(/"/g,'&quot;');
      body.insertAdjacentHTML('beforeend',
        `<tr class="item" data-region="${keyEsc}" style="cursor:pointer">
           <td>${r.key}</td><td>${fmt(r.area)}</td><td>${fmt(r.count)}</td><td>${fmt(r.asset)}</td>
         </tr>`);
    }
    // click handlers (event delegation)
    body.querySelectorAll('tr[data-region]').forEach(tr => {
      tr.addEventListener('click', () => {
        const region = tr.getAttribute('data-region');
        setRegionScope(region);
      });
    });
  }
}

function setRegionScope(region){
  state.scope = {type:'region', value: region};
  el('q').value = '';
  applySearch();
  // jump to results
  const listView = el('listView');
  if (listView) listView.scrollIntoView({behavior:'smooth', block:'start'});
}

function clearScope(){
  state.scope = {type:'all', value:null};
  el('q').value = '';
  applySearch();
}


function setupSWUpdate(){
  if (!('serviceWorker' in navigator)) return;

  const banner = el('updateBanner');
  const reloadBtn = el('reloadBtn');
  const dismissBtn = el('dismissBtn');

  function showBanner(){
    if (banner) banner.classList.remove('hidden');
  }
  function hideBanner(){
    if (banner) banner.classList.add('hidden');
  }

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // New SW has taken control
    window.location.reload();
  });

  navigator.serviceWorker.getRegistration().then((reg) => {
    if (!reg) return;
    // If there's already a waiting worker, prompt immediately
    if (reg.waiting) showBanner();

    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed') {
          // If there's an existing controller, it's an update
          if (navigator.serviceWorker.controller) showBanner();
        }
      });
    });

    if (reloadBtn){
      reloadBtn.addEventListener('click', () => {
        if (reg.waiting){
          reg.waiting.postMessage({type:'SKIP_WAITING'});
        } else {
          // fallback
          window.location.reload();
        }
      });
    }
    if (dismissBtn){
      dismissBtn.addEventListener('click', hideBanner);
    }
  });
}

async function registerSW(){
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('sw.js');
    // Ask browser to check for updates
    if (reg && reg.update) reg.update();
    setupSWUpdate();
  } catch(e) {}
}

setupEvents();
setupInstall();
loadData();
registerSW();
