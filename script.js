async function safeGet(key){
  try{ const r = await window.storage.get(key, false); return r ? r.value : null; }
  catch(e){ return null; }
}
async function safeSet(key, value){
  try{ return await window.storage.set(key, value, false); }
  catch(e){ console.error('storage set failed', e); return null; }
}
async function safeDelete(key){
  try{ return await window.storage.delete(key, false); }
  catch(e){ return null; }
}

let images = []; // {id, url, caption, tags:[], favorite, addedAt}
let activeTag = 'All';
let favOnly = false;
let searchTerm = '';
let lightboxList = [];
let lightboxIndex = 0;

const SEED = [
  { url:"https://picsum.photos/id/1015/900/1200", caption:"River Bend at Dusk", tags:["landscape","river"] },
  { url:"https://picsum.photos/id/1043/1200/800", caption:"Wildflower Field", tags:["nature","summer"] },
  { url:"https://picsum.photos/id/1025/900/900", caption:"A Quiet Companion", tags:["animals","portrait"] },
  { url:"https://picsum.photos/id/1039/900/1300", caption:"Alpine Ridge", tags:["mountains","landscape"] },
  { url:"https://picsum.photos/id/1062/1200/850", caption:"Coastal Morning", tags:["ocean","sunrise"] },
  { url:"https://picsum.photos/id/1074/900/1100", caption:"Forest Path", tags:["forest","green"] },
];

async function loadImages(){
  const idxRaw = await safeGet('gallery:index');
  let ids = idxRaw ? JSON.parse(idxRaw) : null;
  if(!ids){
    // first run: seed the wall
    ids = [];
    for(const s of SEED){
      const id = 'img_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);
      const obj = { id, url:s.url, caption:s.caption, tags:s.tags, favorite:false, addedAt:Date.now() };
      await safeSet(`gallery:${id}`, JSON.stringify(obj));
      ids.push(id);
      images.push(obj);
    }
    await safeSet('gallery:index', JSON.stringify(ids));
  } else {
    for(const id of ids){
      const raw = await safeGet(`gallery:${id}`);
      if(raw){ try{ images.push(JSON.parse(raw)); }catch(e){} }
    }
  }
}
async function persistIndex(){ await safeSet('gallery:index', JSON.stringify(images.map(i=>i.id))); }
async function persistImage(obj){ await safeSet(`gallery:${obj.id}`, JSON.stringify(obj)); }

/* ---------------- Rendering ---------------- */
function allTags(){
  const s = new Set();
  images.forEach(i => i.tags.forEach(t => s.add(t)));
  return Array.from(s).sort();
}

function renderChips(){
  const chips = document.getElementById('chips');
  chips.innerHTML = '';
  const mk = (label, isActive) => {
    const c = document.createElement('button');
    c.className = 'chip' + (isActive ? ' active' : '');
    c.textContent = label;
    c.addEventListener('click', () => { activeTag = label; renderChips(); renderGallery(); });
    return c;
  };
  chips.appendChild(mk('All', activeTag === 'All'));
  allTags().forEach(t => chips.appendChild(mk(t, activeTag === t)));
}

function filteredImages(){
  return images.filter(img => {
    if(favOnly && !img.favorite) return false;
    if(activeTag !== 'All' && !img.tags.includes(activeTag)) return false;
    if(searchTerm){
      const hay = (img.caption + ' ' + img.tags.join(' ')).toLowerCase();
      if(!hay.includes(searchTerm.toLowerCase())) return false;
    }
    return true;
  });
}

function renderGallery(){
  const gallery = document.getElementById('gallery');
  const list = filteredImages();
  gallery.innerHTML = '';
  if(!list.length){
    gallery.innerHTML = `<div class="empty-state">Nothing matches — the wall is waiting for something new.</div>`;
    return;
  }
  list.forEach((img, idx) => {
    const frame = document.createElement('div');
    frame.className = 'frame';
    frame.innerHTML = `
      <div class="mat">
        <img src="${img.url}" alt="${escapeHtml(img.caption)}" loading="lazy"
             onerror="this.parentElement.innerHTML='<div class=\\'broken\\'>Image unavailable</div>'">
      </div>
      <div class="plaque">
        <div>
          <div class="cap">${escapeHtml(img.caption || 'Untitled')}</div>
          <div class="tags">${img.tags.map(escapeHtml).join(' · ')}</div>
        </div>
        <div class="plaque-actions">
          <button class="icon-btn fav ${img.favorite ? 'active' : ''}" title="Favorite">${img.favorite ? '★' : '☆'}</button>
          <button class="icon-btn del" title="Remove">✕</button>
        </div>
      </div>
    `;
    frame.querySelector('.mat').addEventListener('click', () => openLightbox(list, idx));
    frame.querySelector('.fav').addEventListener('click', async (e) => {
      e.stopPropagation();
      img.favorite = !img.favorite;
      await persistImage(img);
      renderGallery();
    });
    frame.querySelector('.del').addEventListener('click', async (e) => {
      e.stopPropagation();
      images = images.filter(i => i.id !== img.id);
      await safeDelete(`gallery:${img.id}`);
      await persistIndex();
      renderChips();
      renderGallery();
    });
    gallery.appendChild(frame);
  });
}

