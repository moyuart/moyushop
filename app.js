/* ============================================================
   墨鱼铺子 · 前端主逻辑
   ============================================================ */
const SITE = window.SITE || {};
const PRODUCTS = window.PRODUCTS || [];
const CALC = window.Calc;
let state = { cat:'全部', search:'', sort:'default', detailId:null, selectedSpecs:new Set(), galleryIdx:0, galleryFromSpec:-1, giftId:null, specSearch:'', specFoldAt:6 };
let FAVS = loadFavs();
let posterPages = [], posterIdx = 0;
let unzipKind = 'pc';
let visibleCount = 40; // 首屏渐进加载：先显示 40 款

/* ---------- 图片域名切换 + 失败自动兜底 ----------
   原始数据里的图片 URL 全部是旧域名 r2.dev，一个字都不改。
   展示时由 imgUrl() 按配置决定是否换成自定义域名；
   新域名加载失败时 onerror / loadImg 自动切回旧域名重试。 */
const IMG_OLD = (SITE.imgDomain&&SITE.imgDomain.old)||'https://pub-df20bdf6d05346ef8e373d1f81d43d30.r2.dev';
const IMG_NEW = (SITE.imgDomain&&SITE.imgDomain.new)||'';
const IMG_VER = window.PRODUCTS_VERSION || ''; // 图片版本号：后台每次导出都会变，用来破 R2/CDN 的 1 年强缓存
function imgMode(){ return (SITE.imgDomain&&SITE.imgDomain.mode)||'old'; }
/* 统一图片 URL：先切域名，再幂等追加 ?v=版本号（已有 v= 不重复加）。
   R2 同名文件覆盖后 URL 不变，不加版本号浏览器/CDN 会一直显示旧图。 */
function imgUrl(u){
  if(!u||typeof u!=='string') return u;
  if(imgMode()!=='old' && IMG_NEW && u.indexOf(IMG_OLD)===0) u=IMG_NEW+u.slice(IMG_OLD.length);
  if(IMG_VER && !/[?&]v=/.test(u)) u+=(u.indexOf('?')>=0?'&':'?')+'v='+encodeURIComponent(IMG_VER);
  return u;
}
function imgFallback(u){
  if(IMG_NEW&&u.indexOf(IMG_NEW)===0) return IMG_OLD+u.slice(IMG_NEW.length);
  return null;
}
/* 两级规格图开关（全店 → 产品），逐级与关系，任一级关则整链不显示；单规格开关已取消 */
function specImgsOn(){ return SITE.specImgEnabled!==false; }                 // ① 全店总开关
function prodSpecImgsOn(p){ return !p || p.specImgsOn!==false; }             // ② 产品级总开关（缺省视为开）
/* 前两级都开、且该规格确实有图，就显示规格图（不再看单规格 showImg） */
function specShowImg(s,p){ if(!specImgsOn()) return false; if(p && !prodSpecImgsOn(p)) return false; return !!(s && s.hasImg!==false && s.img); }
/* 收藏快照统一入口：两级开关放行且该规格有图才算"有规格图"，否则空串（展示时用主图兜底） */
function resolveSpecImg(p,s){ return specShowImg(s,p) ? s.img : ''; }

/* ---------- 收藏存储 ---------- */
function loadFavs(){ try{ return JSON.parse(localStorage.getItem('moyu_favs')||'[]'); }catch(e){ return []; } }
function saveFavs(){ localStorage.setItem('moyu_favs', JSON.stringify(FAVS)); updateFavCount(); }
function updateFavCount(){
  const n=FAVS.length;
  ['favCountTop','favCountTab'].forEach(id=>{ const el=document.getElementById(id); if(el) el.textContent=n; });
  const b=document.getElementById('favCountTab'); if(b) b.style.display=n?'flex':'none';
}
function favKey(pid, specIdx){ return pid+'#'+specIdx; }
function isFaved(pid, specIdx){ return FAVS.some(f=>f.key===favKey(pid,specIdx)); }
function toggleFav(pid, specIdx){
  const key=favKey(pid,specIdx); const i=FAVS.findIndex(f=>f.key===key);
  if(i>=0){ FAVS.splice(i,1); toast('已取消收藏'); }
  else{
    const p=PRODUCTS.find(x=>x.id===pid); if(!p) return;
    const s=p.specs[specIdx];
    FAVS.push({
      key, pid, specIdx, title:p.title, cover:p.cover,
      price:s?s.price:p.price, specName:s?s.name:'默认款',
      specImg:resolveSpecImg(p,s), time:Date.now()
    });
    toast('已收藏，在「我的收藏」里找得到～');
  }
  saveFavs();
  if(state.detailId===pid) updateFavBtn();
  if(!document.getElementById('view-fav').hidden) renderFav();
}

/* ---------- 初始化 ---------- */
function init(){
  setText('shopName', SITE.shopName||'墨鱼铺子');
  setText('shopSlogan', SITE.slogan||'');
  const nb=document.getElementById('noticeBar');
  if(nb){
    const linkText=SITE.noticeLinkText||'新手必看 ›';
    nb.innerHTML='<div><span class="notice-txt">'+esc(SITE.notice||'')+'</span><button class="notice-link" onclick="openBuyGuide()">'+esc(linkText)+'</button></div>';
  }
  setText('updateDate', SITE.updateDate?('更新 '+SITE.updateDate):'');
  setText('qqNumber', SITE.qq||'3998694209');
  setText('posterQqNum', SITE.qq||'3998694209');
  if(SITE.logo){ const l=document.getElementById('shopLogo'); if(l){ l.src=imgUrl(SITE.logo); l.onerror=function(){ const fb=imgFallback(this.src); if(fb){this.onerror=null;this.src=fb;} }; } }
  if(SITE.qr){ const q=document.getElementById('qqQr'); if(q){ q.src=imgUrl(SITE.qr); q.onerror=function(){ const fb=imgFallback(this.src); if(fb){this.onerror=null;this.src=fb;} }; } }
  renderCatTabs(); updateFavCount(); renderGiftBanner(); renderWallpaperBanner(); renderGrid(true); setupInfiniteScroll();
  window.addEventListener('hashchange', route);
  route();
}
function setText(id,t){ const el=document.getElementById(id); if(el) el.textContent=t; }
function catCount(c){ return c==='全部'?PRODUCTS.length:PRODUCTS.filter(p=>p.cat===c).length; }
function renderCatTabs(){
  const cats=SITE.cats||['全部'];
  const box=document.getElementById('catTabs');
  box.innerHTML=cats.map(c=>`<button class="cat-tab${c===state.cat?' active':''}" onclick="setCat('${c}')">${c}<span class="cnt">${catCount(c)}</span></button>`).join('');
}
function setCat(c){ state.cat=c; renderCatTabs(); renderGrid(true); }
function onSearch(v){ state.search=v.trim(); const c=document.getElementById('searchClear'); if(c)c.hidden=!v; renderGrid(true); }
function clearSearch(){ state.search=''; const i=document.getElementById('searchInput'); if(i)i.value=''; const c=document.getElementById('searchClear'); if(c)c.hidden=true; renderGrid(true); }
function onSort(v){ state.sort=v; renderGrid(true); }

