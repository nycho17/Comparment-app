/* =========================================================
   CPT Quick Lookup - app.js
   Version: v8.5.3-final
   - data/ 경로 정상 로딩
   - 기본 생산연도 >= 2026
   - 생산/식재 연도 필터 정상 동작
   - 요약 / 지역별 합계 계산
   - 필터 상태 localStorage 유지
   ========================================================= */

const APP_VERSION = 'v8.5.3';

const state = {
  list: [],
  detail: [],
  segments: [],
  filtered: []
};

const STORAGE_KEY = 'cpt_filters_v1';

/* ---------- helpers ---------- */
function $(id){ return document.getElementById(id); }

function setSub(text){
  const el = document.querySelector('.sub');
  if(el) el.textContent = text;
}

function showLoading(on){
  setSub(
    on
      ? `현장용 초간단 · 조회 전용 · 기준키: CPT(명) · ${APP_VERSION} · 로딩…`
      : `현장용 초간단 · 조회 전용 · 기준키: CPT(명) · ${APP_VERSION}`
  );
}

function num(v){ return isNaN(v) ? 0 : Number(v); }
function sum(arr, fn){ return arr.reduce((a,c)=>a+fn(c),0); }

/* ---------- data load ---------- */
async function loadData(){
  showLoading(true);
  try{
    const base = 'data/';
    const [list, detail, segments] = await Promise.all([
      fetch(base+'comp_list.json').then(r=>r.json()),
      fetch(base+'comp_detail.json').then(r=>r.json()),
      fetch(base+'segments.json').then(r=>r.json())
    ]);
    state.list = list;
    state.detail = detail;
    state.segments = segments;
  }catch(e){
    console.error(e);
    alert('데이터 로딩 실패 (data 폴더 / json 파일 확인)');
  }finally{
    initFilters();
    applyFilters();
    showLoading(false);
  }
}

/* ---------- filters ---------- */
function initFilters(){
  const prodSel = $('prodYearFilter');
  const plantSel = $('plantYearFilter');
  if(!prodSel || !plantSel) return;

  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');

  const prodYears = [...new Set(state.list.map(r=>r.prod_year).filter(Boolean))].sort();
  const plantYears = [...new Set(state.list.map(r=>r.plant_year).filter(Boolean))].sort();

  prodSel.innerHTML = '';
  plantSel.innerHTML = '';

  prodSel.append(new Option('예정지(≥2026) [기본]', 'planned'));
  prodYears.forEach(y=>prodSel.append(new Option(y,y)));

  plantSel.append(new Option('전체 [기본]', 'all'));
  plantYears.forEach(y=>plantSel.append(new Option(y,y)));

  prodSel.value = saved.prod || 'planned';
  plantSel.value = saved.plant || 'all';

  prodSel.onchange = plantSel.onchange = ()=>{
    saveFilters();
    applyFilters();
  };
}

function saveFilters(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    prod: $('prodYearFilter')?.value,
    plant: $('plantYearFilter')?.value
  }));
}

/* ---------- apply & render ---------- */
function applyFilters(){
  const prod = $('prodYearFilter')?.value || 'planned';
  const plant = $('plantYearFilter')?.value || 'all';

  state.filtered = state.list.filter(r=>{
    let ok = true;
    if(prod === 'planned'){
      ok = num(r.prod_year) >= 2026;
    }else{
      ok = num(r.prod_year) === num(prod);
    }
    if(ok && plant !== 'all'){
      ok = num(r.plant_year) === num(plant);
    }
    return ok;
  });

  renderSummary();
  renderByRegion();
}

function renderSummary(){
  $('sumArea').textContent =
    sum(state.filtered,r=>num(r.area_ha)).toFixed(2);

  $('sumCount').textContent =
    state.filtered.length.toLocaleString();

  $('sumAsset').textContent =
    Math.round(sum(state.filtered,r=>num(r.asset))).toLocaleString();
}

function renderByRegion(){
  const tbody = $('regionTableBody');
  tbody.innerHTML = '';

  const map = {};
  state.filtered.forEach(r=>{
    const k = r.region || '기타';
    if(!map[k]) map[k]={area:0,count:0,asset:0};
    map[k].area += num(r.area_ha);
    map[k].count++;
    map[k].asset += num(r.asset);
  });

  Object.entries(map).forEach(([k,v])=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${k}</td>
      <td>${v.area.toFixed(2)}</td>
      <td>${v.count.toLocaleString()}</td>
      <td>${Math.round(v.asset).toLocaleString()}</td>
    `;
    tbody.appendChild(tr);
  });
}

/* ---------- init ---------- */
document.addEventListener('DOMContentLoaded', loadData);

