import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildRuntime } from '../scripts/build.mjs';
import { dataDirectory } from '../server/paths.mjs';

test('rebuild preserves runtime state outside output and rejects legacy embedded data',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'mq-rebuild-'));
  try {
    for(const folder of ['server','public','node_modules','data'])await mkdir(path.join(root,folder));
    await writeFile(path.join(root,'package.json'),JSON.stringify({version:'fixture'}));
    await writeFile(path.join(root,'package-lock.json'),'{}');
    await writeFile(path.join(root,'server','index.mjs'),'export const fixture=true;');
    const state=path.join(root,'data','state.json');await writeFile(state,'retained owner state');
    assert.equal(dataDirectory(path.join(root,'dist')),path.join(root,'data'));
    await buildRuntime(root,'fixture-source',false);
    await writeFile(path.join(root,'dist','obsolete.txt'),'obsolete output');
    await buildRuntime(root,'fixture-source-two',false);
    assert.equal(await readFile(state,'utf8'),'retained owner state');
    await assert.rejects(readFile(path.join(root,'dist','obsolete.txt')),{code:'ENOENT'});
    await mkdir(path.join(root,'dist','data'));await writeFile(path.join(root,'dist','data','state.json'),'legacy owner state');
    await assert.rejects(buildRuntime(root,'third-source',false),/stopped without deleting/);
    assert.equal(await readFile(path.join(root,'dist','data','state.json'),'utf8'),'legacy owner state');
  } finally { await rm(root,{recursive:true,force:true}); }
});