function getFiltered(){
  let list=PRODUCTS.slice();
  if(state.cat!=='全部') list=list.filter(p=>p.cat===state.cat);
  if(state.search){
    const q=state.search.toLowerCase();
    list=list.filter(p=>(p.title+' '+(p.detail||'')+' '+p.specs.map(s=>s.name).join(' ')).toLowerCase().includes(q));
  }
  if(state.sort==='priceAsc') list.sort((a,b)=>a.price-b.price);
  else if(state.sort==='priceDesc') list.sort((a,b)=>b.price-a.price);
  else if(state.sort==='newest') list.sort((a,b)=>b.id-a.id);
  else {
    // 默认排序：新品优先 → 规格多优先 → id 大优先
    list.sort((a,b)=>{
      const na=a.isNew?1:0, nb=b.isNew?1:0;
      if(na!==nb) return nb-na;
      const sa=(a.specs&&a.specs.length)||0, sb=(b.specs&&b.specs.length)||0;
      if(sa!==sb) return sb-sa;
      return (b.id||0)-(a.id||0);
    });
  }
  return list;
}
function cardHtml(p,i,delayIdx){
  const d=(delayIdx==null?i:delayIdx);
  return `
    <div class="p-card" style="animation-delay:${Math.min(d*35,350)}ms" onclick="openDetail(${p.id})">
      <div class="p-cover">
        <img src="${imgUrl(p.cover)}" alt="${esc(p.title)}" ${i<12?'loading="eager" fetchpriority="high"':'loading="lazy"'} onerror="imgErr(this)">
        ${p.isNew?'<span class="p-new">新品</span>':''}
        <span class="p-cat">${p.cat}</span>
      </div>
      <div class="p-body">
        <div class="p-title">${esc(p.title)}</div>
        <div class="p-bottom">
          <div class="p-price num"><small>¥</small>${p.price}<small> 起</small></div>
          <span class="p-specnum">${p.specs.length}个规格</span>
        </div>
      </div>
    </div>
  `;
}
function renderGrid(reset){
  if(reset) visibleCount=40;
  const list=getFiltered();
  setText('resultCount', `共 ${list.length} 件商品`);
  const grid=document.getElementById('productGrid');
  const es=document.getElementById('emptyState'); if(es) es.hidden=list.length>0;
  const shown=list.slice(0,visibleCount);
  grid.innerHTML=shown.map((p,i)=>cardHtml(p,i)).join('');
  renderLoadMore(list.length);
}
function renderLoadMore(total){
  const el=document.getElementById('loadMore'); if(!el) return;
  if(visibleCount<total){ el.hidden=false; const b=document.getElementById('loadMoreBtn'); if(b) b.textContent=`加载更多（还有 ${total-visibleCount} 件）`; }
  else el.hidden=true;
}
let isLoadingMore=false;
function loadMore(){
  const total=getFiltered().length;
  if(isLoadingMore || visibleCount>=total) return;
  isLoadingMore=true;
  const list=getFiltered();
  const from=visibleCount;
  visibleCount=Math.min(visibleCount+40,total);
  // 只追加新增卡片，已有卡片 DOM 不动 → 不重播入场动画、图片不重新解码，触底无白屏
  const grid=document.getElementById('productGrid');
  if(grid){
    const frag=document.createElement('div');
    frag.innerHTML=list.slice(from,visibleCount).map((p,i)=>cardHtml(p,from+i,i)).join('');
    while(frag.firstChild) grid.appendChild(frag.firstChild);
  }
  renderLoadMore(total);
  // 等新卡片布局稳定后再允许下一次加载，避免 rootMargin 连续触发造成跳动
  requestAnimationFrame(()=>requestAnimationFrame(()=>{ isLoadingMore=false; }));
}
let scrollObserver=null;
function setupInfiniteScroll(){
  const sentinel=document.getElementById('gridSentinel'); if(!sentinel||!('IntersectionObserver' in window)) return;
  if(scrollObserver) scrollObserver.disconnect();
  scrollObserver=new IntersectionObserver(entries=>{
    if(entries.some(e=>e.isIntersecting) && visibleCount<getFiltered().length) loadMore();
  },{rootMargin:'300px'});
  scrollObserver.observe(sentinel);
}

/* ---------- 路由 ---------- */
function route(){
  const h=location.hash;
  if(h.startsWith('#/product/')){ showDetail(parseInt(h.split('/')[2],10)); }
  else if(h==='#/fav'){ showFav(); }
  else{ showHome(); }
}
function setActiveTab(name){
  document.querySelectorAll('.tabbar .tab').forEach(t=>t.classList.remove('active'));
  const t=document.getElementById('tab-'+name); if(t)t.classList.add('active');
}
function showHome(){
  document.getElementById('view-home').hidden=false;
  document.getElementById('view-detail').hidden=true;
  document.getElementById('view-fav').hidden=true;
  const ab=document.querySelector('.detail-actionbar'); if(ab)ab.hidden=true;
  state.detailId=null; setActiveTab('home');
}
function goHome(){ location.hash='#/'; if(location.hash==='#/'||location.hash==='')showHome(); }
function goFav(){ location.hash='#/fav'; }
function openDetail(id){ location.hash='#/product/'+id; }
function goBack(){ if(history.length>1) history.back(); else goHome(); }

