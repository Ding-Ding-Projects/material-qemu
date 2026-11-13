import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,readFile,readdir,rm,symlink } from 'node:fs/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import os from 'node:os';
import { receiveIso } from '../server/media.mjs';

function stream(chunks,length){const request=Readable.from(chunks);request.headers=length===undefined?{}:{'content-length':String(length)};return request;}
async function fixture(run){const dir=await mkdtemp(path.join(os.tmpdir(),'mq-upload-'));try{await mkdir(path.join(dir,'media'));await run(dir);}finally{await rm(dir,{recursive:true,force:true});}}
test('ISO upload streams exact fixture bytes and refuses concurrent overwrite',()=>fixture(async dir=>{
  const contents=Buffer.from('Upload transport fixture, not bootable installation media.');
  const outcomes=await Promise.allSettled([receiveIso(stream([contents],contents.length),dir,'fixture.iso',1024),receiveIso(stream([Buffer.from('other')],5),dir,'fixture.iso',1024)]);
  assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,1);assert.equal(outcomes.filter(o=>o.status==='rejected').length,1);
  const stored=await readFile(path.join(dir,'media','fixture.iso'));assert.ok(stored.equals(contents)||stored.equals(Buffer.from('other')));
  assert.deepEqual(await readdir(path.join(dir,'media')),['fixture.iso']);
}));
test('upload overflow, invalid names, abort and length mismatch leave no partial file',()=>fixture(async dir=>{
  for(const name of ['../escape.iso','bad.iso/next','file.txt','bad,option.iso'])await assert.rejects(receiveIso(stream([Buffer.from('x')],1),dir,name,10));
  await assert.rejects(receiveIso(stream([Buffer.from('123456'),Buffer.from('78901')]),dir,'large.iso',10),/exceeds/);
  await assert.rejects(receiveIso(stream([Buffer.from('short')],8),dir,'short.iso',10),/length/);
  const broken=Readable.from((async function*(){yield Buffer.from('part');throw new Error('simulated disconnect');})());broken.headers={};await assert.rejects(receiveIso(broken,dir,'aborted.iso',10),/disconnect/);
  assert.deepEqual(await readdir(path.join(dir,'media')),[]);
}));
test('upload refuses a media-directory symlink escape',async t=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'mq-upload-link-'));try{await mkdir(path.join(dir,'outside'));await mkdir(path.join(dir,'data'));try{await symlink(path.join(dir,'outside'),path.join(dir,'data','media'),process.platform==='win32'?'junction':'dir');}catch(e){if(e.code==='EPERM')return t.skip('Host does not allow unprivileged directory links.');throw e;}await assert.rejects(receiveIso(stream([Buffer.from('x')],1),path.join(dir,'data'),'escape.iso'),/symbolic link/);assert.deepEqual(await readdir(path.join(dir,'outside')),[]);}finally{await rm(dir,{recursive:true,force:true});}
});
