import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { validateCatalog, publishedArtworks, safeAsset, safeUrl } from '../public/catalog.mjs';
const data=JSON.parse(await readFile(new URL('../content/artworks.json',import.meta.url)));
test('all published records are complete and point to existing image files',async()=>{
  validateCatalog(data);
  const published=publishedArtworks(data);
  assert.ok(published.length>0);
  for(const a of published)for(const kind of ['thumb','display','full'])await access(new URL('../public/'+a.image[kind],import.meta.url));
});
test('drafts are excluded from the public provider',()=>{
  const fixture=structuredClone(data);fixture.artworks[0].publish=false;
  assert.ok(!publishedArtworks(fixture).some(a=>a.id===fixture.artworks[0].id));
});
test('duplicate identifiers and route traversal fail validation',()=>{
  const duplicate=structuredClone(data);duplicate.artworks.push(structuredClone(duplicate.artworks[0]));
  assert.throws(()=>validateCatalog(duplicate),/重复/);
  const traversal=structuredClone(data);traversal.artworks[0].slug='../studio';
  assert.throws(()=>validateCatalog(traversal),/网址/);
  assert.equal(safeAsset('assets/artworks/../../secret.png'),false);
  assert.equal(safeAsset('https://example.com/x.png'),false);
  assert.equal(safeAsset('assets/artworks/good.webp'),true);
});
test('unsafe source links and malformed image sizes are rejected',()=>{
  assert.equal(safeUrl('javascript:alert(1)'),false);assert.equal(safeUrl('https://user:pass@example.com'),false);
  const bad=structuredClone(data);bad.artworks[0].image.width=-1;
  assert.throws(()=>validateCatalog(bad),/尺寸/);
  bad.artworks[0].image.width=100;bad.artworks[0].reference.url='data:text/html,test';
  assert.throws(()=>validateCatalog(bad),/参考/);
});