/* ---------- 详情页 ---------- */
function showDetail(id){
  const p=PRODUCTS.find(x=>x.id===id);
  if(!p){ showHome(); return; }
  state.detailId=id; state.selectedSpecs=new Set(); state.galleryIdx=0; state.galleryFromSpec=-1; state.giftId=null;
  document.getElementById('view-home').hidden=true;
  document.getElementById('view-fav').hidden=true;
  const v=document.getElementById('view-detail'); v.hidden=false; setActiveTab('home');
  const imgs=p.images.length?p.images:[p.cover.replace('/thumb/','/full/')];
  const firstFull=imgs[0];

  // 规格图跟随全店+产品两级开关：开且该规格有图=显示图，关=纯文字（不填主图、无角标）
  const SPEC_FOLD_AT=6;
  state.specExpanded=false; state.specSearch='';
  // 规格说明条：按商品分类取 SITE.specTip 文案，买家一眼看懂【数字+数字】含义
  const tipMap=SITE.specTip||{};
  const catTip=tipMap[p.cat]||'';
  const commonTip=tipMap._common||'';
  const specTipBar=(catTip||commonTip)?`<div class="spec-tipbar">
    <svg class="ic"><use href="#i-info"/></svg>
    <div class="stb-body">${catTip?`<div>${esc(catTip)}</div>`:''}${commonTip?`<div class="stb-common">${esc(commonTip)}</div>`:''}</div>
  </div>`:'';
  const specHtml=p.specs.map((s,i)=>{
    const withImg=specShowImg(s,p);
    const pic=withImg?`<div class="si-pic" title="点图看大图" onclick="previewSpecImg(event,${i})"><img class="si-img" src="${imgUrl(s.img)}" alt="" loading="lazy" onerror="imgErr(this)"><span class="si-pic-hint">点图看大图</span></div>`:'';
    const folded=i>=SPEC_FOLD_AT?' spec-fold':'';
    const newTag=s.isNew?'<span class="si-new">新品</span>':'';
    return `
    <div class="spec-item${withImg?'':' spec-text'}${folded}" id="spec-${i}" data-specname="${esc(s.name).toLowerCase()}" onclick="toggleSpec(${i})">
      <span class="si-check"><svg class="ic"><use href="#i-check"/></svg></span>
      ${pic}
      <div class="si-name">${esc(s.name)}</div>
      ${newTag}
      <div class="si-price num">¥${s.price}</div>
    </div>`;
  }).join('');
  const foldable=p.specs.length>SPEC_FOLD_AT;
  const foldBtn=foldable?`<button class="spec-expand" id="specExpand" onclick="toggleSpecExpand()">展开全部 ${p.specs.length} 个规格 <span>⌄</span></button>`:'';
  // 规格数很多（>20）时给搜索框，快速按名字找款
  const searchBox=p.specs.length>20?`<div class="spec-search"><input type="search" id="specSearchInput" placeholder="搜规格名/角色，快速找款" oninput="filterSpecs(this.value)" autocomplete="off"></div>`:'';
  const noMatch='<div class="spec-nomatch" id="specNoMatch" hidden>没找到匹配的规格，换个词试试～</div>';

  v.innerHTML=`
    <div class="detail-wrap">
      <button class="btn-back" onclick="goBack()"><svg class="ic"><use href="#i-back"/></svg> 返回商品列表</button>
      <div class="detail-top">
        <div class="gallery-card">
          <div class="gallery-main" id="galleryMainBox" onclick="onGalleryTap(event)">
            <img id="galleryMain" src="${imgUrl(imgs[0])}" alt="${esc(p.title)}" onerror="imgErr(this)">
            ${imgs.length>1?`<div class="gallery-dots" id="galleryDots">${imgs.map((_,i)=>`<span class="gd-dot${i===0?' active':''}"></span>`).join('')}</div><div class="gallery-swipe-hint">← 左右滑动看更多 →</div>`:''}
          </div>
          <div class="gallery-preview-tip" id="galleryPreviewTip" hidden>
            <span id="galleryPreviewName"></span>
            <button type="button" onclick="clearSpecPreview(event)">返回商品图</button>
          </div>
          <div class="gallery-thumbs">
            ${imgs.map((u,i)=>`<img src="${imgUrl(u)}" class="${i===0?'active':''}" onclick="setGallery(${i})" loading="lazy" onerror="imgErr(this)">`).join('')}
          </div>
          <!-- PC 端：价格 + 优惠摘要（随规格联动，主图下常驻） -->
          <div class="pc-summary" id="pcSummary">
            <div class="pcs-price num" id="pcsPrice"><small>¥</small>${p.price}<small> 起</small></div>
            <div class="pcs-tags" id="pcsTags"><span class="pcs-tag">满3件9折</span><span class="pcs-tag">满¥50送赠品</span></div>
            <button class="pcs-gift" id="pcsGiftBtn" hidden onclick="openGift()">🎁 选赠品</button>
          </div>
        </div>
        <div class="info-card">
          <div class="d-title">${esc(p.title)}</div>
          <div class="d-catline"><span class="d-cat-tag">${esc(p.cat)}</span><button class="d-cat-help" onclick="openCatGuide()" title="这种包是什么意思？"><svg class="ic"><use href="#i-info"/></svg> 这种包怎么挑？</button></div>
          <div class="d-price num"><small>¥</small>${p.price}<small> 起</small></div>
          <div class="d-sub">共 ${p.specs.length} 款可选，挑中几个都可以一起问</div>
          <div class="promo-strip" id="promoStrip" hidden></div>
          <div class="spec-head"><h3>想选哪个款？</h3></div>
          <div class="spec-tip">看中哪个点哪个，可以多选，选好后点「生成咨询图」发给店主就行～</div>
          ${specTipBar}
          ${searchBox}
          <div class="spec-list" id="specList">${specHtml}</div>
          ${noMatch}
          ${foldBtn}
          <div class="picked-line" id="pickedLine"></div>
          <div class="d-actions">
            <button class="btn-fav" id="favBtn" onclick="favCurrent()"><svg class="ic"><use href="#i-star"/></svg> <span>收藏</span></button>
            <button class="btn-gen" id="genBtn" disabled onclick="genPoster()">生成咨询图 ›</button>
          </div>
        </div>
      </div>
      <div class="detail-below">
        <div class="d-block">
          <h3>商品详情</h3>
          <div class="d-text">${esc(p.detail||'详情见图，或咨询店主～')}</div>
          <button class="d-unzip" onclick="openUnzip()">不会解压？点这里看电脑/手机解压教程 ›</button>
        </div>
        <div class="d-block">
          <h3>下单须知</h3>
          <div class="d-note">① 看清规格 → ② 点方块选中 → ③ 生成咨询图保存到相册 → ④ 发 QQ 给店主，按图上款式规格回复你。<br>⑤ 首次购买先看顶上的解压教程。价格均为四舍五入后的整数，优惠后价格也取整。</div>
        </div>
      </div>
    </div>
    <div class="detail-actionbar" id="actionBar">
      <span class="dab-price num">¥${p.price}起</span>
      <button class="btn-fav" id="favBtnM" onclick="favCurrent()"><svg class="ic"><use href="#i-star"/></svg></button>
      <button class="btn-giftbar" id="giftBtnM" hidden onclick="openGift()">🎁 选赠品</button>
      <button class="btn-gen" id="genBtnM" disabled onclick="genPoster()">生成咨询图</button>
    </div>
  `;
  // 默认款：空规格商品进来默认选中第 0 个
  if(p.isDefaultSpec && p.specs.length===1) toggleSpec(0,true);
  window.scrollTo(0,0);
}
function setGallery(i){
  const p=PRODUCTS.find(x=>x.id===state.detailId); if(!p) return;
  const imgs=p.images.length?p.images:[p.cover.replace('/thumb/','/full/')];
  state.galleryIdx=(i+imgs.length)%imgs.length;
  state.galleryFromSpec=-1; // 切商品图即退出规格图预览
  const tip=document.getElementById('galleryPreviewTip'); if(tip)tip.hidden=true;
  document.querySelectorAll('.spec-item').forEach(el=>el.classList.remove('spec-preview'));
  const m=document.getElementById('galleryMain'); if(m){ m.src=imgUrl(imgs[state.galleryIdx]); m.dataset.imgFb=''; m.onerror=function(){ const fb=imgFallback(this.src); if(fb){this.onerror=null;this.src=fb;} }; }
  document.querySelectorAll('.gallery-thumbs img').forEach((el,j)=>el.classList.toggle('active',j===state.galleryIdx));
  document.querySelectorAll('#galleryDots .gd-dot').forEach((el,j)=>el.classList.toggle('active',j===state.galleryIdx));
}
/* 点主图打开灯箱；正在预览规格图时优先展示规格图；滑动后不误触发 */
function onGalleryTap(e){
  const box=document.getElementById('galleryMainBox');
  if(box && box.dataset.swiped==='1') return;
  openLightbox(currentGalleryUrlAsList(), state.galleryFromSpec>=0?0:state.galleryIdx);
}
/* 返回灯箱展示用的图片数组：规格预览态用规格图全量数组，正常态用商品主图数组 */
function currentGalleryUrlAsList(){
  const p=PRODUCTS.find(x=>x.id===state.detailId); if(!p) return [];
  if(state.galleryFromSpec>=0){
    const withImg=p.specs.map((sp,idx)=>({sp,idx})).filter(o=>specShowImg(o.sp,p));
    return withImg.map(o=>o.sp.img);
  }
  return p.images.length?p.images:[p.cover.replace('/thumb/','/full/')];
}
/* 主图左右滑动：手势切图，轻点仍打开灯箱 */
(function bindGallerySwipe(){
  let sx=0, sy=0, moved=false, boundId=null;
  document.addEventListener('touchstart',e=>{
    const box=e.target.closest && e.target.closest('#galleryMainBox');
    if(!box) return;
    if(e.touches.length!==1) return;
    sx=e.touches[0].clientX; sy=e.touches[0].clientY; moved=false; boundId=box;
  },{passive:true});
  document.addEventListener('touchmove',e=>{
    if(!boundId||e.touches.length!==1) return;
    const dx=Math.abs(e.touches[0].clientX-sx), dy=Math.abs(e.touches[0].clientY-sy);
    if(dx>16&&dx>dy) moved=true;
  },{passive:true});
  document.addEventListener('touchend',e=>{
    if(!boundId) return;
    const box=boundId; boundId=null;
    if(moved&&e.changedTouches.length){
      const dx=e.changedTouches[0].clientX-sx;
      box.dataset.swiped='1'; setTimeout(()=>{try{delete box.dataset.swiped;}catch(_){box.dataset.swiped='';}},350);
      if(Math.abs(dx)>40) setGallery(state.galleryIdx+(dx<0?1:-1));
    }
  },{passive:true});
})();
/* 当前大图对应的原始 URL（点大图看全屏时用；正在预览规格图则取规格图） */
function currentGalleryUrl(){
  const p=PRODUCTS.find(x=>x.id===state.detailId); if(!p) return '';
  if(state.galleryFromSpec>=0){ const s=p.specs[state.galleryFromSpec]; if(s&&s.img) return s.img; }
  const imgs=p.images.length?p.images:[p.cover.replace('/thumb/','/full/')];
  return imgs[state.galleryIdx]||imgs[0]||'';
}
/* 点规格图：打开全屏大图（含该商品所有规格图，可左右滑动对比），并顺手选中该规格+左侧联动 */
function previewSpecImg(e,i){
  if(e){ e.stopPropagation(); e.preventDefault(); }
  const p=PRODUCTS.find(x=>x.id===state.detailId); if(!p) return;
  const s=p.specs[i]; if(!s||!s.img) return;
  // 左侧大图联动 + 选中（桌面端实时可见）
  state.galleryFromSpec=i;
  const m=document.getElementById('galleryMain');
  if(m){ m.src=imgUrl(s.img); m.dataset.imgFb=''; m.onerror=function(){ const fb=imgFallback(this.src); if(fb){this.onerror=null;this.src=fb;} }; }
  document.querySelectorAll('.gallery-thumbs img').forEach(el=>el.classList.remove('active'));
  document.querySelectorAll('.spec-item').forEach((el,j)=>el.classList.toggle('spec-preview',j===i));
  const tip=document.getElementById('galleryPreviewTip');
  if(tip){ tip.hidden=false; const n=document.getElementById('galleryPreviewName'); if(n)n.textContent='正在看：'+String(s.name||('规格'+(i+1))).slice(0,42); }
  toggleSpec(i,true); // 点图即选中，与点规格卡行为一致
  // 打开全屏灯箱：把所有有图的规格组成数组，从当前这张开始，可左右滑动对比
  const withImg=p.specs.map((sp,idx)=>({sp,idx})).filter(o=>specShowImg(o.sp,p));
  const imgs=withImg.map(o=>o.sp.img);
  const start=withImg.findIndex(o=>o.idx===i);
  openLightbox(imgs.length?imgs:[s.img], start<0?0:start);
}
function clearSpecPreview(e){
  if(e){ e.stopPropagation(); e.preventDefault(); }
  setGallery(state.galleryIdx<0?0:state.galleryIdx);
}
function toggleSpec(i, force){
  const p=PRODUCTS.find(x=>x.id===state.detailId); if(!p) return;
  if(state.selectedSpecs.has(i)){ if(force===true)return; state.selectedSpecs.delete(i); }
  else state.selectedSpecs.add(i);
  const el=document.getElementById('spec-'+i); if(el) el.classList.toggle('selected', state.selectedSpecs.has(i));
  const sel=document.getElementById('pickedLine');
  if(sel){ const arr=[...state.selectedSpecs]; sel.textContent=arr.length?`已选 ${arr.length} 个：${arr.map(j=>p.specs[j].name.slice(0,12)).join('、')}`:''; }
  const dis=state.selectedSpecs.size===0;
  ['genBtn','genBtnM'].forEach(id=>{ const b=document.getElementById(id); if(b)b.disabled=dis; });
  updatePriceDisplay();
  renderPromoStrip();
}
/* 价格随规格联动：未选显示起价；选中后显示应付合计（含优惠），与咨询图金额一致 */
function updatePriceDisplay(){
  const p=PRODUCTS.find(x=>x.id===state.detailId); if(!p) return;
  const n=state.selectedSpecs.size;
  const r=n?currentOrder():null;
  const label = n===0
    ? `<small>¥</small>${p.price}<small> 起</small>`
    : (n===1
        ? `<small>¥</small>${r.payableYuan}`
        : `<small>¥</small>${r.payableYuan}<small> 合计·${n}件</small>`);
  const dp=document.querySelector('.d-price'); if(dp) dp.innerHTML=label;
  const ab=document.querySelector('.dab-price'); if(ab) ab.innerHTML=(n===0?`¥${p.price}起`:`¥${r.payableYuan}${n>1?'·'+n+'件':''}`);
}
function toggleSpecExpand(){
  const list=document.getElementById('specList'); if(!list)return;
  state.specExpanded=!state.specExpanded;
  list.classList.toggle('expanded',state.specExpanded);
  const btn=document.getElementById('specExpand');
  if(btn)btn.innerHTML=state.specExpanded?'收起规格 <span>⌃</span>':`展开全部 ${PRODUCTS.find(x=>x.id===state.detailId)?.specs.length||''} 个规格 <span>⌄</span>`;
}
/* 规格搜索：按名字过滤显示，搜索时自动展开全部，不改动已选中的规格 */
function filterSpecs(v){
  state.specSearch=(v||'').trim().toLowerCase();
  const list=document.getElementById('specList'); if(!list)return;
  let shown=0;
  list.querySelectorAll('.spec-item').forEach(el=>{
    const hit=!state.specSearch||(el.getAttribute('data-specname')||'').includes(state.specSearch);
    el.style.display=hit?'':'none';
    if(hit)shown++;
  });
  // 搜索时强制展开（折叠的必须能搜到）
  if(state.specSearch){ list.classList.add('expanded'); }
  else { list.classList.toggle('expanded',state.specExpanded); }
  const nm=document.getElementById('specNoMatch'); if(nm)nm.hidden=shown>0;
  const foldBtn=document.getElementById('specExpand'); if(foldBtn)foldBtn.style.display=state.specSearch?'none':'';
}

