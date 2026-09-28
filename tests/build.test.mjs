import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, writeFile, readdir, access, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const escapeHtml = value => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function assertDescriptions(html, artworks, label) {
  const plain = artworks.filter(art => art.descriptionFormat !== 'matrix' && art.description.trim());
  const expectedChinese = plain.map(art => escapeHtml(art.description));
  const expectedEnglish = plain.filter(art => art.descriptionEn?.trim()).map(art => escapeHtml(art.descriptionEn));
  const chinese = [...html.matchAll(/<p class="work-description" lang="zh-CN">([\s\S]*?)<\/p>/g)].map(match => match[1]);
  const english = [...html.matchAll(/<p class="work-description work-description-en" lang="en">([\s\S]*?)<\/p>/g)].map(match => match[1]);
  assert.deepEqual(chinese, expectedChinese, `${label}: Chinese descriptions or language attributes differ`);
  assert.deepEqual(english, expectedEnglish, `${label}: English descriptions, escaping, or optional omission differ`);
  for (const art of plain.filter(art => art.descriptionEn?.trim())) {
    assert.ok(html.includes(`<p class="work-description" lang="zh-CN">${escapeHtml(art.description)}</p><p class="work-description work-description-en" lang="en">${escapeHtml(art.descriptionEn)}</p>`), `${label}: English description does not follow its Chinese original`);
  }
}
function assertEditorial(html, editorial, label) {
  assert.ok(html.includes(escapeHtml(editorial.title)), `${label}: Chinese title missing`);
  assert.ok(html.includes(escapeHtml(editorial.titleEn)), `${label}: English title missing`);
  for (const [key, lang] of [['zh', 'zh-CN'], ['en', 'en']]) {
    const paragraphs = [...html.matchAll(new RegExp(`<p\\b[^>]*\\blang="${lang}"[^>]*>([\\s\\S]*?)<\\/p>`, 'g'))].map(match => match[1]);
    for (const paragraph of editorial.paragraphs) assert.ok(paragraphs.includes(escapeHtml(paragraph[key])), `${label}: ${lang} paragraph missing or unescaped`);
  }
}

