import { loadCatalog } from './catalog.mjs';

const base = document.body.dataset.base;
const toast = document.querySelector('.toast');
let toastTimer;
export function notify(message) {
  if (!toast) return;
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, 4200);
}

const menu = document.querySelector('.menu-toggle');
const nav = document.querySelector('#main-nav');
menu?.addEventListener('click', () => {
  const expanded = menu.getAttribute('aria-expanded') !== 'true';
  menu.setAttribute('aria-expanded', String(expanded));
  nav.classList.toggle('is-open', expanded);
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && nav?.classList.contains('is-open')) {
    nav.classList.remove('is-open'); menu.setAttribute('aria-expanded','false'); menu.focus();
  }
});

const filters = [...document.querySelectorAll('[data-filter]')];
function applyFilter(section, updateUrl = true) {
  if (!filters.some(button => button.dataset.filter === section)) section = 'all';
  filters.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filter === section)));
  let count = 0;
  document.querySelectorAll('.art-card[data-section]').forEach(card => {
    card.hidden = section !== 'all' && card.dataset.section !== section;
    if (!card.hidden) count++;
  });
  const label = document.querySelector('[data-result-count]');
  if (label) label.textContent = `共 ${count} 件作品`;
  if (updateUrl) {
    const url = new URL(location.href);
    if (section === 'all') url.searchParams.delete('section'); else url.searchParams.set('section', section);
    history.replaceState(null, '', url);
  }
}
if (filters.length) {
  applyFilter(new URL(location.href).searchParams.get('section') || 'all', false);
  filters.forEach(button => button.addEventListener('click', () => applyFilter(button.dataset.filter)));
}

const viewer = document.querySelector('.viewer');
const openViewer = document.querySelector('[data-open-viewer]');
openViewer?.addEventListener('click', () => {
  const image = viewer.querySelector('[data-full-src]');
  if (!image.getAttribute('src')) image.src = image.dataset.fullSrc;
  viewer.showModal();
  document.body.style.overflow = 'hidden';
});
document.querySelector('[data-close-viewer]')?.addEventListener('click', () => viewer.close());
viewer?.addEventListener('close', () => { document.body.style.overflow = ''; openViewer.focus(); });

const shareDialog = document.querySelector('.share-fallback');
document.querySelector('[data-share]')?.addEventListener('click', async () => {
  const url = new URL(location.href); url.hash = ''; url.search = '';
  try {
    if (navigator.share) { await navigator.share({title:document.title,url:url.href}); return; }
    await navigator.clipboard.writeText(url.href); notify('作品链接已复制');
  } catch (error) {
    if (error.name === 'AbortError') return;
    const field = shareDialog.querySelector('input'); field.value = url.href;
    shareDialog.showModal(); field.focus(); field.select();
  }
});
document.querySelector('[data-close-share]')?.addEventListener('click', () => shareDialog.close());

const compareSelects = [...document.querySelectorAll('[data-compare]')];
let catalogPromise;
compareSelects.forEach(select => {
  select.dataset.previous = select.value;
  select.addEventListener('change', async () => {
    try {
      catalogPromise ||= loadCatalog(base).catch(error => { catalogPromise = null; throw error; });
      const catalog = await catalogPromise;
      const chosen = catalog.artworks.find(art => art.slug === select.value && art.section === 'lab');
      if (!chosen) throw new Error('这个版本暂时无法载入。');
      const panel = select.closest('.compare-panel');
      const image = panel.querySelector('img');
      image.removeAttribute('srcset'); image.src = base + chosen.image.display;
      image.alt = chosen.alt; image.width = chosen.image.width; image.height = chosen.image.height;
      panel.querySelector('p').textContent = chosen.description;
      panel.querySelector('a').href = base + 'works/' + chosen.slug + '/';
      select.dataset.previous = select.value;
    } catch(error) { select.value = select.dataset.previous; notify(error.message); }
  });
});

document.addEventListener('error', event => {
  const image = event.target;
  if (!(image instanceof HTMLImageElement) || !image.getAttribute('src')) return;
  if (image.dataset.failed) return;
  image.dataset.failed = 'true';
  const notice = document.createElement('span'); notice.className = 'image-fallback';
  notice.textContent = '图片暂时无法加载，请刷新重试。';
  image.after(notice); image.hidden = true;
}, true);