/* ---------- 优惠计算与展示 ---------- */
function selectedItems(){
  const p=PRODUCTS.find(x=>x.id===state.detailId); if(!p) return [];
  return [...state.selectedSpecs].map(i=>({ price:p.specs[i].price, qty:1 }));
}
/* 订单来源：detail=详情页(选中规格) / fav=收藏页(勾选收藏)。
   currentOrder 按来源取不同商品集合，赠品选择逻辑两处共用。 */
let orderSource='detail';
function currentOrder(){
  let items;
  if(orderSource==='fav') items=favSelectedItems();
  else items=selectedItems();
  return CALC.calcOrder(items, SITE.promo||{}, state.giftId);
}
function favSelectedItems(){ return FAVS.filter(f=>favSelected.has(f.key)).map(f=>({price:f.price,qty:1})); }
let promoDetailOpen=false;   // 右侧优惠明细是否展开（默认收起）
let lastGiftEligible=false;   // 上一轮达标状态，用于触发一次呼吸高亮
function togglePromoDetail(){ promoDetailOpen=!promoDetailOpen; renderPromoStrip(); }
function renderPromoStrip(){
  const box=document.getElementById('promoStrip');
  const giftBtn=document.getElementById('giftBtnM');
  const pc=document.getElementById('pcSummary');
  const items=selectedItems();
  if(!items.length){
    if(box)box.hidden=true; if(giftBtn)giftBtn.hidden=true;
    // 左侧摘要复位为起价
    if(pc){ const pp=document.getElementById('pcsPrice'); if(pp)pp.innerHTML=`<small>¥</small>${(PRODUCTS.find(x=>x.id===state.detailId)||{}).price||''}<small> 起</small>`; const g=document.getElementById('pcsGiftBtn'); if(g){g.hidden=true;g.classList.remove('pulse');} }
    lastGiftEligible=false; return;
  }
  const r=currentOrder();
  const justUnlocked = r.giftEligible && !lastGiftEligible;
  lastGiftEligible=r.giftEligible;

  // 底部操作条赠品入口（手机端沿用）
  if(giftBtn){
    giftBtn.hidden=!r.giftEligible;
    if(r.giftEligible) giftBtn.textContent=state.giftId?'🎁 赠品已选✓':'🎁 选赠品';
    giftBtn.classList.toggle('picked',!!state.giftId);
  }

  // 左侧 PC 摘要条：价格联动 + 赠品按钮达标高亮
  if(pc){
    const pp=document.getElementById('pcsPrice');
    if(pp) pp.innerHTML = (items.length===1)
      ? `<small>¥</small>${r.payableYuan}`
      : `<small>¥</small>${r.payableYuan}<small> 合计·${r.qty}件</small>`;
    const pg=document.getElementById('pcsGiftBtn');
    if(pg){
      pg.hidden=!r.giftEligible;
      if(r.giftEligible){
        pg.textContent=state.giftId?'🎁 赠品已选✓':'🎁 领赠品 · 已解锁';
        pg.classList.toggle('picked',!!state.giftId);
        if(justUnlocked){ pg.classList.remove('pulse'); void pg.offsetWidth; pg.classList.add('pulse'); }
      }
    }
  }

  // 右侧完整明细：默认收起为一行，点"展开明细"看小计/折扣/应付
  if(box){
    let html='<button class="ps-summary" onclick="togglePromoDetail()"><span class="pss-left"><svg class="ic"><use href="#i-gift"/></svg> 优惠自动算好了'+(r.appliedDiscount?` · ${esc(r.appliedDiscount.label)}`:'')+'</span><span class="pss-right num">应付 ¥'+r.payableYuan+' <span class="pss-arrow">'+(promoDetailOpen?'收起 ⌃':'明细 ⌄')+'</span></span></button>';
    if(promoDetailOpen){
      html+='<div class="ps-detail">';
      html+=`<div class="calc-line"><span class="cl-label">商品小计（${r.qty}件）</span><span class="cl-val num">¥${r.subtotalYuan}</span></div>`;
      if(r.appliedDiscount) html+=`<div class="calc-line discount"><span class="cl-label">${esc(r.appliedDiscount.label)}</span><span class="cl-val num">-¥${r.discountYuan}</span></div>`;
      html+=`<div class="calc-total"><span class="ct-label">应付（已取整）</span><span class="ct-val num">¥${r.payableYuan}</span></div>`;
      if(r.giftEligible){
        html+=`<div class="gift-picked"><svg class="ic" style="width:16px;height:16px"><use href="#i-gift"/></svg> `;
        html+= state.giftId ? `赠品：${esc(r.gift?r.gift.name:'已选')} <button class="link-btn" onclick="openGift()">更换</button>` : `已达满赠！<button class="link-btn" onclick="openGift()">点这选 1 份赠品</button>`;
        html+='</div>';
      } else if(SITE.promo&&SITE.promo.gift&&SITE.promo.gift.enabled){
        html+=`<div class="promo-rule">再买够 ¥${(SITE.promo.gift.threshold||0)} 可送 1 份赠品</div>`;
      }
      html+='</div>';
    }
    box.innerHTML=html; box.hidden=false;
  }
}

