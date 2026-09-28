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
  return `<div class="panel-grid" role="group" aria-label="${E(a.title)}，${a.panels.length} 幅图像">${a.panels.map(p => `<figure>${picture(p, {...options, sizes:options.gallery ? '(max-width: 760px) 28vw, 20vw' : '(max-width: 760px) 28vw, 18vw'})}</figure>`).join('')}</div>`;
}
function description(a) {
  if (!a.description.trim()) return '';
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
function shell(route, title, content, {description:summary = '奶·龙 — NAILOONG, REFRAMED. 奶龙即不同。', image, noindex = false, gallery = false} = {}) {
  const ogImage = canonical(image || works[0].image.display);
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#f5f4ef"><meta name="color-scheme" content="light"><title>${E(title)} · 奶龙美术馆</title><meta name="description" content="${E(summary)}"><meta property="og:type" content="website"><meta property="og:title" content="${E(title)} · 奶龙美术馆"><meta property="og:description" content="${E(summary)}"><meta property="og:image" content="${E(ogImage)}"><meta property="og:url" content="${E(canonical(route))}"><meta name="twitter:card" content="summary_large_image">${noindex ? '<meta name="robots" content="noindex,nofollow">' : ''}<link rel="canonical" href="${E(canonical(route))}"><link rel="icon" href="${href('favicon.svg')}" type="image/svg+xml"><link rel="stylesheet" href="${href('styles.css')}"><script type="module" src="${href('app.mjs')}"></script></head><body class="${gallery ? 'gallery-body' : 'exhibition-body'}"${gallery ? ' data-gallery' : ''}><a class="skip-link" href="#main">跳到主要内容</a><header class="site-header shell"><a class="brand" href="${href('')}" aria-label="奶龙美术馆首页">奶龙美术馆<span>NAILOONG MUSEUM OF ART</span></a><nav aria-label="主导航">${link('', '首页')}${link('works/', '作品说明')}${link('about/', '关于展览')}</nav></header><main id="main">${content}</main></body></html>`;
}
async function emit(route, title, content, options = {}) {
  const file = route === '404.html' ? path.join(out, route) : path.join(out, route, 'index.html');
  await mkdir(path.dirname(file), {recursive:true});
  await writeFile(file, shell(route, title, content, options));
  if (!options.noindex) pages.push(canonical(route));
  pageCount++;
}

const hero = works[0];
await emit('', settings.exhibitionTitle, `<div class="shell"><section class="hero"><div class="hero-copy"><h1>奶·龙</h1><p class="hero-subtitle">NAILOONG, REFRAMED</p>${link('gallery/', '进入画廊 <span aria-hidden="true">→</span>', 'enter-gallery')}<p class="hero-count">${count(works.length)} 件作品 / ${count(works.reduce((n,a) => n + artworkImages(a).length, 0))} 幅图像</p></div><figure class="hero-visual"><a href="${href(galleryRoute(hero))}" aria-label="进入画廊，观看${E(hero.title)}">${picture(hero, {eager:true, sizes:'(max-width: 760px) 88vw, 48vw'})}</a><figcaption><span>${E(hero.title)} · ${E(hero.titleEn)}</span><span>${E(hero.creation?.tool)}</span></figcaption></figure></section><section class="curatorial-intro"><p class="eyebrow">THE EXHIBITION</p><p>奶龙即不同<br><em>Nailoong is different.</em></p></section><section class="works-section" aria-labelledby="works-title"><header class="section-heading"><h2 id="works-title">展出作品</h2><span>WORKS IN THE EXHIBITION</span></header>${works.map(workRow).join('')}</section></div>`);

function galleryContent(a, index) {
  const prev = works[index - 1];
  const next = works[index + 1];
  const previousControl = prev ? `<a class="gallery-prev" data-prev href="${href(galleryRoute(prev))}" aria-label="上一件：${E(prev.title)}"><span aria-hidden="true">←</span> 上一件</a>` : '<span class="gallery-prev disabled" aria-disabled="true"><span aria-hidden="true">←</span> 上一件</span>';
  const nextControl = next ? `<a class="gallery-next" data-next href="${href(galleryRoute(next))}" aria-label="下一件：${E(next.title)}">下一件 <span aria-hidden="true">→</span></a>` : '<span class="gallery-next disabled" aria-disabled="true">下一件 <span aria-hidden="true">→</span></span>';
  return `<section class="shell gallery-room${a.panels ? ' gallery-series' : ''}" aria-labelledby="gallery-title"><div class="gallery-art">${artworkVisual(a, {eager:true, gallery:true, sizes:'(max-width: 760px) 90vw, 55vw'})}</div><div class="work-info gallery-info"><p class="eyebrow">${count(index + 1)} / ${count(works.length)}</p><h1 id="gallery-title">${E(a.title)}</h1><p class="work-english">${E(a.titleEn)}</p>${description(a)}${metadata(a)}</div><nav class="gallery-controls" aria-label="切换作品">${previousControl}<span class="gallery-position">${count(index + 1)} / ${count(works.length)}</span>${nextControl}</nav></section>`;
}
for (const [i, a] of works.entries()) {
  await emit(workRoute(a), a.title, `<div class="shell detail-page"><p class="breadcrumb">${link('works/', '作品说明')}<span> / ${count(i + 1)}</span></p><article class="detail-layout${a.panels ? ' detail-series' : ''}"><a class="detail-image" href="${href(galleryRoute(a))}" aria-label="进入画廊，观看${E(a.title)}">${artworkVisual(a, {eager:true})}</a><div class="work-info"><p class="eyebrow">${count(i + 1)} / ${count(works.length)}</p><h1>${E(a.title)}</h1><p class="work-english">${E(a.titleEn)}</p>${description(a)}${metadata(a)}${link(galleryRoute(a), '在画廊中观看 <span aria-hidden="true">→</span>', 'text-link')}</div></article></div>`, {description:a.descriptionFormat === 'matrix' || !a.description.trim() ? a.title : a.description, image:a.image.display});
  await emit(galleryRoute(a), a.title, galleryContent(a, i), {gallery:true, description:a.title, image:a.image.display});
}
await emit('gallery/', works[0].title, galleryContent(works[0], 0), {gallery:true, noindex:true, image:works[0].image.display});

await emit('about/', '关于展览', `<div class="shell"><header class="page-head about-head"><p class="eyebrow">ABOUT THE EXHIBITION</p><h1>奶·龙</h1><p>NAILOONG, REFRAMED</p></header><div class="about-layout"><aside><p class="about-english">Nailoong,<br>Reframed.</p><span class="eyebrow">CURATORIAL TEXT</span></aside><article class="prose"><p>一张图像何以被认作奶龙？当面孔、身体、名字与它们所处的位置不再一致，辨认就不再是一个理所当然的动作。</p><p>“奶·龙”从《这不是奶龙》的否定句开始。一个名字先被提出，随后进入肖像、亲密关系与公共生活。同一形象承担不同的身份，也与画面中既有的身份发生摩擦。</p><p>展览后段将观看转向思考本身。《桶中之脑》与《正在思考》之后，形象在《组图》中反复出现，在《家用厨房粉碎机》中趋于瓦解。最后，《救世主》重新给出一张完整、正面的面孔。它将凝视交还给观众，也让开场的命名问题保持敞开。</p><div class="production-note"><h2>图像制作</h2><p>作品使用 ChatGPT、Gemini 生成，并引用一幅原作者图像。各件作品的制作工具、参考作品与来源记录，见${link('works/', '“作品说明”')}。</p></div></article></div></div>`);

function credit(a, i) {
  const panels = a.panels ? `<ol class="panel-credits">${a.panels.map(p => `<li><strong>${E(p.title)}</strong><span>${E(p.creation?.tool || p.source.credit)}${p.source.url ? ` · ${external(p.source.url, '图像来源')}` : ''}</span></li>`).join('')}</ol>` : `<p>制作工具：${E(toolLabel(a))}</p>`;
  return `<article class="credit-row" id="${a.slug}"><a class="credit-image" href="${href(galleryRoute(a))}" aria-label="进入画廊，观看${E(a.title)}">${artworkVisual(a)}</a><div class="work-info"><p class="eyebrow">${count(i + 1)} / ${count(works.length)}</p><h2>${link(workRoute(a), E(a.title))}</h2><p class="work-english">${E(a.titleEn)}</p>${description(a)}<div class="source-details"><p>${E(a.source.origin)}</p>${panels}</div></div><div class="credit-reference">${a.reference.title ? `<h3>${E(a.reference.relationship || '参考作品')}</h3><p>${E(a.reference.title)}</p>${a.reference.artist ? `<p>${E(a.reference.artist)}<br>${E(a.reference.year)}</p>` : ''}${a.reference.url ? external(a.reference.url, a.reference.institution || '来源页面') : ''}<p>${E(a.reference.note)}</p>` : '<p>独立作品</p>'}</div></article>`;
}
await emit('works/', '作品说明', `<div class="shell"><header class="page-head"><p class="eyebrow">WORKS & NOTES</p><h1>作品说明</h1><p class="lead">按展览顺序收录作品、制作信息与参考来源。</p></header><div class="credits-list">${works.map(credit).join('')}</div></div>`);

// Preserve old bookmarked routes for works now presented together.
async function redirect(route, target) {
  await emit(route, '作品已移至新位置', `<div class="shell redirect-page" data-redirect="${href(target)}"><h1>作品已移至新位置</h1>${link(target, '查看作品 →', 'text-link')}</div>`, {noindex:true});
}
await redirect('exhibition/', 'works/');
await redirect('credits/', 'works/');
if (art('series')) {
  await redirect('lab/', 'works/series/');
  for (const slug of ['on-paper','constructed','minimal-form','chat-noir','circles-and-lines']) {
    if (!art(slug)) await redirect(`works/${slug}/`, 'works/series/');
  }
}
await emit('404.html', '页面未找到', `<div class="shell not-found"><p class="eyebrow">404</p><h1>页面未找到</h1><p>请从作品说明继续参观。</p>${link('works/', '作品说明 →', 'text-link')}</div>`, {noindex:true});
await mkdir(path.join(out, 'api'), {recursive:true});
await writeFile(path.join(out, 'api/artworks.json'), JSON.stringify({schemaVersion:1, artworks:works}, null, 2));
await writeFile(path.join(out, 'api/site.json'), JSON.stringify({title:settings.title, exhibitionTitle:settings.exhibitionTitle, artworkCount:works.length, imageCount:works.reduce((n,a) => n + artworkImages(a).length, 0)}, null, 2));
await writeFile(path.join(out, '.nojekyll'), '');
await writeFile(path.join(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages.map(url => `<url><loc>${E(url)}</loc></url>`).join('')}</urlset>`);
await writeFile(path.join(out, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${canonical('sitemap.xml')}\n`);
console.log(`Built ${pageCount} pages, ${works.length} artworks, ${assets.size} image assets. Base path: ${prefix}`);
