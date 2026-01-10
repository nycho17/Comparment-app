
// CPT Quick Lookup - app.js (patched: data fetch paths fixed)
// Version: v8.5.2-pathfix

const APP_VERSION = 'v8.5.2-pathfix';

const state = {
  list: [],
  detail: [],
  segments: [],
  filters: {}
};

function el(id){ return document.getElementById(id); }

function showLoading(on=true){
  const hint = document.querySelector('.sub');
  if(hint) hint.textContent = on ? '현장용 초간단 · 조회 전용 · 기준키: CPT(명) · ' + APP_VERSION + ' · 로딩…'
                                 : '현장용 초간단 · 조회 전용 · 기준키: CPT(명) · ' + APP_VERSION;
}

// ---- DATA LOAD (FIXED PATHS) ----
async function loadData(){
  showLoading(true);
  try{
    const DATA_BASE = 'data/'; // <<<<<< 핵심 수정: data 폴더 경로
    const [list, detail, segments] = await Promise.all([
      fetch(DATA_BASE + 'comp_list.json').then(r=>r.json()),
      fetch(DATA_BASE + 'comp_detail.json').then(r=>r.json()),
      fetch(DATA_BASE + 'segments.json').then(r=>r.json())
    ]);
    state.list = list || [];
    state.detail = detail || [];
    state.segments = segments || [];
  }catch(err){
    console.error('Data load failed:', err);
    alert('데이터 로딩 실패: data/ 폴더 경로 또는 JSON 파일을 확인하세요.');
  }finally{
    showLoading(false);
    if(typeof populateYearFilters === 'function') populateYearFilters();
    if(typeof applyFiltersAndRerender === 'function') applyFiltersAndRerender();
  }
}

// ---- PLACEHOLDER HOOKS (existing functions should already exist in your project) ----
function populateYearFilters(){ /* 기존 구현 사용 */ }
function applyFiltersAndRerender(){ /* 기존 구현 사용 */ }

// ---- INIT ----
document.addEventListener('DOMContentLoaded', ()=>{
  loadData();
});
