const viewer = document.querySelector('#artwork-viewer');
if (viewer && typeof viewer.showModal === 'function') {
  const title = viewer.querySelector('[data-viewer-title]');
  const stage = viewer.querySelector('[data-viewer-stage]');
  const image = viewer.querySelector('[data-viewer-image]');
  const status = viewer.querySelector('[data-viewer-status]');
  const close = viewer.querySelector('[data-viewer-close]');
  const zoom = viewer.querySelector('[data-viewer-zoom]');
  let opener = null;
  let scrollPosition = { x: 0, y: 0 };
  let pendingImage = null;
  let requestId = 0;

  function resetZoom() {
    stage.classList.remove('is-zoomed');
    zoom.setAttribute('aria-pressed', 'false');
    zoom.textContent = '原尺寸';
    stage.scrollTo(0, 0);
  }

  function cancelImage() {
    requestId += 1;
    if (pendingImage) {
      pendingImage.onload = null;
      pendingImage.onerror = null;
      pendingImage.removeAttribute('src');
      pendingImage = null;
    }
    image.hidden = true;
    image.removeAttribute('src');
    stage.style.removeProperty('--viewer-image-width');
    zoom.disabled = true;
  }

  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const link = event.target instanceof Element ? event.target.closest('a[data-image-zoom]') : null;
    if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self') || viewer.open) return;

    opener = link;
    scrollPosition = { x: window.scrollX, y: window.scrollY };
    cancelImage();
    resetZoom();
    title.textContent = link.dataset.title || link.querySelector('img')?.alt || '作品大图';
    image.alt = link.querySelector('img')?.alt || title.textContent;
    status.textContent = '正在加载图片…';
    status.hidden = false;
    document.body.classList.add('viewer-open');
    viewer.showModal();
    close.focus({ preventScroll: true });
    event.preventDefault();

    const currentRequest = requestId;
    const loadingImage = new Image();
    pendingImage = loadingImage;
    loadingImage.decoding = 'async';
    loadingImage.onload = () => {
      if (currentRequest !== requestId || !viewer.open) return;
      stage.style.setProperty('--viewer-image-width', `${loadingImage.naturalWidth}px`);
      image.src = loadingImage.src;
      image.hidden = false;
      status.textContent = '';
      status.hidden = true;
      zoom.disabled = false;
      pendingImage = null;
    };
    loadingImage.onerror = () => {
      if (currentRequest !== requestId || !viewer.open) return;
      status.textContent = '图片暂时无法加载，请返回作品后重试。';
      status.hidden = false;
      pendingImage = null;
    };
    loadingImage.src = link.href;
  });

  close.addEventListener('click', () => viewer.close());
  zoom.addEventListener('click', () => {
    const zoomed = stage.classList.toggle('is-zoomed');
    zoom.setAttribute('aria-pressed', String(zoomed));
    zoom.textContent = zoomed ? '适应窗口' : '原尺寸';
    stage.scrollTo(0, 0);
  });
  viewer.addEventListener('close', () => {
    if (viewer.open) return;
    cancelImage();
    resetZoom();
    status.textContent = '';
    status.hidden = true;
    document.body.classList.remove('viewer-open');
    window.scrollTo(scrollPosition.x, scrollPosition.y);
    opener?.focus({ preventScroll: true });
    opener = null;
  });
}

const gallery = document.querySelector('[data-gallery]');
if (gallery) {
  document.addEventListener('keydown', event => {
    if (viewer?.open || event.defaultPrevented) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.repeat) return;
    if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    const target = event.key === 'ArrowLeft' ? document.querySelector('[data-prev]')
      : event.key === 'ArrowRight' ? document.querySelector('[data-next]') : null;
    if (target) { event.preventDefault(); target.click(); }
  });
}
const moved = document.querySelector('[data-redirect]')?.dataset.redirect;
if (moved?.startsWith('/') && !moved.startsWith('//')) location.replace(moved);