/* ---------- 首页满赠福利横幅 + 展示弹窗 ---------- */
function giftPool(){ return (SITE.promo&&SITE.promo.gift&&SITE.promo.gift.pool)||[]; }
function giftOn(){ return !!(SITE.promo&&SITE.promo.gift&&SITE.promo.gift.enabled); }
function renderGiftBanner(){
  const box=document.getElementById('giftBanner'); if(!box) return;
  const pool=giftPool().filter(g=>Number(g.qty)>0);
  if(!giftOn()||!pool.length){ box.hidden=true; return; }
  const th=(SITE.promo.gift.threshold)||0;
  setText('giftBannerTitle', `满 ¥${th} 送 1 份赠品`);
  setText('giftBannerSub', `可挑 1 款 · ${pool.length} 种赠品任选，点这里看大图`);
  const thumbs=document.getElementById('giftBannerThumbs');
  if(thumbs) thumbs.innerHTML=pool.slice(0,4).map(g=>`<img src="${imgUrl(g.img||'')}" alt="" onerror="imgErr(this)">`).join('');
  box.hidden=false;
}
/* ---------- 免费壁纸福利（独立于赠品，赠品关闭时仍显示） ---------- */
function welfareCfg(){ return SITE.welfare||{}; }
function welfareOn(){ const w=welfareCfg(); return w.enabled!==false && !!w.link; }
function renderWallpaperBanner(){
  const box=document.getElementById('wallpaperBanner'); if(!box) return;
  const w=welfareCfg();
  if(!welfareOn()){ box.hidden=true; return; }
  setText('wallpaperTitle', w.title||'免费壁纸');
  setText('wallpaperSub', w.sub||'高清男角色 · 自取');
  box.hidden=false;
}
function openWallpaper(){
  const w=welfareCfg();
  setText('wallpaperModalTitle', w.modalTitle||'高清男角色壁纸 · 免费领取');
  setText('wallpaperSub2', w.modalSub||'不用下单，复制下面的链接保存即可');
  setText('wallpaperLink', w.link||'');
  setText('wallpaperCode', w.pwd||'');
  setText('wallpaperQq', SITE.qq||'3998694209');
  openModal('wallpaperModal');
}
async function copyToClipboard(text, okMsg){
  try{ await navigator.clipboard.writeText(text); }
  catch(e){ const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta); }
  toast(okMsg);
}
function copyWpLink(){ const w=welfareCfg(); copyToClipboard(w.link||'', '网盘链接已复制，打开百度网盘 App 就能保存～'); }
function copyWpCode(){ const w=welfareCfg(); copyToClipboard(w.pwd||'', '提取码 '+(w.pwd||'')+' 已复制～'); }

function openGiftShow(){
  const pool=giftPool();
  const th=(SITE.promo&&SITE.promo.gift&&SITE.promo.gift.threshold)||0;
  setText('giftShowRule', `买够 ¥${th}，赠品免费送 1 份（只能挑 1 款）`);
  const list=document.getElementById('giftShowList');
  const gp=giftPool(); window.__giftImgs=gp.filter(g=>g.img).map(g=>g.img);
  if(list) list.innerHTML=gp.map(g=>`
    <div class="giftshow-item${Number(g.qty)<=0?' out':''}">
      <div class="gs-img" onclick="openGiftImage('${esc(g.id)}')"><img src="${imgUrl(g.img||'')}" alt="" onerror="imgErr(this)"></div>
      <div class="gs-name">${esc(g.name)}</div>
      <div class="gs-qty">${Number(g.qty)>0?'剩 '+g.qty+' 份':'已送完'}</div>
    </div>
  `).join('')||'<p class="hint">赠品准备中，敬请期待～</p>';
  openModal('giftShowModal');
}

/* ---------- 赠品自选 ---------- */
function openGift(from){
  orderSource = from || (document.getElementById('view-fav') && !document.getElementById('view-fav').hidden ? 'fav' : 'detail');
  const r=currentOrder(); if(!r.giftEligible){ toast('还没达到赠品门槛哦'); return; }
  const pool=(SITE.promo&&SITE.promo.gift&&SITE.promo.gift.pool)||[];
  const list=document.getElementById('giftList');
  window.__giftImgs=pool.filter(g=>g.img).map(g=>g.img);
  list.innerHTML=pool.map(g=>`
    <div class="gift-item${String(state.giftId)===String(g.id)?' sel':''}${Number(g.qty)<=0?' out':''}" onclick="${Number(g.qty)>0?`pickGift('${g.id}')`:''}">
      <img class="gift-thumb" src="${imgUrl(g.img||'')}" alt="" onerror="imgErr(this)" onclick="openGiftImage('${esc(g.id)}')">
      <span class="gi-name">${esc(g.name)}</span>
      <span class="gi-qty">${Number(g.qty)>0?'剩 '+g.qty:'已送完'}</span>
    </div>
  `).join('');
  document.getElementById('giftConfirm').disabled=!state.giftId;
  openModal('giftModal');
}
function pickGift(id){ state.giftId=id; openGift(orderSource); }
function confirmGift(){
  closeModal('giftModal');
  if(orderSource==='fav'){ updateFavSettle(); }
  else { renderPromoStrip(); }
  toast('赠品已选好');
}
/* 赠品图看大图：按id在图片数组里定位，可左右滑动对比所有赠品 */
function openGiftImage(id){
  const pool=giftPool();
  const imgs=pool.filter(g=>g.img).map(g=>g.img);
  const idx=pool.filter(g=>g.img).findIndex(g=>String(g.id)===String(id));
  closeModal('giftModal'); closeModal('giftShowModal');
  openLightbox(imgs, idx<0?0:idx);
}

function favCurrent(){
  const p=PRODUCTS.find(x=>x.id===state.detailId); if(!p) return;
  // 选了几个就收藏几个：未收藏的规格全部加入；若已全部收藏则全部移除
  let idxs=state.selectedSpecs.size?[...state.selectedSpecs]:[0];
  idxs=idxs.map(i=>Math.min(i,Math.max(0,p.specs.length-1)));
  const allFaved=idxs.every(i=>isFaved(p.id,i));
  if(allFaved){
    idxs.forEach(i=>{ const k=favKey(p.id,i); const j=FAVS.findIndex(f=>f.key===k); if(j>=0)FAVS.splice(j,1); });
    toast(idxs.length>1?`已取消收藏 ${idxs.length} 款`:'已取消收藏');
  }else{
    let added=0;
    for(const i of idxs){
      const k=favKey(p.id,i);
      if(FAVS.some(f=>f.key===k))continue;
      const s=p.specs[i];
      FAVS.push({ key:k, pid:p.id, specIdx:i, title:p.title, cover:p.cover,
        price:s?s.price:p.price, specName:s?s.name:'默认款',
        specImg:resolveSpecImg(p,s), time:Date.now() });
      added++;
    }
    toast(added?`已收藏 ${added} 款，去「我的收藏」找得到～`:'这几款已经在收藏里啦');
  }
  saveFavs();
  updateFavBtn();
}
function updateFavBtn(){
  const p=PRODUCTS.find(x=>x.id===state.detailId); if(!p) return;
  let idxs=state.selectedSpecs.size?[...state.selectedSpecs]:[0];
  idxs=idxs.map(i=>Math.min(i,Math.max(0,p.specs.length-1)));
  const favedCnt=idxs.filter(i=>isFaved(p.id,i)).length;
  const on=favedCnt===idxs.length && idxs.length>0;
  ['favBtn','favBtnM'].forEach(id=>{
    const b=document.getElementById(id); if(!b)return;
    b.classList.toggle('on',on);
    if(id==='favBtn'){ const s=b.querySelector('span'); if(s)s.textContent=on?(favedCnt>1?`已收藏${favedCnt}款`:'已收藏'):'收藏'; }
  });
}

