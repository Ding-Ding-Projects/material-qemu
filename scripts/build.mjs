import { mkdir, cp, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export async function buildRuntime(root, source, dirty) {
  const output = path.join(root, 'dist');
  try {
    await stat(path.join(output, 'data'));
    throw new Error('Existing runtime data was found inside dist/data. Rebuild stopped without deleting it. Move that data through a reviewed backup/recovery procedure before rebuilding.');
  } catch(error) { if(error.code !== 'ENOENT') throw error; }
  await rm(output, { recursive:true, force:true });
  await mkdir(output, { recursive:true });
  for(const folder of ['server','public','node_modules']) await cp(path.join(root,folder),path.join(output,folder),{recursive:true});
  for(const file of ['package.json','package-lock.json']) await cp(path.join(root,file),path.join(output,file));
  const receipt={version:JSON.parse(await readFile(path.join(root,'package.json'),'utf8')).version,source,dirty,builtAt:new Date().toISOString(),lockSha256:createHash('sha256').update(await readFile(path.join(root,'package-lock.json'))).digest('hex'),runtime:'node >=22',entrypoint:'server/index.mjs',dataDirectory:'../data'};
  await writeFile(path.join(output,'build-receipt.json'),JSON.stringify(receipt,null,2));
  return receipt;
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const root=process.cwd();
  // A checkout records its commit with git. A source archive without .git (the
  // portable build companion unpacks one) passes SOURCE_REVISION instead.
  let source, dirty;
  try {
    source=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
    dirty=Boolean(execFileSync('git',['status','--porcelain','--untracked-files=all'],{encoding:'utf8'}).trim());
  } catch {
    if(!/^[0-9a-f]{40}$/.test(process.env.SOURCE_REVISION||'')) throw new Error('This folder is not a git checkout and SOURCE_REVISION is not set, so the build cannot record its source.');
    source=process.env.SOURCE_REVISION;
    dirty=false;
  }
  const receipt=await buildRuntime(root,source,dirty);
  console.log(`Runnable runtime staged in dist. Source: ${source}. Uncommitted source: ${receipt.dirty}. This is not an installer.`);
}
