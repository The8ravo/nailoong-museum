import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { validateCatalog, publishedArtworks, artworkImages, safeAsset, safeUrl } from '../public/catalog.mjs';

const data = JSON.parse(await readFile(new URL('../content/artworks.json', import.meta.url)));
const fixture = () => structuredClone(data);
const group = catalog => catalog.artworks.find(art => art.slug === 'series');
const originalIds = ['NL-014', 'NL-004', 'NL-003', 'NL-006', 'NL-005', 'NL-016', 'NL-009', 'NL-017', 'NL-018', 'NL-019', 'NL-020', 'NL-002', 'NL-008'];

test('the revised exhibition is preserved and all published image assets exist', async () => {
  const published = publishedArtworks(data);
  for (const id of originalIds) assert.ok(published.some(art => art.id === id), `missing exhibition work ${id}`);
  for (const art of published) for (const image of artworkImages(art)) {
    for (const kind of ['thumb', 'display', 'full']) await access(new URL('../public/' + image[kind], import.meta.url));
  }
  assert.equal(published.find(art => art.slug === 'light-and-shadow').title, '卡拉瓦乔奶龙');
});

test('the series keeps its six ordered panels and separate origin and tool records', () => {
  const art = group(data);
  assert.equal(art.title, '组图');
  assert.equal(art.section, 'series');
  assert.deepEqual(art.panels.map(panel => panel.title), ['村上隆奶龙', '浮世绘奶龙', '构成主义奶龙', '简约构成主义奶龙', '勒夏奶龙', '康定斯基奶龙']);
  assert.equal(art.description, '这个世界太尖锐了 不允许奶龙哭 却赋予了奶龙很多痛苦 怎么痛也痛不完 奶龙痛恨这一切 后来才明白什么都可以是假的 只有痛苦是真的');
  assert.equal(art.panels[2].creation.tool, null);
  assert.match(art.panels[2].source.origin, /原作者/);
  assert.ok(art.panels.filter((_, index) => index !== 2).every(panel => panel.creation.tool === 'Gemini'));
  assert.equal(artworkImages(art).length, 6);
});

test('the matrix is fifteen by fifteen and all known creation tools are retained', () => {
  const matrix = data.artworks.find(art => art.slug === 'almost-disappearing');
  assert.equal(matrix.title, '家用厨房粉碎机');
  assert.equal(matrix.descriptionFormat, 'matrix');
  const rows = matrix.description.split('\n');
  assert.equal(rows.length, 15);
  assert.ok(rows.every(row => /^[奶龙]{15}$/.test(row)));
  const gemini = new Set(['olympia', 'series', 'a-sunday-afternoon', 'the-dance', 'almost-disappearing']);
  for (const art of data.artworks.filter(art => originalIds.includes(art.id))) {
    assert.equal(art.creation.tool, gemini.has(art.slug) ? 'Gemini' : 'ChatGPT');
    assert.equal(art.creation.date, null);
  }
});

test('draft works and draft series are excluded as whole records', () => {
  const changed = fixture();
  changed.artworks[0].publish = false;
  group(changed).publish = false;
  const removedIds = new Set([changed.artworks[0].id, group(changed).id]);
  assert.deepEqual(publishedArtworks(changed).map(art => art.id), publishedArtworks(data).filter(art => !removedIds.has(art.id)).map(art => art.id));
  assert.ok(!publishedArtworks(changed).some(art => art.slug === 'series'));
});

test('duplicate identifiers, unsafe slugs, and path traversal are rejected', () => {
  const duplicate = fixture();
  duplicate.artworks.push(structuredClone(duplicate.artworks[0]));
  assert.throws(() => validateCatalog(duplicate), /重复/);
  const traversal = fixture();
  traversal.artworks[0].slug = '../studio';
  assert.throws(() => validateCatalog(traversal), /网址/);
  for (const value of ['assets/artworks/../../secret.png', 'https://example.com/x.png', 'assets/artworks/%2e%2e/x.png', 'assets/artworks/image.svg', 'assets/artworks/back\\slash.png']) assert.equal(safeAsset(value), false);
  assert.equal(safeAsset('assets/artworks/good.webp'), true);
});

test('unsafe links are rejected in references and every source record', () => {
  for (const value of ['javascript:alert(1)', 'https://user:pass@example.com', 'data:text/html,test', '//example.com', false, 0]) assert.equal(safeUrl(value), false);
  assert.equal(safeUrl('https://example.com/work'), true);
  assert.equal(safeUrl(null), true);
  for (const where of ['reference', 'source', 'panel']) {
    const changed = fixture();
    const target = where === 'panel' ? group(changed).panels[1].source : changed.artworks[0][where];
    target.url = 'javascript:alert(1)';
    assert.throws(() => validateCatalog(changed), /参考|来源/);
  }
});

test('malformed panel images, panel metadata, cover images, and series counts are rejected', () => {
  for (const mutate of [
    art => { art.panels[1].image.width = -1; },
    art => { art.panels[1].image.full = 'assets/artworks/../../secret.png'; },
    art => { art.panels[1].alt = ''; },
    art => { art.panels[1].source = []; },
    art => { art.image.full = 'assets/artworks/unlisted-cover.webp'; },
    art => { art.panels = []; },
    art => { delete art.panels; }
  ]) {
    const changed = fixture(); mutate(group(changed));
    assert.throws(() => validateCatalog(changed), /尺寸|路径|组图|来源/);
  }
  const changed = fixture(); changed.artworks[0].image.height = 0;
  assert.throws(() => validateCatalog(changed), /尺寸/);
});

test('malformed matrices and structured creation values are rejected', () => {
  for (const description of ['奶龙\n奶', '奶龙\n龙a', '奶龙奶\n奶龙奶']) {
    const changed = fixture();
    changed.artworks.find(art => art.descriptionFormat === 'matrix').description = description;
    assert.throws(() => validateCatalog(changed), /方阵/);
  }
  for (const mutate of [
    changed => { changed.artworks[0].creation.tool = { html: '<script>' }; },
    changed => { changed.artworks[0].creation.date = '2026-02-30'; },
    changed => { group(changed).panels[1].creation = null; }
  ]) {
    const changed = fixture(); mutate(changed);
    assert.throws(() => validateCatalog(changed), /创作/);
  }
});