/* ---------- 图片加载（canvas 用，带跨域） ---------- */
function loadImg(url){
  return new Promise((res,rej)=>{
    const im=new Image();
    im.crossOrigin='anonymous';
    im.onload=()=>res(im);
    im.onerror=()=>{
      // 新域名失败 -> 用实际请求的 URL（含版本号）回退旧域名再试一次
      const fb=imgFallback(im.src);
      if(fb){
        const im2=new Image(); im2.crossOrigin='anonymous';
        im2.onload=()=>res(im2); im2.onerror=()=>rej(new Error('img fail'));
        im2.src=fb;
      }else rej(new Error('img fail'));
    };
    im.src=imgUrl(url);
  });
}
function wrapText(ctx,text,x,y,maxW,lineH,maxLines){
  const chars=[...(text||'')]; let line='',lines=[];
  for(const ch of chars){
    if(ctx.measureText(line+ch).width>maxW && line){ lines.push(line); line=ch; }
    else line+=ch;
  }
  if(line)lines.push(line);
  if(maxLines&&lines.length>maxLines){ lines=lines.slice(0,maxLines); lines[maxLines-1]=lines[maxLines-1].slice(0,-1)+'…'; }
  lines.forEach((l,i)=>ctx.fillText(l,x,y+i*lineH));
  return lines.length*lineH;
}
/* 限宽绘制文字：超出 maxW 时自动缩小字号，保证绝不越界压到二维码/画布外 */
function fitText(ctx,text,x,y,maxW,fontPx,bold,color){
  let px=fontPx;
  do{
    ctx.font=(bold?'bold ':'')+px+'px sans-serif';
    if(ctx.measureText(text).width<=maxW) break;
    px-=1;
  }while(px>11);
  if(color)ctx.fillStyle=color;
  ctx.fillText(text,x,y);
  return px;
}
function roundRect(ctx,x,y,w,h,r){
  ctx.beginPath(); ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
}
async function tryDrawImg(ctx,url,x,y,w,h,cover){
  try{
    const im=await loadImg(url);
    if(cover){ const s=Math.min(im.width,im.height); ctx.drawImage(im,(im.width-s)/2,(im.height-s)/2,s,s,x,y,w,h); }
    else ctx.drawImage(im,x,y,w,h);
  }catch(e){ ctx.fillStyle='#EEEBFB'; ctx.fillRect(x,y,w,h); }
}

/* ---------- 咨询海报（当前商品选中的规格） ---------- */
async function drawPoster(items, order){
  const W=720, pad=36, headerH=140, itemH=210, footH=300;
  const H=headerH+items.length*itemH+footH;
  const c=document.createElement('canvas'); c.width=W; c.height=H;
  const ctx=c.getContext('2d');
  const g=ctx.createLinearGradient(0,0,0,H); g.addColorStop(0,'#F3F0FD'); g.addColorStop(1,'#FFFFFF');
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  ctx.fillStyle='#5B4BC4'; ctx.fillRect(0,0,W,headerH);
  ctx.fillStyle='#fff'; ctx.font='bold 40px sans-serif'; ctx.fillText(SITE.shopName||'墨鱼铺子',pad,70);
  ctx.font='24px sans-serif'; ctx.fillText('我想咨询这几款（见图选规格）',pad,116);
  let y=headerH+22;
  for(const it of items){
    ctx.fillStyle='#fff'; roundRect(ctx,pad-8,y-8,W-2*pad+16,itemH-16,16); ctx.fill();
    await tryDrawImg(ctx,it.img,pad,y,180,180,true);
    ctx.strokeStyle='#ECE9F2'; ctx.lineWidth=1; ctx.strokeRect(pad,y,180,180);
    const tx=pad+196;
    ctx.fillStyle='#26233A'; ctx.font='bold 23px sans-serif'; wrapText(ctx,it.name,tx,y+34,W-pad-tx-16,31,4);
    ctx.fillStyle='#E23E58'; ctx.font='bold 36px sans-serif'; ctx.fillText('¥'+it.price,tx,y+170);
    y+=itemH;
  }
  // 底部：金额明细 + QQ + 二维码（左右分栏：右侧固定留给二维码，左侧文字严格限宽）
  const by=H-footH+8;
  ctx.fillStyle='#fff'; roundRect(ctx,pad-8,by,W-2*pad+16,footH-24,16); ctx.fill();
  const qrX=W-pad-190, textMaxW=(qrX-16)-pad; // 文字最多画到二维码左侧再留16px，绝不重叠
  fitText(ctx,'把这图发QQ给店主，说"图里这些我要"',pad,by+40,textMaxW,23,true,'#26233A');
  if(order){
    fitText(ctx,'商品小计 ¥'+order.subtotalYuan+(order.appliedDiscount?' · '+order.appliedDiscount.label+' -¥'+order.discountYuan:''),pad,by+80,textMaxW,20,false,'#7C7791');
    fitText(ctx,'应付 ¥'+order.payableYuan,pad,by+126,textMaxW,36,true,'#E23E58');
    // 赠品标题单独一行、限宽自动换行（最多2行），彻底解决长名字展示不全/不换行被截断的问题
    if(order.giftEligible){
      const giftTxt=order.gift ? ('含赠品：'+order.gift.name) : '已达满赠 · 可任选 1 份赠品';
      ctx.font='bold 19px sans-serif'; ctx.fillStyle='#C2356B';
      wrapText(ctx,giftTxt,pad,by+166,textMaxW,25,2);
    }
  }
  fitText(ctx,'QQ：'+(SITE.qq||'3998694209'),pad,by+224,textMaxW,32,true,'#5B4BC4');
  if(SITE.qr){ await tryDrawImg(ctx,SITE.qr,qrX,by+20,190,190,false); }
  fitText(ctx,'（截图发我，我按图上的款式和规格回复你）',pad,by+258,textMaxW,17,false,'#7C7791');
  return c.toDataURL('image/png');
}
async function genPoster(){
  const p=PRODUCTS.find(x=>x.id===state.detailId); if(!p) return;
  const idxs=[...state.selectedSpecs]; if(!idxs.length){ toast('先选一个款式哦～'); return; }
  // 咨询图：该规格显示图就带自己的图；关了图/无图的规格才用主图替代（仅长图兜底）
  const mainImg=(p.images[0]||p.cover||'').replace('/thumb/','/full/');
  const items=idxs.map(i=>{ const s=p.specs[i]; const pic=specShowImg(s,p)?s.img:mainImg; return { img:pic, name:s.name, price:s.price }; });
  toast('正在生成图片…');
  try{
    const url=await drawPoster(items, currentOrder());
    posterPages=[url]; posterIdx=0; showPoster();
  }catch(e){ console.error(e); toast('图片生成失败，请重试'); }
}

/* ---------- 收藏长图（分页） ---------- */
async function drawLongPoster(items, pageNo, totalPage, order, totalCount){
  const W=720,pad=30,headerH=130,itemH=190,footH=300;
  const H=headerH+items.length*itemH+footH;
  const c=document.createElement('canvas'); c.width=W;c.height=H;
  const ctx=c.getContext('2d');
  const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,'#F3F0FD');g.addColorStop(1,'#fff');
  ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  ctx.fillStyle='#5B4BC4';ctx.fillRect(0,0,W,headerH);
  ctx.fillStyle='#fff';ctx.font='bold 36px sans-serif';ctx.fillText(SITE.shopName||'墨鱼铺子',pad,62);
  ctx.font='22px sans-serif';ctx.fillText(`我想要的这些（第${pageNo}/${totalPage}张）`,pad,104);
  let y=headerH+18;
  for(const it of items){
    ctx.fillStyle='#fff';roundRect(ctx,pad-6,y-6,W-2*pad+12,itemH-12,14);ctx.fill();
    // 有规格图直接当主图显示，没有才用商品主图兜底
    await tryDrawImg(ctx,it.specImg||it.cover,pad,y,142,142,true);
    const tx=pad+160;
    ctx.fillStyle='#26233A';ctx.font='bold 21px sans-serif';wrapText(ctx,it.title,tx,y+32,W-pad-tx-10,28,2);
    ctx.fillStyle='#5B4BC4';ctx.font='18px sans-serif';wrapText(ctx,'规格：'+it.specName,tx,y+96,W-pad-tx-10,24,2);
    ctx.fillStyle='#E23E58';ctx.font='bold 30px sans-serif';ctx.fillText('¥'+it.price,tx,y+160);
    y+=itemH;
  }
  const by=H-footH+14;
  ctx.fillStyle='#fff';roundRect(ctx,pad-6,by,W-2*pad+12,footH-20,14);ctx.fill();
  // 左右分栏：左侧文字区固定宽度，右侧留给二维码，两者绝不重叠
  const qrX=W-pad-150, textMaxW=(qrX-16)-pad; // 文字最多画到二维码左侧再留16px
  fitText(ctx,'把这几张图发QQ给店主，说"图里这些我都要"',pad,by+40,textMaxW,23,true,'#26233A');
  // 真实金额明细（每页同一份合计）—— 各行独立、限宽，杜绝大字长串越界
  if(order){
    ctx.fillStyle='#7C7791';ctx.font='20px sans-serif';
    fitText(ctx,'共 '+(totalCount||items.length)+' 件 · 商品小计 ¥'+order.subtotalYuan+(order.appliedDiscount?' · '+order.appliedDiscount.label+' -¥'+order.discountYuan:''),pad,by+82,textMaxW,20,false,'#7C7791');
    fitText(ctx,'应付总价 ¥'+order.payableYuan,pad,by+134,textMaxW,42,true,'#E23E58');
    if(order.giftEligible){
      // 买家已选赠品则显示其真实标题；仅达标未选则提示去选。限宽换行，展示完整不截断
      const giftTxt = order.gift ? ('已选赠品：'+order.gift.name) : '已达满赠 · 可任选 1 份赠品';
      ctx.font='bold 19px sans-serif'; ctx.fillStyle='#C2356B';
      wrapText(ctx,giftTxt,pad,by+170,textMaxW,25,2);
    }
  }
  fitText(ctx,'QQ：'+(SITE.qq||'3998694209'),pad,by+216,textMaxW,34,true,'#5B4BC4');
  if(SITE.qr){ await tryDrawImg(ctx,SITE.qr,qrX,by+30,150,150,false); }
  return c.toDataURL('image/png');
}