function escapeHtml(str){
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

/* ---------------- Lightbox ---------------- */
function openLightbox(list, idx){
  lightboxList = list;
  lightboxIndex = idx;
  renderLightbox();
  document.getElementById('lightbox').classList.add('open');
}
function closeLightbox(){ document.getElementById('lightbox').classList.remove('open'); }
function renderLightbox(){
  const img = lightboxList[lightboxIndex];
  document.getElementById('lbImg').src = img.url;
  document.getElementById('lbImg').alt = img.caption;
  document.getElementById('lbCap').textContent = img.caption || 'Untitled';
  document.getElementById('lbTags').textContent = img.tags.join(' · ');
  document.getElementById('lbCounter').textContent = `${lightboxIndex+1} of ${lightboxList.length}`;
}
document.getElementById('lbClose').addEventListener('click', closeLightbox);
document.getElementById('lbPrev').addEventListener('click', () => { lightboxIndex = (lightboxIndex - 1 + lightboxList.length) % lightboxList.length; renderLightbox(); });
document.getElementById('lbNext').addEventListener('click', () => { lightboxIndex = (lightboxIndex + 1) % lightboxList.length; renderLightbox(); });
document.getElementById('lightbox').addEventListener('click', (e) => { if(e.target.id === 'lightbox') closeLightbox(); });
document.addEventListener('keydown', (e) => {
  if(!document.getElementById('lightbox').classList.contains('open')) return;
  if(e.key === 'Escape') closeLightbox();
  if(e.key === 'ArrowLeft') document.getElementById('lbPrev').click();
  if(e.key === 'ArrowRight') document.getElementById('lbNext').click();
});

/* ---------------- Toolbar interactions ---------------- */
document.getElementById('searchInput').addEventListener('input', (e) => { searchTerm = e.target.value; renderGallery(); });
document.getElementById('favToggle').addEventListener('click', function(){
  favOnly = !favOnly;
  this.classList.toggle('active', favOnly);
  this.textContent = favOnly ? '★ Favorites' : '☆ Favorites';
  renderGallery();
});
document.getElementById('addToggle').addEventListener('click', () => {
  document.getElementById('addPanel').classList.toggle('open');
});
document.getElementById('cancelAdd').addEventListener('click', () => {
  document.getElementById('addPanel').classList.remove('open');
  clearAddForm();
});

function clearAddForm(){
  document.getElementById('inUrl').value = '';
  document.getElementById('inCaption').value = '';
  document.getElementById('inTags').value = '';
  document.getElementById('inFile').value = '';
  document.getElementById('addHint').textContent = '';
}

function resizeImageFile(file, maxDim=1400){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if(width > maxDim || height > maxDim){
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

document.getElementById('submitAdd').addEventListener('click', async () => {
  const hint = document.getElementById('addHint');
  const urlVal = document.getElementById('inUrl').value.trim();
  const fileVal = document.getElementById('inFile').files[0];
  const caption = document.getElementById('inCaption').value.trim();
  const tags = document.getElementById('inTags').value.split(',').map(t => t.trim()).filter(Boolean);

  if(!urlVal && !fileVal){ hint.textContent = 'Add a URL or choose a file.'; return; }

  let finalUrl = urlVal;
  if(fileVal){
    hint.textContent = 'Preparing image…';
    try{ finalUrl = await resizeImageFile(fileVal); }
    catch(e){ hint.textContent = "Couldn't read that file."; return; }
  }

  const id = 'img_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);
  const obj = { id, url: finalUrl, caption: caption || 'Untitled', tags, favorite:false, addedAt: Date.now() };
  images.unshift(obj);
  const saved = await persistImage(obj);
  if(!saved && fileVal){
    hint.textContent = 'Hung on the wall, but too large to save permanently.';
  } else {
    hint.textContent = '';
  }
  await persistIndex();
  document.getElementById('addPanel').classList.remove('open');
  clearAddForm();
  renderChips();
  renderGallery();
});

/* ---------------- Init ---------------- */
(async function init(){
  await loadImages();
  document.getElementById('statusArea').style.display = 'none';
  document.getElementById('gallery').style.display = 'block';
  renderChips();
  renderGallery();
})();