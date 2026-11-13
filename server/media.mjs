import { open, realpath, link, unlink, stat } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const MAX_ISO_BYTES=2*1024*1024*1024;
export async function receiveIso(request,dataDirectory,name,maxBytes=MAX_ISO_BYTES){
  if(typeof name!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._ -]{0,150}\.iso$/i.test(name))throw new Error('Use a plain .iso filename with letters, numbers, spaces, dots, underscores or hyphens.');
  const declared=request.headers['content-length'];
  if(declared!==undefined&&(!/^[0-9]+$/.test(declared)||Number(declared)>maxBytes||Number(declared)<1))throw new Error(`ISO upload must contain 1–${maxBytes} bytes.`);
  const root=await realpath(dataDirectory),directory=await realpath(path.join(root,'media'));
  if(directory!==path.join(root,'media'))throw new Error('Media directory must not be a symbolic link outside managed storage.');
  const destination=path.join(directory,name),temporary=path.join(directory,`.upload-${randomUUID()}.part`);
  const file=await open(temporary,'wx',0o600);let size=0,closed=false;
  try {
    for await(const chunk of request){
      size+=chunk.length;if(size>maxBytes)throw new Error(`ISO exceeds the ${maxBytes}-byte upload limit.`);
      let offset=0;while(offset<chunk.length){const result=await file.write(chunk,offset,chunk.length-offset);offset+=result.bytesWritten;}
    }
    if(!size||(declared!==undefined&&Number(declared)!==size))throw new Error('Upload length does not match the received file.');
    await file.sync();await file.close();closed=true;
    if((await stat(temporary)).size!==size)throw new Error('Stored file length did not match the upload.');
    await link(temporary,destination);
    return {name,bytes:size};
  } catch(error){if(error.code==='EEXIST')throw new Error('An ISO with this filename already exists. Choose another name; existing media is never overwritten.');throw error;}
  finally {if(!closed)await file.close().catch(()=>{});await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
}