/* ---------- 收藏页 ---------- */
let favSelected=new Set();
function showFav(){
  document.getElementById('view-home').hidden=true;
  document.getElementById('view-detail').hidden=true;
  const ab=document.querySelector('.detail-actionbar'); if(ab)ab.hidden=true;
  const v=document.getElementById('view-fav'); v.hidden=false; setActiveTab('fav');
  favSelected=new Set(); renderFav(); window.scrollTo(0,0);
}
function renderFav(){
  const v=document.getElementById('view-fav');
  if(!FAVS.length){
    v.innerHTML=`<div class="fav-wrap"><button class="btn-back" onclick="goHome()"><svg class="ic"><use href="#i-back"/></svg> 返回商品列表</button>
      <div class="fav-empty"><div class="es-emoji">☆</div><p>还没收藏？看到喜欢的点一下收藏，<br>以后能一键导成长图发店主～</p><button class="btn-soft" onclick="goHome()">去逛逛</button></div></div>`;
    return;
  }
  const items=FAVS.map(f=>`
    <div class="fav-item${favSelected.has(f.key)?' sel':''}">
      <input type="checkbox" ${favSelected.has(f.key)?'checked':''} onchange="toggleFavSel('${f.key}',this.checked)">
      <img class="fi-thumb" src="${imgUrl(f.specImg||f.cover)}" alt="" loading="lazy" onerror="imgErr(this)">
      <div class="fi-info" onclick="location.hash='#/product/'+${f.pid}">
        <div class="fi-title">${esc(f.title)}</div>
        <div class="fi-spec">规格：${esc(f.specName)}</div>
        <div class="fi-price num">¥${f.price}</div>
      </div>
      <button class="fi-del" onclick="toggleFav(${f.pid},${f.specIdx});" title="删除">×</button>
    </div>
  `).join('');
  v.innerHTML=`<div class="fav-wrap">
    <button class="btn-back" onclick="goHome()"><svg class="ic"><use href="#i-back"/></svg> 返回商品列表</button>
    <div class="fav-head"><h2>我的收藏（${FAVS.length}）</h2></div>
    <div class="fav-tip">看中哪些就打勾，价格和赠品会自动算在下面，点「生成咨询长图」保存后发 QQ 给店主就行～</div>
    <div class="fav-toolbar">
      <label><input type="checkbox" id="favAll" onchange="toggleFavAll(this.checked)"> 全选</label>
      <span class="fav-count" id="favSelCount">已选 ${favSelected.size} 件</span>
      <span class="fav-hint-inline">满 ¥50 自动送赠品</span>
    </div>
    <div class="fav-list">${items}</div>
  </div>
  <div class="fav-settle" id="favSettle">
    <div class="fs-price-wrap">
      <span class="fs-label" id="fsLabel">未选商品</span>
      <span class="fs-price num" id="fsPrice">¥0</span>
      <span class="fs-sub" id="fsSub"></span>
    </div>
    <div class="fs-actions">
      <button class="btn-giftbar" id="favGiftBtn" hidden onclick="openGift('fav')">🎁 选赠品</button>
      <button class="btn-gen-long" id="genLongBtn" disabled onclick="genLongPoster()">生成咨询长图</button>
    </div>
  </div>`;
  updateFavSettle();
}
function toggleFavSel(key,checked){
  if(checked)favSelected.add(key);else favSelected.delete(key);
  const el=[...document.querySelectorAll('.fav-item')].find(it=>it.querySelector('input')?.getAttribute('onchange')?.includes(key));
  if(el)el.classList.toggle('sel',checked);
  updateFavSelUI();
}
function updateFavSelUI(){
  const c=document.getElementById('favSelCount');if(c)c.textContent=`已选 ${favSelected.size} 件`;
  const all=document.getElementById('favAll');if(all)all.checked=favSelected.size===FAVS.length;
  updateFavSettle();
}
/* 收藏页底部结算条：选中项真实应付价 + 满赠入口 + 生成按钮 */
function updateFavSettle(){
  const items=favSelectedItems();
  const r=CALC.calcOrder(items, SITE.promo||{}, state.giftId);
  const label=document.getElementById('fsLabel');
  const price=document.getElementById('fsPrice');
  const sub=document.getElementById('fsSub');
  const giftBtn=document.getElementById('favGiftBtn');
  const genBtn=document.getElementById('genLongBtn');
  if(!price) return; // 收藏页未渲染
  if(!items.length){
    if(label)label.textContent='未选商品';
    price.textContent='¥0';
    if(sub)sub.textContent='勾选款式后自动算总价';
    if(giftBtn)giftBtn.hidden=true;
    if(genBtn)genBtn.disabled=true;
    return;
  }
  if(label)label.textContent=`已选 ${r.qty} 件 · 应付`;
  price.textContent='¥'+r.payableYuan;
  if(sub){
    const parts=[];
    if(r.appliedDiscount) parts.push(r.appliedDiscount.label+' -¥'+r.discountYuan);
    if(r.giftEligible) parts.push(state.giftId?'🎁 赠品已选':'🎁 已达满赠');
    sub.textContent=parts.length?parts.join(' · '):`小计 ¥${r.subtotalYuan}`;
  }
  if(giftBtn){
    giftBtn.hidden=!r.giftEligible;
    if(r.giftEligible){
      giftBtn.textContent=state.giftId?'🎁 赠品已选✓':'🎁 选赠品';
      giftBtn.classList.toggle('picked',!!state.giftId);
    }
  }
  if(genBtn)genBtn.disabled=false;
}
function toggleFavAll(checked){
  if(checked)FAVS.forEach(f=>favSelected.add(f.key));else favSelected.clear();
  document.querySelectorAll('.fav-item').forEach(it=>{
    it.classList.toggle('sel',checked);const cb=it.querySelector('input[type=checkbox]');if(cb)cb.checked=checked;
  });
  updateFavSelUI();
}
async function genLongPoster(){
  const sel=FAVS.filter(f=>favSelected.has(f.key));if(!sel.length){toast('先勾选想咨询的款式');return;}
  toast('正在生成长图…');
  try{
    // 用Calc按勾选的收藏项算真实金额（含优惠/门槛/所选赠品），每页标同一份，避免只发一页时对不上
    const order=CALC.calcOrder(sel.map(f=>({price:f.price,qty:1})), SITE.promo||{}, state.giftId);
    const PER=6,pages=Math.ceil(sel.length/PER);
    posterPages=[];
    for(let i=0;i<pages;i++) posterPages.push(await drawLongPoster(sel.slice(i*PER,(i+1)*PER),i+1,pages,order,sel.length));
    posterIdx=0;showPoster();
  }catch(e){console.error(e);toast('长图生成失败，请重试');}
}

/* ---------- 海报弹窗 ---------- */
function showPoster(){
  document.getElementById('posterImg').src=posterPages[posterIdx];
  const multi=posterPages.length>1;
  const nav=document.getElementById('posterNav'); if(nav)nav.hidden=!multi;
  setText('posterPageInfo',`${posterIdx+1} / ${posterPages.length}`);
  const tip=document.getElementById('posterTip');
  if(tip)tip.textContent=multi?`共 ${posterPages.length} 张，逐张保存后一起发 QQ`:'保存后发 QQ 给店主，一句"我要图里这些"就行～';
  openModal('posterModal');
}
function posterPage(d){
  posterIdx=Math.max(0,Math.min(posterPages.length-1,posterIdx+d));showPoster();
}

