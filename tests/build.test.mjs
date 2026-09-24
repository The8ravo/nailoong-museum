import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, writeFile, readdir, access, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

test('production build resolves project-path links and excludes draft records and assets',async()=>{
  const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const temporary=await mkdtemp(path.join(tmpdir(),'nailoong-build-test-'));
  try {
    for(const name of ['scripts','public','content'])await cp(path.join(source,name),path.join(temporary,name),{recursive:true});
    const contentPath=path.join(temporary,'content/artworks.json');
    const data=JSON.parse(await readFile(contentPath));
    const draft=data.artworks.find(a=>a.section==='poster');
    if(draft)draft.publish=false;
    const escaped=data.artworks.find(a=>a.publish);escaped.title='<script>untrusted title</script>';
    await writeFile(contentPath,JSON.stringify(data));
    execFileSync(process.execPath,['scripts/build.mjs'],{cwd:temporary,env:{...process.env,BASE_PATH:'/nailoong-museum'},stdio:'pipe'});
    const dist=path.join(temporary,'dist');
    const api=JSON.parse(await readFile(path.join(dist,'api/artworks.json')));
    if(draft){
      assert.ok(!api.artworks.some(a=>a.id===draft.id));
      await assert.rejects(access(path.join(dist,draft.image.full)));
      assert.ok(!(await readFile(path.join(dist,'sitemap.xml'),'utf8')).includes(draft.slug));
    }
    const detail=await readFile(path.join(dist,'works',escaped.slug,'index.html'),'utf8');
    assert.ok(detail.includes('&lt;script&gt;untrusted title&lt;/script&gt;'));
    assert.ok(!detail.includes('<script>untrusted title'));
    const files=await readdir(dist,{recursive:true});
    let checked=0;
    for(const file of files.filter(f=>f.endsWith('.html'))){
      const html=await readFile(path.join(dist,file),'utf8');
      for(const match of html.matchAll(/(?:href|src|data-full-src)="([^"#]+)"/g)){
        const url=match[1];if(!url.startsWith('/'))continue;
        assert.ok(url.startsWith('/nailoong-museum/'),`${file}: incorrect prefix ${url}`);
        const pathname=url.split(/[?#]/)[0].slice('/nailoong-museum/'.length);
        const target=path.join(dist,pathname,pathname.endsWith('/')||!pathname?'index.html':'');
        await access(target);checked++;
      }
    }
    assert.ok(checked>100);
  } finally {
    if(path.basename(temporary).startsWith('nailoong-build-test-')&&path.dirname(temporary)===tmpdir())await rm(temporary,{recursive:true,force:true});
  }
});
