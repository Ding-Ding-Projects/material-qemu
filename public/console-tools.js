import { downloadBlob,frameCanvas,pngBlob,frameDimensions,recordFramebuffer,FrameAnnotations } from './console-media.js';

export function createConsoleTools({getConnection,getName,t,notify,modal,field,button,escape,changed,releaseInput}){
  let recording=null,lastRecording=null,snapshot=null,editor=null,statusText='',generation=0;
  const filename=(kind,extension,at=new Date().toISOString())=>`${String(getName()||'machine').replace(/[^a-zA-Z0-9._-]+/g,'-').slice(0,64)}-${at.replace(/[:.]/g,'-')}-${kind}.${extension}`;
  const frame=()=>{const connection=getConnection();if(!connection)throw new Error(t('Connect the console before exporting its framebuffer.','請先連接主控台，才匯出其畫面。'));const image=connection.getImageData();frameDimensions(image);return image;};
  function startRecording(){
    const connection=getConnection();frame();const ownedGeneration=generation,name=filename('recording','webm');let lastSecond=-1;
    const active=recordFramebuffer(()=>{if(getConnection()!==connection)throw new Error(t('Console connection changed.','主控台連線已更改。'));return connection.getImageData();},progress=>{const second=Math.floor(progress.elapsed/1000);if(second!==lastSecond){lastSecond=second;statusText=t(`Recording ${second}/30 seconds, ${(progress.bytes/1048576).toFixed(1)} MiB.`,`錄影 ${second}/30 秒，${(progress.bytes/1048576).toFixed(1)} MiB。`);changed();}});
    recording=active;statusText=t('Recording the actual guest framebuffer, without audio.','正在錄下實際客體畫面，不含音訊。');changed();
    active.promise.then(result=>{if(ownedGeneration!==generation)return;lastRecording={...result,name,downloaded:false};statusText=t(`Recording ready: ${(result.duration/1000).toFixed(1)} seconds. Download before reloading.`,`錄影已準備好：${(result.duration/1000).toFixed(1)} 秒，請在重新載入前下載。`);notify(statusText);}).catch(error=>{if(ownedGeneration===generation){statusText=error.message;notify(error.message);}}).finally(()=>{if(recording===active)recording=null;changed();});
  }
  function showAnnotations(){
    if(!snapshot)snapshot={frame:frame(),at:new Date().toISOString(),operations:[],dirty:false};
    const image=snapshot.frame;
    modal(t('Annotate a captured frame','標註已擷取畫面'),`<p class="muted">${t('Frozen guest frame. Edited exports are labelled annotated; the guest display is unchanged. Download before reloading.','這是已凍結的客體畫面，編輯匯出會標明已標註，客體顯示不會改變。請在重新載入前下載。')}</p><small>${t('Captured UTC','擷取時間 UTC')}: ${escape(snapshot.at)}</small><canvas id="annotation-canvas" class="annotation-canvas" aria-label="${t('Captured frame annotation surface','已擷取畫面標註範圍')}"></canvas><div class="actions">${button('annotation-undo',t('Undo','復原'))}${button('annotation-clear',t('Clear annotations','清除標註'))}${button('annotation-original',t('Download original PNG','下載原始 PNG'))}${button('annotation-new',t('Capture a new frame','擷取新畫面'))}</div><div class="form-grid">${field('annotation-color',t('Color','顏色'),'#ff8a4c','color')}${field('annotation-width',t('Stroke width','線條寬度'),4,'number','min="1" max="20"')}</div><details><summary>${t('Keyboard annotation controls','鍵盤標註控制')}</summary><div class="form-grid">${field('annotation-x',t('Start X','起點 X'),20,'number',`min="0" max="${image.width}"`)}${field('annotation-y',t('Start Y','起點 Y'),30,'number',`min="0" max="${image.height}"`)}${field('annotation-x2',t('End X','終點 X'),Math.min(160,image.width),'number',`min="0" max="${image.width}"`)}${field('annotation-y2',t('End Y','終點 Y'),Math.min(80,image.height),'number',`min="0" max="${image.height}"`)}</div>${button('annotation-line',t('Add line','加入線條'))}${field('annotation-text',t('Text, up to 200 characters','文字，最多二百字元'),'','text','maxlength="200"')}${button('annotation-text-add',t('Add text','加入文字'))}</details><p id="annotation-status" role="status"></p>`,t('Download annotated PNG','下載已標註 PNG'),async()=>{downloadBlob(await pngBlob(editor.canvas),filename('annotated','png',snapshot.at));snapshot.dirty=false;document.querySelector('#annotation-status').textContent=t('Annotated download requested. The original frame remains available.','已請求下載標註版本，原始畫面仍可下載。');return false;});
    editor=new FrameAnnotations(document.querySelector('#annotation-canvas'),image,error=>{document.querySelector('#annotation-status').textContent=error.message;},()=>{snapshot.dirty=true;});editor.operations=snapshot.operations;editor.paint();
    document.querySelector('[data-action="dialog-close"]').textContent=t('Close editor','關閉編輯器');
  }
  function coordinates(){const read=(id,max)=>{const value=Number(document.getElementById(id).value);if(!Number.isFinite(value)||value<0||value>max)throw new Error(t('Coordinates must stay inside the captured frame.','座標必須在已擷取畫面內。'));return value;};return [{x:read('annotation-x',editor.canvas.width),y:read('annotation-y',editor.canvas.height)},{x:read('annotation-x2',editor.canvas.width),y:read('annotation-y2',editor.canvas.height)}];}
  return {
    status:()=>({recording:Boolean(recording),downloadAvailable:Boolean(lastRecording),text:statusText,canCapture:Boolean(getConnection()),canAnnotate:Boolean(getConnection())&&!recording}),
    hasUnsaved:()=>Boolean(recording||lastRecording&&!lastRecording.downloaded||snapshot?.dirty),
    discard:()=>{generation++;recording?.stop('sign-out');recording=null;lastRecording=null;snapshot=null;editor=null;statusText='';changed();},
    beforeDisconnect:()=>recording?.stop('connection-change'),
    key(event){if(event.ctrlKey&&event.altKey&&['Control','Alt'].includes(event.key)&&event.target.closest?.('#vnc')&&getConnection()){event.preventDefault();event.stopPropagation();releaseInput();notify(t('Guest input released with Ctrl+Alt.','已用 Ctrl+Alt 解除客體輸入。'));}},
    change(event){if(!editor)return;if(event.target.id==='annotation-color'&&/^#[a-f0-9]{6}$/i.test(event.target.value))editor.color=event.target.value;if(event.target.id==='annotation-width')editor.width=Math.max(1,Math.min(20,Number(event.target.value)||4));},
    async handle(action){
      if(action==='console-png'){downloadBlob(await pngBlob(frameCanvas(frame())),filename('raw','png'));notify(t('Raw framebuffer PNG download requested.','已請求下載原始畫面 PNG。'));return true;}
      if(action==='console-record'){if(recording){recording.stop();return true;}if(lastRecording&&!lastRecording.downloaded){modal(t('Replace the undownloaded recording?','取代尚未下載的錄影？'),`<p>${t('Download the previous clip first, or explicitly discard it to record again.','請先下載上一段錄影，或明確捨棄後再錄。')}</p>`,t('Discard and record','捨棄並錄影'),async()=>{lastRecording=null;startRecording();});}else startRecording();return true;}
      if(action==='console-record-download'){if(!lastRecording)throw new Error(t('No recording is ready.','尚未有錄影可供下載。'));downloadBlob(lastRecording.blob,lastRecording.name);lastRecording.downloaded=true;return true;}
      if(action==='console-annotate'){if(recording)throw new Error(t('Stop recording before annotating a frame.','請先停止錄影，才標註畫面。'));showAnnotations();return true;}
      if(!action.startsWith('annotation-'))return false;
      if(action==='annotation-undo')editor.undo();
      if(action==='annotation-clear')editor.clear();
      if(action==='annotation-original')downloadBlob(await pngBlob(editor.base),filename('raw','png',snapshot.at));
      if(action==='annotation-line')editor.add({type:'stroke',points:coordinates()});
      if(action==='annotation-text-add'){const text=document.querySelector('#annotation-text').value;if(!text.trim())throw new Error(t('Enter annotation text first.','請先輸入標註文字。'));const [point]=coordinates();editor.add({type:'text',text,...point});}
      if(action==='annotation-new')modal(t('Replace this annotation draft?','取代此標註草稿？'),`<p>${t('The current local annotations will be discarded. Download them first if needed.','目前的本機標註會被捨棄，如有需要請先下載。')}</p>`,t('Capture new frame','擷取新畫面'),async()=>{snapshot={frame:frame(),at:new Date().toISOString(),operations:[],dirty:false};showAnnotations();return false;});
      return true;
    },
  };
}