/* ---------- 弹层 / 工具 ---------- */
function openModal(id){ const el=document.getElementById(id); if(el)el.hidden=false; document.body.style.overflow='hidden'; }
function closeModal(id){ const el=document.getElementById(id); if(el)el.hidden=true; document.body.style.overflow=''; }
function openQQ(){ openModal('qqModal'); }
/* 选包指南：按 SITE.catGuide 渲染四类说明 */
const CAT_GUIDE_FALLBACK={
  '角色包':'挑一个角色，内容是这个角色的多种画风图 + 视频/动图。适合认准某个人物、不挑画风的买家。',
  '画师包':'挑一个画师，画风固定统一，但画里的人物是混搭的、不能指定。适合喜欢某位画师风格的买家。',
  '3d动作包':'挑一个画师，内容是这个画师风格的 3D/2D 建模视频或动图（会动的）。',
  '本子':'挑一个本子，内容是有剧情、有文字的漫画，默认中外文字混合。'
};
/* 新手选购指南：公告栏点击打开，内容后台可编辑（占位 {qq} 自动替换为店铺 QQ） */
function openBuyGuide(){
  const g=SITE.buyGuide||{};
  const qq=SITE.qq||'3998694209';
  const fill=t=>esc(String(t==null?'':t)).replace(/\{qq\}/g, esc(qq));
  setText('buyGuideTitle', g.title||'新手怎么买？3 步搞定');
  setText('buyGuideSub', g.sub||'照着做，下单不求人');
  const box=document.getElementById('buyGuideList');
  if(box){
    const steps=Array.isArray(g.steps)?g.steps:[];
    box.innerHTML=steps.map((s,i)=>`<div class="bg-item"><span class="bg-num">${i+1}</span><div class="bg-body"><strong>${fill(s.name)}</strong><span>${fill(s.desc)}</span></div></div>`).join('');
  }
  openModal('buyGuideModal');
}
function openCatGuide(){
  const guide=SITE.catGuide||CAT_GUIDE_FALLBACK;
  const tips=SITE.specTip||{};
  const cats=(SITE.cats||[]).filter(c=>c!=='全部'&&guide[c]);
  const box=document.getElementById('guideList');
  if(box) box.innerHTML=cats.map(c=>`<div class="guide-item"><span class="gi-badge">${c}</span><span class="gi-desc">${esc(guide[c])}${tips[c]?`<div class="gi-tip">规格数字：${esc(tips[c])}</div>`:''}</span></div>`).join('');
  // 标题里的类别数按实际分类动态生成，不再写死"四种"
  const cnNum=['零','一','两','三','四','五','六','七','八','九','十'];
  const n=cats.length; const label=n<=10?cnNum[n]:String(n);
  setText('guideTitle', `${label}种包，怎么挑？`);
  setText('guideBarSub', `${label}种包的区别，点这里一句话看懂`);
  openModal('catGuideModal');
}
async function copyQQ(){
  const qq=SITE.qq||'3998694209';
  try{ await navigator.clipboard.writeText(qq); }
  catch(e){ const ta=document.createElement('textarea');ta.value=qq;document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta); }
  toast('QQ号已复制，去 QQ 粘贴添加就好～');
}
function openUnzip(){
  unzipKind='pc';
  const img=document.getElementById('unzipImg'); if(img){ img.src=imgUrl((SITE.unzip&&SITE.unzip.pc)||''); img.onerror=function(){ const fb=imgFallback(this.src); if(fb){this.onerror=null;this.src=fb;} }; }
  const a=document.getElementById('utabPc'),b=document.getElementById('utabMobile');
  if(a)a.classList.add('active');if(b)b.classList.remove('active');
  openModal('unzipModal');
}
function switchUnzip(t){
  unzipKind=t;
  const img=document.getElementById('unzipImg'); if(img){ img.src=imgUrl((SITE.unzip&&SITE.unzip[t])||''); img.onerror=function(){ const fb=imgFallback(this.src); if(fb){this.onerror=null;this.src=fb;} }; }
  document.getElementById('utabPc').classList.toggle('active',t==='pc');
  document.getElementById('utabMobile').classList.toggle('active',t==='mobile');
}
function saveUnzip(){ saveImage((SITE.unzip&&SITE.unzip[unzipKind])||'', '解压教程-'+unzipKind); }
function saveImage(url,name){
  if(!url){ toast('图片地址为空'); return; }
  const a=document.createElement('a');a.href=url;a.download=name;a.target='_blank';
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  toast('已开始保存（手机若未下载，可长按图片保存到相册）');
}
function savePoster(){
  if(!posterPages.length)return;
  const a=document.createElement('a');a.href=posterPages[posterIdx];a.download='咨询图_'+(posterIdx+1)+'.png';
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  toast('已下载（手机请长按图片存相册）');
}
/* ---------- 全屏灯箱：图片数组 + 索引，支持左右切换/手势/键盘 ---------- */
let lbList=[], lbIdx=0;
function openLightbox(list, startIdx){
  const src = Array.isArray(list) ? list : [list];
  lbList = src.filter(Boolean);
  if(!lbList.length) return;
  lbIdx = Math.max(0, Math.min(lbList.length-1, startIdx||0));
  const l=document.getElementById('lightbox'); if(l) l.hidden=false;
  document.body.style.overflow='hidden';
  renderLightbox();
}
function renderLightbox(){
  const i=document.getElementById('lbImg');
  if(i && lbList[lbIdx]){
    i.src=imgUrl(lbList[lbIdx]); i.dataset.imgFb='';
    i.onerror=function(){ const fb=imgFallback(this.src); if(fb){this.onerror=null;this.src=fb;} };
  }
  const multi=lbList.length>1;
  const c=document.getElementById('lbCounter');
  if(c){ c.hidden=!multi; if(multi) c.textContent=(lbIdx+1)+' / '+lbList.length; }
  const hint=document.getElementById('lbHint'); if(hint) hint.hidden=!multi;
  const prev=document.getElementById('lbPrev'), next=document.getElementById('lbNext');
  if(prev) prev.style.display=multi?'flex':'none';
  if(next) next.style.display=multi?'flex':'none';
}
function lbStep(d){ if(lbList.length<2) return; lbIdx=(lbIdx+d+lbList.length)%lbList.length; renderLightbox(); }
function closeLightbox(){ const l=document.getElementById('lightbox');if(l)l.hidden=true; document.body.style.overflow=''; }
/* 手势：左右滑切换、下滑关闭；绑定到灯箱容器，图片本身不拦截 */
(function bindLightboxGesture(){
  let sx=0, sy=0, moved=false;
  const el=document.getElementById('lightbox');
  if(!el) return;
  el.addEventListener('touchstart',e=>{ if(e.touches.length!==1)return; sx=e.touches[0].clientX; sy=e.touches[0].clientY; moved=false; },{passive:true});
  el.addEventListener('touchmove',e=>{ if(e.touches.length!==1)return; const dx=Math.abs(e.touches[0].clientX-sx), dy=Math.abs(e.touches[0].clientY-sy); if(dx>18||dy>18)moved=true; },{passive:true});
  el.addEventListener('touchend',e=>{
    if(moved && e.changedTouches.length){
      const dx=e.changedTouches[0].clientX-sx, dy=e.changedTouches[0].clientY-sy;
      if(Math.abs(dy)>90 && Math.abs(dy)>Math.abs(dx)) closeLightbox();
      else if(Math.abs(dx)>45 && Math.abs(dx)>Math.abs(dy)) lbStep(dx<0?1:-1);
    }
  },{passive:true});
})();
let toastTimer=null;
function toast(msg){
  const el=document.getElementById('toast');if(!el)return;
  el.textContent=msg;el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.hidden=true,2300);
}
function esc(s){ return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function imgErr(el){
  // 新域名加载失败 -> 自动切回旧域名重试一次；仍失败才置灰
  if(el.dataset.imgFb!=='1'){
    const cur=el.getAttribute('src')||'';
    const fb=imgFallback(cur);
    if(fb){ el.dataset.imgFb='1'; el.src=fb; return; }
  }
  el.style.opacity='.25';
}

document.addEventListener('keydown',e=>{
  const lb=document.getElementById('lightbox');
  if(lb && !lb.hidden){
    if(e.key==='Escape'){ closeLightbox(); return; }
    if(e.key==='ArrowLeft'){ e.preventDefault(); lbStep(-1); return; }
    if(e.key==='ArrowRight'){ e.preventDefault(); lbStep(1); return; }
  }
  if(e.key==='Escape'){
    ['qqModal','unzipModal','posterModal','giftModal','catGuideModal','giftShowModal','wallpaperModal'].forEach(id=>{const el=document.getElementById(id);if(el&&!el.hidden)closeModal(id);});
  }
});

init();
