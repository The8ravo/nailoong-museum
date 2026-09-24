import { loadCatalog, validateCatalog, safeUrl } from './catalog.mjs';
import { notify } from './app.mjs';
import { makeVariants } from './image-tools.mjs';

const form = document.querySelector('#artwork-form');
const status = document.querySelector('#studio-status');
const sidebar = document.querySelector('.studio-list');
const preview = document.querySelector('#image-preview');
const base = document.body.dataset.base;
const databaseName = 'nailoong-museum-studio-v1';
let catalog, db, selectedId = null, pendingImage = null, imageJob = null, previewUrl = null, dirty = false, busy = false;
const field = name => form.elements.namedItem(name);
const setStatus = text => { status.textContent = text; };

function openDb() {
  return new Promise((resolve,reject) => {
    const request = indexedDB.open(databaseName,1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('state');
      request.result.createObjectStore('assets');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('浏览器无法保存草稿，请使用普通浏览窗口并允许本地存储。'));
  });
}
function readStore(store,key) {
  return new Promise((resolve,reject) => {
    const request = db.transaction(store).objectStore(store).get(key);
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
function saveState(nextCatalog, files = []) {
  return new Promise((resolve,reject) => {
    const transaction = db.transaction(['state','assets'],'readwrite');
    transaction.objectStore('state').put(nextCatalog,'catalog');
    files.forEach(file => transaction.objectStore('assets').put(file.blob,file.path));
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(new Error('保存失败，可能是浏览器存储空间不足。请先导出已有草稿。'));
    transaction.onabort = () => reject(new Error('草稿保存被中断，请重试。'));
  });
}
function renderList() {
  sidebar.replaceChildren();
  [...catalog.artworks].sort((a,b)=>a.order-b.order).forEach(art => {
    const button = document.createElement('button'); button.type = 'button';
    button.textContent = `${art.id} · ${art.title}${art.publish?'':'（未展出）'}`;
    button.setAttribute('aria-current',String(art.id===selectedId));
    button.addEventListener('click', () => chooseArtwork(art));
    sidebar.append(button);
  });
}
async function showPreview(image,localBlob) {
  if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
  preview.replaceChildren();
  if (!image && !localBlob) { const text = document.createElement('span'); text.textContent = '图片预览'; text.className='muted'; preview.append(text); return; }
  const img = document.createElement('img'); img.alt = '所选展品图片预览';
  if (localBlob) { previewUrl = URL.createObjectURL(localBlob); img.src=previewUrl; }
  else img.src = base + image.display;
  preview.append(img);
}
async function chooseArtwork(art = null) {
  if (busy || imageJob) { setStatus('请等待图片处理或保存完成。'); return; }
  if (dirty && !confirm('当前修改尚未保存。切换展品会放弃这些修改，继续吗？')) return;
  selectedId = art?.id || null; pendingImage = null; dirty = false; form.reset();
  document.querySelector('#editor-title').textContent = art ? '编辑展品' : '新展品';
  ['title','titleEn','id','slug','section','order','tag','alt','description','notes'].forEach(name => {
    if (art) field(name).value = art[name];
  });
  if (art) {
    field('date').value = art.creation?.date || '';
    field('tool').value = art.creation?.tool || '';
    field('referenceTitle').value = art.reference.title;
    field('referenceUrl').value = art.reference.url || '';
    field('rightsStatus').value = art.source.rightsStatus;
    field('publish').checked = art.publish;
  } else {
    const max = Math.max(16,...catalog.artworks.map(a=>Number(a.id.match(/\d+$/)?.[0]||0)));
    field('id').value = `NL-${String(max+1).padStart(3,'0')}`;
    field('order').value = (Math.max(0,...catalog.artworks.map(a=>a.order)) + 10);
  }
  field('slug').readOnly = Boolean(art); field('id').readOnly = Boolean(art);
  renderList();
  const blob = art ? await readStore('assets',art.image.display) : null;
  await showPreview(art?.image,blob);
  setStatus(art ? '编辑后点击“保存本机草稿”，再导出更新包。' : '选择图片并填写带 * 的栏目。');
}
field('imageFile').addEventListener('change', async () => {
  const file = field('imageFile').files[0]; if (!file) return;
  pendingImage = null; dirty = true; setStatus('正在处理图片，保留原始画幅…');
  field('imageFile').disabled = true;
  imageJob = makeVariants(file);
  try { pendingImage = await imageJob; await showPreview(null,pendingImage.variants.display); setStatus('图片已准备好。保存草稿后会包含在更新包中。'); }
  catch(error) { field('imageFile').value = ''; setStatus(error.message); }
  finally { imageJob = null; field('imageFile').disabled = false; }
});
form.addEventListener('input',()=>{dirty=true;});
async function saveCurrent() {
  if (!form.reportValidity()) return false;
  if (imageJob) { setStatus('图片仍在处理中，请稍后保存。'); return false; }
  const old = catalog.artworks.find(art=>art.id===selectedId);
  if (!old && !pendingImage) { setStatus('请先为新展品选择图片。'); return false; }
  const value = name => field(name).value.trim();
  if (!safeUrl(value('referenceUrl'))) { setStatus('参考链接必须是完整的 HTTPS 网页地址。'); return false; }
  const slug = value('slug'), id = value('id');
  const files = [];
  let image = old?.image;
  if (pendingImage) {
    image = {width:pendingImage.width,height:pendingImage.height};
    for (const kind of ['thumb','display','full']) {
      image[kind] = `assets/artworks/${slug}-${kind}.webp`;
      files.push({path:image[kind],blob:pendingImage.variants[kind]});
    }
  }
  const next = {id,slug,title:value('title'),titleEn:value('titleEn'),section:value('section'),order:Number(value('order')),tag:value('tag'),description:value('description'),alt:value('alt'),notes:value('notes'),medium:old?.medium || 'AI 辅助创作的数字图像',image,reference:{...old?.reference,title:value('referenceTitle'),url:value('referenceUrl') || null,relationship:value('section')==='lab'?'风格实验':'图像改写',note:old?.reference.note || '参考关系由展品维护者填写。'},creation:{date:value('date')||null,tool:value('tool')||null,modelVersion:null,prompt:null,humanEdits:null,...old?.creation},source:{filename:pendingImage?.filename || old.source.filename,origin:old?.source.origin || '展品维护者提供',rightsStatus:value('rightsStatus') || '未提供完整授权记录'},publish:field('publish').checked};
  next.creation.date = value('date') || null; next.creation.tool = value('tool') || null;
  const nextCatalog = {schemaVersion:1,artworks:old?catalog.artworks.map(art=>art.id===selectedId?next:art):[...catalog.artworks,next]};
  validateCatalog(nextCatalog); await saveState(nextCatalog,files);
  catalog = nextCatalog; selectedId=id; pendingImage=null; dirty=false;
  field('slug').readOnly=true; field('id').readOnly=true;
  document.querySelector('#editor-title').textContent='编辑展品';
  renderList(); setStatus('本机草稿已保存。导出更新包并提交后，线上网站才会更新。'); notify('草稿已保存');
  return true;
}
form.addEventListener('submit',async event=>{
  event.preventDefault(); if(busy) return; busy=true;
  try { await saveCurrent(); } catch(error) {setStatus(error.message);} finally {busy=false;}
});
document.querySelector('#new-artwork').addEventListener('click',()=>chooseArtwork());
document.querySelector('#export-data').addEventListener('click',async event=>{
  if(busy)return; busy=true; event.target.disabled=true;
  try {
    if(dirty && !await saveCurrent()) return;
    if(!window.JSZip) throw new Error('导出组件尚未载入，请刷新后重试。');
    validateCatalog(catalog);
    const zip = new window.JSZip();
    zip.file('content/artworks.json',JSON.stringify(catalog,null,2)+'\n');
    let assetCount=0;
    for(const art of catalog.artworks) for(const kind of ['thumb','display','full']) {
      const imagePath=art.image[kind];
      const blob=await readStore('assets',imagePath);
      if(blob) { zip.file('public/'+imagePath,await blob.arrayBuffer()); assetCount++; }
    }
    zip.file('更新说明.txt','将 content 和 public 文件夹合并到仓库根目录，提交到 main 后自动发布。\n未改动的原有图片不重复打包，请勿删除原有 public/assets/artworks。\n未展出记录不会进入网站，但上传到公开 GitHub 仓库的文件仍然公开。\n');
    const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:3}});
    const url=URL.createObjectURL(blob);const anchor=document.createElement('a');
    anchor.href=url;anchor.download=`nailoong-update-${new Date().toISOString().slice(0,10)}.zip`;document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
    setStatus(`已导出 ${catalog.artworks.length} 条展品资料和 ${assetCount} 个新增或替换图片文件。`);
  }catch(error){setStatus(error.message);}finally{event.target.disabled=false;busy=false;}
});
document.querySelector('#import-data').addEventListener('click',()=>document.querySelector('#import-file').click());
document.querySelector('#import-file').addEventListener('change',async event=>{
  const file=event.target.files[0];if(!file||busy)return;
  try {
    if(file.size>5*1024*1024)throw new Error('资料文件过大，请选择 artworks.json。');
    const imported=validateCatalog(JSON.parse(await file.text()));
    if(!confirm('导入资料将替换当前浏览器中的展品草稿列表。请先导出需要保留的修改。继续吗？'))return;
    await saveState(imported);catalog=imported;dirty=false;await chooseArtwork();setStatus('展品资料已导入，图片将沿用网站已有路径或本机图片。');
  }catch(error){setStatus('无法导入：'+error.message);}finally{event.target.value='';}
});
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
async function initialize() {
  try {
    db=await openDb();const saved=await readStore('state','catalog');
    catalog=saved?validateCatalog(saved):await loadCatalog(base);
    renderList();await chooseArtwork();
    if(saved)setStatus('已恢复这个浏览器中保存的展品草稿。');
  }catch(error){setStatus(error.message);form.querySelectorAll('input,button,textarea,select').forEach(control=>control.disabled=true);document.querySelector('#new-artwork').disabled=true;document.querySelector('#import-data').disabled=true;}
}
await initialize();
