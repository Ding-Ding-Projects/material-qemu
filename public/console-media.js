export const RECORDING_LIMITS={milliseconds:30000,bytes:16*1024*1024,framesPerSecond:10};
export function frameDimensions(frame){if(!frame||!Number.isInteger(frame.width)||!Number.isInteger(frame.height)||frame.width<1||frame.height<1||frame.width*frame.height>4096*2160)throw new Error('A connected framebuffer up to 4096 × 2160 pixels is required.');return {width:frame.width,height:frame.height};}
export function downloadBlob(blob,name){if(!blob?.size)throw new Error('No export data was produced.');const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
export function frameCanvas(frame){const size=frameDimensions(frame),canvas=document.createElement('canvas');canvas.width=size.width;canvas.height=size.height;canvas.getContext('2d').putImageData(frame,0,0);return canvas;}
export function pngBlob(canvas){return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?.size?resolve(blob):reject(new Error('PNG encoding did not produce an image.')),'image/png'));}
export function recordingMime(supported){return ['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(type=>supported(type))||null;}
export function recordFramebuffer(readFrame,onProgress){
  if(typeof MediaRecorder==='undefined')throw new Error('Recording is unavailable in this browser.');
  const mimeType=recordingMime(type=>MediaRecorder.isTypeSupported(type));if(!mimeType)throw new Error('This browser has no supported WebM recording encoder.');
  const canvas=frameCanvas(readFrame());if(typeof canvas.captureStream!=='function')throw new Error('Canvas recording is unavailable in this browser.');
  const stream=canvas.captureStream(RECORDING_LIMITS.framesPerSecond),recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:1500000});
  const started=performance.now();let chunks=[],bytes=0,frames=1,timer,deadline,reason='user',settled=false;
  const cleanup=()=>{clearInterval(timer);clearTimeout(deadline);stream.getTracks().forEach(track=>track.stop());};
  const stop=(why='user')=>{reason=why;clearInterval(timer);clearTimeout(deadline);if(recorder.state!=='inactive')recorder.stop();};
  const promise=new Promise((resolve,reject)=>{
    const fail=error=>{if(settled)return;settled=true;cleanup();if(recorder.state!=='inactive')recorder.stop();chunks=[];reject(error);};
    recorder.ondataavailable=event=>{if(!event.data.size||settled)return;bytes+=event.data.size;if(bytes>RECORDING_LIMITS.bytes){fail(new Error('Recording exceeded 16 MiB. No oversized export was created.'));return;}chunks.push(event.data);};
    recorder.onerror=()=>fail(new Error('The browser recording encoder failed.'));
    recorder.onstop=()=>{if(settled)return;settled=true;cleanup();if(!chunks.length)return reject(new Error('Recording produced no video data.'));const blob=new Blob(chunks,{type:mimeType});chunks=[];resolve({blob,frames,duration:performance.now()-started,reason});};
    recorder.start(500);
    timer=setInterval(()=>{try{const frame=readFrame();frameDimensions(frame);if(frame.width!==canvas.width||frame.height!==canvas.height){canvas.width=frame.width;canvas.height=frame.height;}canvas.getContext('2d').putImageData(frame,0,0);frames++;onProgress({elapsed:performance.now()-started,bytes,frames});}catch(error){fail(error);}},1000/RECORDING_LIMITS.framesPerSecond);
    deadline=setTimeout(()=>stop('time-limit'),RECORDING_LIMITS.milliseconds);
  });
  return {promise,stop};
}
export class FrameAnnotations {
  constructor(canvas,frame,onError,onChange=()=>{}){this.canvas=canvas;this.base=frameCanvas(frame);canvas.width=frame.width;canvas.height=frame.height;this.operations=[];this.color='#ff8a4c';this.width=4;this.onError=onError;this.onChange=onChange;this.paint();
    canvas.onpointerdown=event=>{if(this.operations.length>=100)return onError(new Error('The annotation limit is 100 operations. Export or undo before adding more.'));canvas.setPointerCapture(event.pointerId);this.active={type:'stroke',color:this.color,width:this.width,points:[this.point(event)]};this.operations.push(this.active);this.onChange();};
    canvas.onpointermove=event=>{if(!this.active)return;if(this.active.points.length<500)this.active.points.push(this.point(event));this.paint();};
    canvas.onpointerup=canvas.onpointercancel=()=>{this.active=null;this.paint();};
  }
  point(event){const rect=this.canvas.getBoundingClientRect();return {x:Math.max(0,Math.min(this.canvas.width,(event.clientX-rect.left)*this.canvas.width/rect.width)),y:Math.max(0,Math.min(this.canvas.height,(event.clientY-rect.top)*this.canvas.height/rect.height))};}
  add(operation){if(this.operations.length>=100)throw new Error('The annotation limit is 100 operations.');this.operations.push({...operation,color:this.color,width:this.width});this.onChange();this.paint();}
  undo(){this.operations.pop();this.onChange();this.paint();}
  clear(){this.add({type:'clear'});}
  paint(){const context=this.canvas.getContext('2d');context.clearRect(0,0,this.canvas.width,this.canvas.height);context.drawImage(this.base,0,0);for(const operation of this.operations){if(operation.type==='clear'){context.clearRect(0,0,this.canvas.width,this.canvas.height);context.drawImage(this.base,0,0);continue;}context.strokeStyle=operation.color;context.fillStyle=operation.color;context.lineWidth=operation.width;context.lineCap='round';if(operation.type==='text'){context.font='20px sans-serif';context.fillText(operation.text,operation.x,operation.y);continue;}context.beginPath();operation.points.forEach((point,index)=>index?context.lineTo(point.x,point.y):context.moveTo(point.x,point.y));context.stroke();}}
}
