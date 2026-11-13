export function uploadIso(file,name,csrf,onProgress){
  const request=new XMLHttpRequest();
  const promise=new Promise((resolve,reject)=>{
    request.open('POST',`/api/media?name=${encodeURIComponent(name)}`);
    request.setRequestHeader('Content-Type','application/octet-stream');
    request.setRequestHeader('X-CSRF-Token',csrf);
    request.upload.onprogress=event=>onProgress(event.loaded,event.lengthComputable?event.total:file.size);
    request.onload=()=>{let body;try{body=JSON.parse(request.responseText);}catch{return reject(new Error('Upload response could not be read.'));}request.status>=200&&request.status<300?resolve(body):reject(new Error(body.error||'Upload failed.'));};
    request.onerror=()=>reject(new Error('Upload connection was interrupted.'));
    request.onabort=()=>reject(new Error('Upload cancelled. No existing media was changed.'));
    request.send(file);
  });
  return {promise,abort:()=>{if(request.readyState!==4)request.abort();}};
}
