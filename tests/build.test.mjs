import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, writeFile, readdir, access, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

test('project-path build preserves the exhibition, escapes content, and excludes drafts and unused assets', async () => {
  const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const temporary = await mkdtemp(path.join(tmpdir(), 'nailoong-build-test-'));
  try {
    for (const name of ['scripts', 'public', 'content']) await cp(path.join(source, name), path.join(temporary, name), { recursive: true });
    const contentPath = path.join(temporary, 'content/artworks.json');
    const data = JSON.parse(await readFile(contentPath));
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

    const detail = await html(`works/${escaped.slug}`);
    assert.ok(detail.includes('&lt;script&gt;untrusted title&lt;/script&gt;'));
    assert.ok(detail.includes('&lt;img src=x onerror=alert(1)&gt;'));
    assert.ok(!detail.includes('<script>untrusted title'));
    for (const [index, art] of api.artworks.entries()) {
      await access(path.join(dist, 'works', art.slug, 'index.html'));
      const room = await html(`gallery/${art.slug}`);
      const previous = api.artworks[index - 1];
      const next = api.artworks[index + 1];
      const previousLinks = room.match(/<a\b[^>]*\bdata-prev\b[^>]*>/g) || [];
      const nextLinks = room.match(/<a\b[^>]*\bdata-next\b[^>]*>/g) || [];
      assert.equal(previousLinks.length, previous ? 1 : 0, `${art.slug}: previous control does not respect exhibition boundary`);
      assert.equal(nextLinks.length, next ? 1 : 0, `${art.slug}: next control does not respect exhibition boundary`);
      if (previous) assert.ok(previousLinks[0].includes(`/nailoong-museum/gallery/${previous.slug}/`));
      if (next) assert.ok(nextLinks[0].includes(`/nailoong-museum/gallery/${next.slug}/`));
      if (!previous || !next) assert.ok(room.includes('aria-disabled="true"'), `${art.slug}: end of exhibition is not indicated`);
      assert.ok(room.includes('work-info'), `${art.slug}: gallery omits artwork information`);
      assert.ok(room.includes(art.medium), `${art.slug}: gallery omits medium`);
      if (art.descriptionFormat === 'matrix') {
        for (const row of art.description.split('\n')) assert.ok(room.includes(row));
      } else {
        assert.ok(room.includes(art.description), `${art.slug}: gallery omits description`);
      }
    }
    const galleryEntry = await html('gallery');
    assert.ok(galleryEntry.includes(escaped.image.display) || galleryEntry.includes(`/gallery/${escaped.slug}/`));
    const groupDetail = await html('works/series');
    const groupGallery = await html('gallery/series');
    const workIndex = await html('works');
    assert.ok(workIndex.includes('&lt;b&gt;untrusted panel&lt;/b&gt;'));
    assert.ok(!groupGallery.includes('<figcaption'), 'group gallery restores individual image labels');
    assert.ok(!groupDetail.includes('<figcaption'), 'group detail restores individual image labels');
    for (const panel of original.panels) {
      assert.ok(groupDetail.includes(panel.image.display), `detail omits ${panel.title}`);
      assert.ok(groupGallery.includes(panel.image.display), `gallery omits ${panel.title}`);
    }
    assert.ok(groupDetail.includes('Gemini'));
    assert.ok(groupDetail.includes('原作者'));
    assert.ok(groupGallery.includes('Gemini'));
    assert.ok(groupGallery.includes('原作者'));
    for (const art of api.artworks) {
      assert.ok(workIndex.includes(`/works/${art.slug}/`), `artwork information omits ${art.slug}`);
      if (art.reference.url) assert.ok(workIndex.includes(art.reference.url), `artwork information omits ${art.slug} source`);
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
    assert.ok(home.includes('进入画廊'));
    assert.ok(home.includes('奶·龙'));
    assert.ok(home.includes('NAILOONG, REFRAMED'));
    assert.match(home, /奶龙即不同[\s\S]*<em>Nailoong is different<\/em>/);
    for (const route of ['works', 'about', 'credits']) await access(path.join(dist, route, 'index.html'));
    assert.ok((await html('credits')).includes('data-redirect="/nailoong-museum/works/"'));
    const files = await readdir(dist, { recursive: true });
    let checked = 0;
    for (const file of files.filter(filename => filename.endsWith('.html'))) {
      const content = await readFile(path.join(dist, file), 'utf8');
      assert.ok(!content.includes('PRIVATE_DRAFT_MARKER'), `${file}: draft leaked`);
      assert.ok(!content.includes('<script>untrusted title'), `${file}: unescaped title`);
      assert.ok(!content.includes('<b>untrusted panel</b>'), `${file}: unescaped panel`);
      assert.ok(!content.includes('<img src=x onerror=alert(1)>'), `${file}: unescaped tool`);
      assert.ok(!content.includes('/studio/'), `${file}: maintenance link remains`);
      const header = content.match(/<header\b[^>]*>[\s\S]*?<\/header>/)?.[0];
      assert.ok(header, `${file}: public header missing`);
      assert.ok(header.includes('/nailoong-museum/works/'), `${file}: artwork information navigation missing`);
      assert.ok(header.includes('作品说明'), `${file}: artwork information label missing`);
      assert.ok(header.includes('/nailoong-museum/about/'), `${file}: about navigation missing`);
      assert.ok(header.includes('关于展览'), `${file}: about navigation label missing`);
      assert.ok(!content.includes('<footer'), `${file}: removed footer remains`);
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
