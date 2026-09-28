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
  const thinking = published.find(art => art.slug === 'light-and-shadow');
  assert.equal(thinking.title, '正在思考');
  assert.equal(thinking.titleEn, 'Thinking');
  const bucket = published.find(art => art.slug === 'paint-pot-angel');
  assert.equal(bucket.title, '桶中之脑');
  assert.equal(bucket.titleEn, 'Brain in a Bucket');
  assert.equal(published.filter(art => originalIds.includes(art.id)).at(-1).slug, 'salvator');
});

test('the series keeps its six ordered panels and separate origin and tool records', () => {
  const art = group(data);
  assert.equal(art.title, '组图');
  assert.equal(art.section, 'series');
  assert.deepEqual(art.panels.map(panel => panel.title), ['浮世绘奶龙', '构成主义奶龙', '勒夏奶龙', '极简构成主义奶龙', '康定斯基奶龙', '村上隆奶龙']);
  assert.equal(art.description, '这个世界太尖锐了，不允许奶龙哭，却赋予了奶龙很多痛苦。怎么痛也痛不完，奶龙痛恨这一切。后来才明白，什么都可以是假的，只有痛苦是真的。');
  const originalPanel = art.panels.find(panel => panel.title === '构成主义奶龙');
  assert.equal(originalPanel.creation.tool, null);
  assert.match(originalPanel.source.credit, /Simon/);
  assert.match(art.source.credit, /Simon/);
  const profileUrl = originalPanel.source.url;
  assert.match(new URL(profileUrl).hostname, /(^|\.)xiaohongshu\.com$/);
  assert.ok(new URL(profileUrl).pathname.startsWith('/user/profile/'));
  assert.equal(art.reference.url, profileUrl);
  assert.equal(art.source.url, profileUrl);
  assert.ok(!JSON.stringify(data).includes('xiaohongshu.com/explore/6a8ee0a0000000000a00829d'));
  assert.ok(art.panels.filter(panel => panel !== originalPanel).every(panel => panel.creation.tool === 'Gemini'));
  assert.equal(artworkImages(art).length, 6);
});

test('the matrix is ten by ten and all known creation tools are retained', () => {
  const matrix = data.artworks.find(art => art.slug === 'almost-disappearing');
  assert.equal(matrix.title, '家用厨房粉碎机');
  assert.equal(matrix.descriptionFormat, 'matrix');
  const rows = matrix.description.split('\n');
  assert.equal(rows.length, 10);
  assert.ok(rows.every(row => /^[奶龙]{10}$/.test(row)));
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

test('English descriptions are optional text and reject malformed values', () => {
  const legacy = fixture();
  for (const art of legacy.artworks) delete art.descriptionEn;
  assert.doesNotThrow(() => validateCatalog(legacy));
  for (const value of ['', 'An English description.', 'Text with <em>markup</em> & punctuation.']) {
    const changed = fixture();
    changed.artworks[0].descriptionEn = value;
    assert.doesNotThrow(() => validateCatalog(changed));
  }
  for (const value of [null, 17, false, {}, [], 'x'.repeat(10001)]) {
    const changed = fixture();
    changed.artworks[0].descriptionEn = value;
    assert.throws(() => validateCatalog(changed), /descriptionEn/);
  }
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
