import { readFile, writeFile, mkdir, rm, cp, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCatalog, publishedArtworks, artworkImages, safeUrl } from '../public/catalog.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist');
const base = (process.env.BASE_PATH || '').replace(/^\/+|\/+$/g, '');
const prefix = base ? `/${base}/` : '/';
const href = route => prefix + route.replace(/^\//, '');
const data = validateCatalog(JSON.parse(await readFile(path.join(root, 'content/artworks.json'), 'utf8')));
const settings = JSON.parse(await readFile(path.join(root, 'content/settings.json'), 'utf8'));
if (!settings.siteUrl || !safeUrl(settings.siteUrl)) throw new Error('Invalid site URL');
const works = publishedArtworks(data);
if (!works.length) throw new Error('至少需要一件已发布展品。');
const art = slug => works.find(a => a.slug === slug);
const E = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const link = (route, label, cls = '') => `<a href="${E(href(route))}"${cls ? ` class="${cls}"` : ''}>${label}</a>`;
const external = (url, label) => `<a href="${E(url)}" target="_blank" rel="noopener noreferrer">${E(label)} ↗</a>`;
const canonical = route => settings.siteUrl.replace(/\/$/, '') + '/' + route;
const pages = [];
let pageCount = 0;
const count = n => String(n).padStart(2, '0');
const galleryRoute = a => `gallery/${a.slug}/`;
const workRoute = a => `works/${a.slug}/`;
const toolLabel = a => a.panels ? [...new Set(a.panels.map(p => p.creation?.tool || p.source.origin || '未记录'))].join('；') : (a.creation?.tool || '未记录');

// Only referenced, published images are copied, including every panel of a series.
if (path.dirname(out) !== root || path.basename(out) !== 'dist') throw new Error('Invalid output directory');
await rm(out, {recursive:true, force:true});
await mkdir(out, {recursive:true});
for (const file of ['styles.css', 'app.mjs', 'catalog.mjs', 'favicon.svg']) await cp(path.join(root, 'public', file), path.join(out, file));
const assets = new Set(works.flatMap(a => artworkImages(a).flatMap(image => ['thumb','display','full'].map(k => image[k]))));
for (const file of assets) {
  await access(path.join(root, 'public', file));
  await mkdir(path.dirname(path.join(out, file)), {recursive:true});
  await cp(path.join(root, 'public', file), path.join(out, file));
}

function picture(a, {eager = false, gallery = false, sizes = '(max-width: 760px) 88vw, 50vw'} = {}) {
  const im = a.image;
  const width = max => Math.round(im.width * Math.min(1, max / Math.max(im.width, im.height)));
  const candidates = new Map([[width(640), im.thumb], [width(1600), im.display]]);
  if (gallery) candidates.set(im.width, im.full);
  return `<img src="${E(href(im.display))}" srcset="${[...candidates].map(([w, file]) => `${E(href(file))} ${w}w`).join(', ')}" sizes="${sizes}" width="${im.width}" height="${im.height}" alt="${E(a.alt)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
}
function artworkVisual(a, options = {}) {
  if (!a.panels) return `<div class="single-image">${picture(a, options)}</div>`;
  return `<div class="panel-grid" role="group" aria-label="${E(a.title)}，${a.panels.length} 幅图像">${a.panels.map((p,i) => `<figure>${picture(p, {...options, sizes:options.gallery ? '(max-width: 760px) 42vw, 28vw' : '(max-width: 760px) 40vw, 18vw'})}<figcaption><span>${count(i + 1)}</span> ${E(p.title)}</figcaption></figure>`).join('')}</div>`;
}
function description(a) {
  return a.descriptionFormat === 'matrix'
    ? `<pre class="text-matrix" style="--matrix-size:${a.description.split('\n').length}" aria-label="由奶与龙两个字构成的方阵">${E(a.description)}</pre>`
    : `<p class="work-description">${E(a.description)}</p>`;
}
function reference(a) {
  if (!a.reference.title) return '';
  return `<div><dt>${E(a.reference.relationship || '参考作品')}</dt><dd>${E(a.reference.title)}${a.reference.artist ? `<span>${E(a.reference.artist)} · ${E(a.reference.year)}</span>` : ''}${a.reference.url ? `<span>${external(a.reference.url, a.reference.institution || '查看来源')}</span>` : ''}</dd></div>`;
}
function metadata(a) {
  return `<dl class="work-data"><div><dt>媒介</dt><dd>${E(a.medium)}</dd></div><div><dt>制作</dt><dd>${E(toolLabel(a))}</dd></div>${reference(a)}</dl>`;
}
function workRow(a, i) {
  return `<article class="work-row${a.panels ? ' work-row-series' : ''}" id="work-${a.slug}"><a class="work-image" href="${href(galleryRoute(a))}" aria-label="进入画廊，观看${E(a.title)}">${artworkVisual(a)}</a><div class="work-info"><p class="eyebrow">${count(i + 1)} / ${count(works.length)}</p><h3>${link(workRoute(a), E(a.title))}</h3><p class="work-english">${E(a.titleEn)}</p>${description(a)}${metadata(a)}${link(galleryRoute(a), '在画廊中观看 <span aria-hidden="true">→</span>', 'text-link')}</div></article>`;
}
function card(a, i) {
  return `<a class="index-card" href="${href(workRoute(a))}"><div class="index-image">${artworkVisual(a)}</div><div class="index-caption"><span>${count(i + 1)}</span><div><h2>${E(a.title)}</h2><p>${E(a.titleEn)}</p></div><span aria-hidden="true">↗</span></div></a>`;
}
function shell(route, title, content, {description:summary = '形象、再现与图像的秩序。奶龙进入艺术史。', image, noindex = false, gallery = false, returnRoute = ''} = {}) {
  const ogImage = canonical(image || (art('the-kiss') || works[0]).image.display);
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#f5f4ef"><meta name="color-scheme" content="light"><title>${E(title)} · 奶龙美术馆</title><meta name="description" content="${E(summary)}"><meta property="og:type" content="website"><meta property="og:title" content="${E(title)} · 奶龙美术馆"><meta property="og:description" content="${E(summary)}"><meta property="og:image" content="${E(ogImage)}"><meta property="og:url" content="${E(canonical(route))}"><meta name="twitter:card" content="summary_large_image">${noindex ? '<meta name="robots" content="noindex,nofollow">' : ''}<link rel="canonical" href="${E(canonical(route))}"><link rel="icon" href="${href('favicon.svg')}" type="image/svg+xml"><link rel="stylesheet" href="${href('styles.css')}"><script type="module" src="${href('app.mjs')}"></script></head><body class="${gallery ? 'gallery-body' : 'exhibition-body'}"${gallery ? ` data-gallery data-return="${E(href(returnRoute))}"` : ''}>${gallery ? '' : `<a class="skip-link" href="#main">跳到主要内容</a><header class="site-header shell"><a class="brand" href="${href('')}" aria-label="奶龙美术馆首页">奶龙美术馆<span>NAILOONG MUSEUM OF ART</span></a><nav aria-label="主导航">${link('about/', '关于展览')}</nav></header>`}<main id="main">${content}</main>${gallery ? '' : `<footer class="site-footer shell"><p class="footer-statement">Nailoong is different</p><nav aria-label="页脚导航">${link('works/', '所有作品')}${link('credits/', '来源与说明')}</nav></footer>`}</body></html>`;
}
async function emit(route, title, content, options = {}) {
  const file = route === '404.html' ? path.join(out, route) : path.join(out, route, 'index.html');
  await mkdir(path.dirname(file), {recursive:true});
  await writeFile(file, shell(route, title, content, options));
  if (!options.noindex) pages.push(canonical(route));
  pageCount++;
}

const hero = art('the-kiss') || works[0];
await emit('', '奶龙进入艺术史', `<div class="shell"><section class="hero"><div class="hero-copy"><p class="eyebrow">NAILOONG, REFRAMED</p><h1>奶龙<br>进入艺术史</h1><p class="hero-subtitle">形象、再现与图像的秩序</p>${link('gallery/', '进入画廊 <span aria-hidden="true">→</span>', 'enter-gallery')}<p class="hero-count">${count(works.length)} 件作品 / ${count(works.reduce((n,a) => n + artworkImages(a).length, 0))} 幅图像</p></div><figure class="hero-visual"><a href="${href(galleryRoute(hero))}" aria-label="进入画廊，观看${E(hero.title)}">${picture(hero, {eager:true, sizes:'(max-width: 760px) 88vw, 48vw'})}</a><figcaption><span>${E(hero.title)} · ${E(hero.titleEn)}</span><span>${E(hero.creation?.tool)}</span></figcaption></figure></section><section class="curatorial-intro"><p class="eyebrow">THE EXHIBITION</p><p>同一形象进入不同的图像秩序。<br>在保留与置换之间，重新观看我们所熟悉的艺术。</p></section><section class="works-section" aria-labelledby="works-title"><header class="section-heading"><h2 id="works-title">展出作品</h2><span>WORKS IN THE EXHIBITION</span></header>${works.map(workRow).join('')}</section></div>`);

await emit('works/', '所有作品', `<div class="shell"><header class="page-head"><p class="eyebrow">INDEX OF WORKS</p><h1>所有作品</h1><p>${count(works.length)} 件作品，按展览顺序排列。</p></header><div class="index-grid">${works.map(card).join('')}</div></div>`);

function galleryContent(a, index) {
  const prev = works[(index - 1 + works.length) % works.length];
  const next = works[(index + 1) % works.length];
  return `<section class="gallery-room${a.panels ? ' gallery-series' : ''}" aria-labelledby="gallery-title"><div class="gallery-art">${artworkVisual(a, {eager:true, gallery:true, sizes:'(max-width: 760px) 90vw, 80vw'})}</div><div class="gallery-caption"><div><h1 id="gallery-title">${E(a.title)}</h1><p>${E(a.titleEn)}<span class="caption-divider"> / </span>${E(a.medium)}</p></div><span>${count(index + 1)} / ${count(works.length)}</span></div><nav class="gallery-controls" aria-label="切换作品"><a class="gallery-prev" data-prev href="${href(galleryRoute(prev))}" aria-label="上一件：${E(prev.title)}"><span aria-hidden="true">←</span></a><a class="gallery-next" data-next href="${href(galleryRoute(next))}" aria-label="下一件：${E(next.title)}"><span aria-hidden="true">→</span></a></nav><p class="gallery-hint">← → 切换作品 <span>· Esc 返回展览</span></p></section>`;
}
for (const [i, a] of works.entries()) {
  await emit(workRoute(a), a.title, `<div class="shell detail-page"><p class="breadcrumb">${link('works/', '所有作品')}<span> / ${count(i + 1)}</span></p><article class="detail-layout${a.panels ? ' detail-series' : ''}"><a class="detail-image" href="${href(galleryRoute(a))}" aria-label="进入画廊，观看${E(a.title)}">${artworkVisual(a, {eager:true})}</a><div class="work-info"><p class="eyebrow">${count(i + 1)} / ${count(works.length)}</p><h1>${E(a.title)}</h1><p class="work-english">${E(a.titleEn)}</p>${description(a)}${metadata(a)}${a.notes ? `<p class="work-notes">${E(a.notes)}</p>` : ''}${link(galleryRoute(a), '在画廊中观看 <span aria-hidden="true">→</span>', 'text-link')}</div></article></div>`, {description:a.descriptionFormat === 'matrix' ? a.title : a.description, image:a.image.display});
  await emit(galleryRoute(a), a.title, galleryContent(a, i), {gallery:true, returnRoute:`#work-${a.slug}`, description:a.title, image:a.image.display});
}
await emit('gallery/', works[0].title, galleryContent(works[0], 0), {gallery:true, returnRoute:`#work-${works[0].slug}`, noindex:true, image:works[0].image.display});

await emit('about/', '关于展览', `<div class="shell"><header class="page-head about-head"><p class="eyebrow">ABOUT THE EXHIBITION</p><h1>奶龙进入艺术史</h1><p>形象、再现与图像的秩序</p></header><div class="about-layout"><aside><p class="about-english">Nailoong,<br>Reframed.</p><span class="eyebrow">CURATORIAL TEXT</span></aside><article class="prose"><p>图像并不止于它所呈现的对象。构图、姿态、媒介与命名共同构成一种秩序，使某些形象得以被辨认、被记忆，并在反复观看中获得权威。</p><p>“奶龙进入艺术史”以同一形象的持续置换为线索，将其引入不同的绘画结构与视觉传统。肖像中的目光、群像中的距离、装饰中的身体，以及文字与对象之间的关系，在这一过程中被重新配置。被保留的形式与被替换的主体并置，构成展览的基本张力。</p><p>这些作品不沿年代建立连续的艺术史叙事，而将不同图像置于同一观看平面。经典作品所形成的视觉记忆，与数字环境中不断流通的形象在此相遇。观众面对的不只是一个对象的变化，也是辨识机制本身的显现：我们凭借什么，认定一幅图像仍然是我们所熟悉的那一幅？</p><p>《组图》将单一形象展开为六种视觉表述，使重复成为作品的结构。《家用厨房粉碎机》则将命名分解为两个字的反复排列，使语言在指认对象的同时，转化为可以被观看的表面。图像与文字不再保持稳定的对应关系，而在重复、差异与偏移之中持续生成意义。</p><p>展览采用连续的单件观看方式。页面的留白、作品之间的间隔与有限的导航，构成一种观看的尺度：让形象暂时离开信息流，重新获得被凝视的时间。</p><div class="production-note"><h2>图像制作</h2><p>作品使用 ChatGPT、Gemini 生成，并引用一幅原作者图像。各件作品的制作工具、参考作品与来源记录，见${link('credits/', '“来源与说明”')}。</p></div></article></div></div>`);

function credit(a, i) {
  const panels = a.panels ? `<ol class="panel-credits">${a.panels.map(p => `<li><strong>${E(p.title)}</strong><span>${E(p.creation?.tool || p.source.credit)}${p.source.url ? ` · ${external(p.source.url, '图像来源')}` : ''}</span></li>`).join('')}</ol>` : `<p>制作工具：${E(toolLabel(a))}</p>`;
  return `<article class="credit-row"><span class="eyebrow">${count(i + 1)}</span><div><h2>${link(workRoute(a), E(a.title))}</h2><p>${E(a.source.origin)}</p>${panels}</div><div class="credit-reference">${a.reference.title ? `<h3>${E(a.reference.relationship || '参考作品')}</h3><p>${E(a.reference.title)}</p>${a.reference.artist ? `<p>${E(a.reference.artist)}<br>${E(a.reference.year)}</p>` : ''}${a.reference.url ? external(a.reference.url, a.reference.institution || '来源页面') : ''}<p>${E(a.reference.note)}</p>` : '<p>独立作品</p>'}</div></article>`;
}
await emit('credits/', '来源与说明', `<div class="shell"><header class="page-head"><p class="eyebrow">SOURCES & NOTES</p><h1>来源与说明</h1><p class="lead">本页记录展出图像的制作工具、图像来源与参考作品。参考作品的作者与年代列于各条记录中。</p></header><div class="credits-list">${works.map(credit).join('')}</div></div>`);

// Preserve old bookmarked routes for works now presented together.
async function redirect(route, target) {
  await emit(route, '作品已移至新位置', `<div class="shell redirect-page" data-redirect="${href(target)}"><h1>作品已移至新位置</h1>${link(target, '查看作品 →', 'text-link')}</div>`, {noindex:true});
}
await redirect('exhibition/', 'works/');
if (art('series')) {
  await redirect('lab/', 'works/series/');
  for (const slug of ['on-paper','constructed','minimal-form','chat-noir','circles-and-lines']) {
    if (!art(slug)) await redirect(`works/${slug}/`, 'works/series/');
  }
}
await emit('404.html', '页面未找到', `<div class="shell not-found"><p class="eyebrow">404</p><h1>页面未找到</h1><p>请从作品索引继续参观。</p>${link('works/', '所有作品 →', 'text-link')}</div>`, {noindex:true});
await mkdir(path.join(out, 'api'), {recursive:true});
await writeFile(path.join(out, 'api/artworks.json'), JSON.stringify({schemaVersion:1, artworks:works}, null, 2));
await writeFile(path.join(out, 'api/site.json'), JSON.stringify({title:settings.title, exhibitionTitle:settings.exhibitionTitle, artworkCount:works.length, imageCount:works.reduce((n,a) => n + artworkImages(a).length, 0)}, null, 2));
await writeFile(path.join(out, '.nojekyll'), '');
await writeFile(path.join(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages.map(url => `<url><loc>${E(url)}</loc></url>`).join('')}</urlset>`);
await writeFile(path.join(out, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${canonical('sitemap.xml')}\n`);
console.log(`Built ${pageCount} pages, ${works.length} artworks, ${assets.size} image assets. Base path: ${prefix}`);
