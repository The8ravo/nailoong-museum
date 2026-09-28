const gallery = document.querySelector('[data-gallery]');
if (gallery) {
  document.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.repeat) return;
    if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    const target = event.key === 'ArrowLeft' ? document.querySelector('[data-prev]')
      : event.key === 'ArrowRight' ? document.querySelector('[data-next]') : null;
    if (target) { event.preventDefault(); target.click(); }
  });
}
const moved = document.querySelector('[data-redirect]')?.dataset.redirect;
if (moved?.startsWith('/') && !moved.startsWith('//')) location.replace(moved);