test('project-path build preserves the exhibition, escapes content, and excludes drafts and unused assets', async () => {
  const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const temporary = await mkdtemp(path.join(tmpdir(), 'nailoong-build-test-'));
  try {
    for (const name of ['scripts', 'public', 'content']) await cp(path.join(source, name), path.join(temporary, name), { recursive: true });
    const contentPath = path.join(temporary, 'content/artworks.json');
    const data = JSON.parse(await readFile(contentPath));
    const settingsPath = path.join(temporary, 'content/settings.json');
    const settings = JSON.parse(await readFile(settingsPath));
    settings.opening.paragraphs[0].zh += ' <script>opening editor text</script>';
    settings.closing.paragraphs[0].en += ' <script>closing editor text</script> & return.';
    await writeFile(settingsPath, JSON.stringify(settings));
    const expectedPublic = data.artworks.filter(art => art.publish);
    const expectedImageCount = expectedPublic.reduce((total, art) => total + (art.panels?.length || 1), 0);
    await writeFile(path.join(temporary, 'public/assets/artworks/unused-test-fixture.webp'), 'unused asset fixture');
    const original = data.artworks.find(art => art.slug === 'series');
    const draft = structuredClone(original);
    Object.assign(draft, { id: 'DRAFT-SERIES', slug: 'unpublished-series', title: 'PRIVATE_DRAFT_MARKER', publish: false });
    const privateAssets = [];
    for (const [index, panel] of draft.panels.entries()) {
      for (const kind of ['thumb', 'display', 'full']) {
        const asset = `assets/artworks/private-panel-${index}-${kind}.webp`;
        await cp(path.join(temporary, 'public', panel.image[kind]), path.join(temporary, 'public', asset));
        panel.image[kind] = asset;
        privateAssets.push(asset);
      }
    }
    draft.image = structuredClone(draft.panels[0].image);
    data.artworks.push(draft);
    const escaped = [...expectedPublic].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))[0];
    escaped.title = '<script>untrusted title</script>';
    escaped.creation.tool = '<img src=x onerror=alert(1)>';
    original.panels[1].title = '<b>untrusted panel</b>';
    const ordinary = expectedPublic.filter(art => art.descriptionFormat !== 'matrix' && art.description.trim());
    ordinary[0].descriptionEn = 'A <script>alert("translation")</script> & an image.';
    delete ordinary[1].descriptionEn;
    ordinary[2].descriptionEn = '   ';
    expectedPublic.find(art => !art.description.trim()).descriptionEn = 'ORPHAN_TRANSLATION_MUST_NOT_RENDER';
    expectedPublic.find(art => art.descriptionFormat === 'matrix').descriptionEn = 'MATRIX_TRANSLATION_MUST_NOT_RENDER';
    await writeFile(contentPath, JSON.stringify(data));
    execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: temporary, env: { ...process.env, BASE_PATH: '/nailoong-museum' }, stdio: 'pipe' });

    const dist = path.join(temporary, 'dist');
    const html = relative => readFile(path.join(dist, relative, 'index.html'), 'utf8');
    const api = JSON.parse(await readFile(path.join(dist, 'api/artworks.json')));
    assert.equal(api.artworks.length, expectedPublic.length);
    const site = JSON.parse(await readFile(path.join(dist, 'api/site.json')));
    assert.equal(site.artworkCount, expectedPublic.length);
    assert.equal(site.imageCount, expectedImageCount);
    assert.ok(!api.artworks.some(art => art.id === draft.id));
    for (const asset of privateAssets) await assert.rejects(access(path.join(dist, asset)));
    for (const route of ['studio', `works/${draft.slug}`, `gallery/${draft.slug}`]) await assert.rejects(access(path.join(dist, route, 'index.html')));
    for (const asset of ['studio.mjs', 'image-tools.mjs', 'vendor', 'assets/artworks/unused-test-fixture.webp']) await assert.rejects(access(path.join(dist, asset)));
    const sitemap = await readFile(path.join(dist, 'sitemap.xml'), 'utf8');
    assert.ok(!sitemap.includes(draft.slug));
    assert.ok(!sitemap.includes('/studio/'));
    assert.ok(sitemap.includes(`${settings.siteUrl.replace(/\/$/, '')}/closing/`), 'closing page is absent from sitemap');
    assert.ok(sitemap.includes(`${settings.siteUrl.replace(/\/$/, '')}/gallery/</loc>`), 'opening page is absent from sitemap');
    assert.ok(!api.artworks.some(art => art.slug === 'closing'), 'closing text is counted as an artwork');
    const chapterStarts = settings.chapters.map(chapter => ({...chapter, index:api.artworks.findIndex(art => art.slug === chapter.startSlug)}));
    assert.ok(chapterStarts.every((chapter, index) => chapter.index >= 0 && (!index || chapter.index > chapterStarts[index - 1].index)), 'chapters must begin at ordered published works');
    assert.equal(chapterStarts[0].index, 0, 'first artwork has no chapter');

    const detail = await html(`works/${escaped.slug}`);
    assert.ok(detail.includes('&lt;script&gt;untrusted title&lt;/script&gt;'));
    assert.ok(detail.includes('&lt;img src=x onerror=alert(1)&gt;'));
    assert.ok(!detail.includes('<script>untrusted title'));
    for (const [index, art] of api.artworks.entries()) {
      const artDetail = await html(`works/${art.slug}`);
      const room = await html(`gallery/${art.slug}`);
      assertDescriptions(artDetail, [art], `detail ${art.slug}`);
      assertDescriptions(room, [art], `gallery ${art.slug}`);
      const previous = api.artworks[index - 1];
      const next = api.artworks[index + 1];
      const previousLinks = room.match(/<a\b[^>]*\bdata-prev\b[^>]*>/g) || [];
      const nextLinks = room.match(/<a\b[^>]*\bdata-next\b[^>]*>/g) || [];
      assert.equal(previousLinks.length, 1, `${art.slug}: previous artwork or opening control missing`);
      assert.equal(nextLinks.length, 1, `${art.slug}: next artwork or closing control missing`);
      if (previous) assert.ok(previousLinks[0].includes(`/nailoong-museum/gallery/${previous.slug}/`));
      else {
        assert.ok(previousLinks[0].includes('href="/nailoong-museum/gallery/"'), `${art.slug}: first artwork does not return to opening`);
        assert.match(room, /<a\b[^>]*\bdata-prev\b[^>]*>[\s\S]*?开幕词[\s\S]*?<\/a>/);
      }
      if (next) assert.ok(nextLinks[0].includes(`/nailoong-museum/gallery/${next.slug}/`));
      else {
        assert.ok(nextLinks[0].includes('/nailoong-museum/closing/'), `${art.slug}: final artwork does not lead to closing`);
        assert.match(room, /<a\b[^>]*\bdata-next\b[^>]*>[\s\S]*?闭幕[\s\S]*?<\/a>/);
      }
      const expectedChapter = chapterStarts.filter(chapter => chapter.index <= index).at(-1);
      const markers = room.match(/<[^>]+\bclass="[^"]*\bchapter-marker\b[^"]*"[^>]*>/g) || [];
      assert.equal(markers.length, 1, `${art.slug}: chapter marker missing or duplicated`);
      assert.ok(markers[0].includes(`data-chapter="${expectedChapter.id}"`), `${art.slug}: wrong chapter`);
      assert.equal(/\bchapter-start\b/.test(markers[0]), index === expectedChapter.index, `${art.slug}: chapter opening emphasis appears on the wrong work`);
      assert.ok(room.includes(escapeHtml(expectedChapter.title)), `${art.slug}: chapter title missing`);
      assert.ok(room.includes(escapeHtml(expectedChapter.titleEn)), `${art.slug}: English chapter title missing`);
      const moment = settings.moments?.[art.slug];
      if (moment) {
        assert.ok(room.includes(escapeHtml(moment.zh)), `${art.slug}: stage label missing`);
        assert.ok(room.includes(escapeHtml(moment.en)), `${art.slug}: English stage label missing`);
      }
      assert.ok(room.includes('work-info'), `${art.slug}: gallery omits artwork information`);
      assert.ok(room.includes(art.medium), `${art.slug}: gallery omits medium`);
      if (art.descriptionFormat === 'matrix') {
        for (const row of art.description.split('\n')) assert.ok(room.includes(row));
      } else if (art.description.trim()) {
        assert.ok(room.includes(art.description), `${art.slug}: gallery omits description`);
      } else {
        assert.ok(!room.includes('class="work-description"'), `${art.slug}: removed description still has a paragraph`);
      }
    }
    const galleryEntry = await html('gallery');
    assertEditorial(galleryEntry, settings.opening, 'opening');
    assertDescriptions(galleryEntry, [], 'opening');
    assert.ok(galleryEntry.includes('opening-page'), 'gallery entry is not an opening page');
    assert.ok(galleryEntry.includes('data-gallery'), 'opening page does not activate keyboard navigation');
    assert.ok(!galleryEntry.includes('<meta name="robots" content="noindex'), 'opening page remains excluded as a duplicate artwork');
    const openingMain = galleryEntry.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1] || '';
    const openingPrevious = openingMain.match(/<a\b[^>]*\bdata-prev\b[^>]*>/g) || [];
    const openingNext = openingMain.match(/<a\b[^>]*\bdata-next\b[^>]*>/g) || [];
    assert.equal(openingPrevious.length, 1, 'opening page needs one previous control');
    assert.equal(openingNext.length, 1, 'opening page needs one next control');
    assert.ok(openingPrevious[0].includes('href="/nailoong-museum/"'), 'opening previous control does not lead home');
    assert.ok(openingNext[0].includes(`/nailoong-museum/gallery/${api.artworks[0].slug}/`), 'opening next control skips the first artwork');
    assert.match(openingMain, /<a\b[^>]*\bdata-next\b[^>]*>[\s\S]*?开始观看[\s\S]*?<\/a>/);
    const groupDetail = await html('works/series');
    const groupGallery = await html('gallery/series');
    const workIndex = await html('works');
    assertDescriptions(workIndex, api.artworks, 'artwork information index');
    assert.ok(workIndex.includes('&lt;b&gt;untrusted panel&lt;/b&gt;'));
    assert.ok(!groupGallery.includes('<figcaption'), 'group gallery restores individual image labels');
    assert.ok(!groupDetail.includes('<figcaption'), 'group detail restores individual image labels');
    for (const panel of original.panels) {
      assert.ok(groupDetail.includes(panel.image.display), `detail omits ${panel.title}`);
      assert.ok(groupGallery.includes(panel.image.display), `gallery omits ${panel.title}`);
    }
    assert.ok(groupDetail.includes('Gemini'));
    assert.ok(groupDetail.includes('Simon'));
    assert.ok(groupGallery.includes('Gemini'));
    assert.ok(groupGallery.includes('Simon'));
    assert.ok(workIndex.includes('Simon'));
    for (const art of api.artworks) {
      assert.ok(workIndex.includes(`/works/${art.slug}/`), `artwork information omits ${art.slug}`);
      if (art.reference.url) assert.ok(workIndex.includes(escapeHtml(art.reference.url)), `artwork information omits ${art.slug} source`);
    }
    const separate = await html('works/light-and-shadow');
    assert.ok(separate.includes('正在思考'));
    assert.ok((await html('works/paint-pot-angel')).includes('桶中之脑'));
    assert.equal(api.artworks.at(-1).slug, 'salvator');
    const matrix = api.artworks.find(art => art.descriptionFormat === 'matrix');
    const matrixDetail = await html(`works/${matrix.slug}`);
    for (const row of matrix.description.split('\n')) assert.ok(matrixDetail.includes(row));
    assert.ok(matrixDetail.includes('matrix'));

    const home = await html('');
    assertDescriptions(home, [], 'home');
    assert.ok(!/\bclass="[^"]*\b(?:work-row|works-section)\b/.test(home), 'home still contains an artwork overview');
    assert.ok(!home.includes('WORKS IN THE EXHIBITION'), 'home still advertises an artwork overview');
    assert.ok(!home.includes('opening-note') && !home.includes('opening-page'), 'home still contains the opening text');
    for (const paragraph of settings.opening.paragraphs) {
      assert.ok(!home.includes(escapeHtml(paragraph.zh)), 'home still contains an opening paragraph');
      assert.ok(!home.includes(escapeHtml(paragraph.en)), 'home still contains an English opening paragraph');
    }
    const homeGalleryLinks = [...home.matchAll(/href="([^"]*\/gallery\/[^"]*)"/g)].map(match => match[1]);
    assert.ok(homeGalleryLinks.length >= 2, 'home gallery entry or hero image link is missing');
    assert.ok(homeGalleryLinks.every(url => url === '/nailoong-museum/gallery/'), 'home link bypasses the opening page');
    assert.ok(home.includes('进入画廊'));
    assert.ok(home.includes('奶·龙'));
    assert.ok(home.includes('NAILOONG, REFRAMED'));
    assert.match(home, /THE EXHIBITION<\/p><p>奶龙即不同<br><em>Nailoong is different\.<\/em>/);
    for (const route of ['works', 'about', 'credits', 'closing']) await access(path.join(dist, route, 'index.html'));
    assert.ok((await html('credits')).includes('data-redirect="/nailoong-museum/works/"'));
    const closing = await html('closing');
    assertEditorial(closing, settings.closing, 'closing');
    assert.ok(!closing.includes('data-gallery'), 'closing page activates gallery keyboard navigation');
    assert.ok(!closing.includes('data-next'), 'closing page automatically continues the exhibition');
    const closingMain = closing.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1] || '';
    assert.match(closingMain, /<a\b[^>]*href="\/nailoong-museum\/"[^>]*>[\s\S]*?(?:返回|回到)首页[\s\S]*?<\/a>/);
    const restart = [...closingMain.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].find(match => match[2].includes('重新观看'));
    assert.ok(restart && restart[1] === '/nailoong-museum/gallery/', 'closing restart link bypasses the opening page');
    const files = await readdir(dist, { recursive: true });
    let checked = 0;
    for (const file of files.filter(filename => filename.endsWith('.html'))) {
      const content = await readFile(path.join(dist, file), 'utf8');
      assert.ok(!content.includes('PRIVATE_DRAFT_MARKER'), `${file}: draft leaked`);
      assert.ok(!content.includes('<script>untrusted title'), `${file}: unescaped title`);
      assert.ok(!content.includes('<b>untrusted panel</b>'), `${file}: unescaped panel`);
      assert.ok(!content.includes('<img src=x onerror=alert(1)>'), `${file}: unescaped tool`);
      assert.ok(!content.includes('<script>alert("translation")</script>'), `${file}: unescaped English description`);
      assert.ok(!content.includes('<script>opening editor text</script>'), `${file}: unescaped opening text`);
      assert.ok(!content.includes('<script>closing editor text</script>'), `${file}: unescaped closing text`);
      assert.ok(!content.includes('xiaohongshu.com/explore/6a8ee0a0000000000a00829d'), `${file}: retired inspiration post link remains`);
      assert.ok(!content.includes('ORPHAN_TRANSLATION_MUST_NOT_RENDER'), `${file}: English renders without a Chinese description`);
      assert.ok(!content.includes('MATRIX_TRANSLATION_MUST_NOT_RENDER'), `${file}: matrix is translated`);
      assert.ok(!content.includes('/studio/'), `${file}: maintenance link remains`);
      const header = content.match(/<header\b[^>]*>[\s\S]*?<\/header>/)?.[0];
      assert.ok(header, `${file}: public header missing`);
      assert.ok(header.includes('/nailoong-museum/works/'), `${file}: artwork information navigation missing`);
      assert.ok(header.includes('作品说明'), `${file}: artwork information label missing`);
      assert.ok(header.includes('/nailoong-museum/about/'), `${file}: about navigation missing`);
      assert.ok(header.includes('关于展览'), `${file}: about navigation label missing`);
      assert.ok(!content.includes('<footer'), `${file}: removed footer remains`);
      assert.ok(!content.includes('<p class="work-description"></p>'), `${file}: empty description paragraph remains`);
      assert.ok(!content.includes('data-return='), `${file}: removed Escape return action remains`);
      assert.ok(!content.includes('Esc 返回'), `${file}: removed Escape hint remains`);
      const urls = [...content.matchAll(/(?:href|src|data-full-src)="([^"#]+)"/g)].map(match => match[1]);
      for (const match of content.matchAll(/srcset="([^"]+)"/g)) urls.push(...match[1].split(',').map(candidate => candidate.trim().split(/\s+/)[0]));
      for (const url of urls) {
        if (!url.startsWith('/')) continue;
        assert.ok(url.startsWith('/nailoong-museum/'), `${file}: incorrect prefix ${url}`);
        const pathname = url.split(/[?#]/)[0].slice('/nailoong-museum/'.length);
        const target = path.join(dist, pathname, pathname.endsWith('/') || !pathname ? 'index.html' : '');
        await access(target);
        checked++;
      }
    }
    assert.ok(checked > 100);
  } finally {
    const resolved = path.resolve(temporary);
    const expectedParent = path.resolve(tmpdir());
    if (path.basename(resolved).startsWith('nailoong-build-test-') && path.dirname(resolved) === expectedParent) await rm(resolved, { recursive: true, force: true });
  }
});
