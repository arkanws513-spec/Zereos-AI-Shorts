(()=>{'use strict';
const $=id=>document.getElementById(id);
const video=$('vsVideo'),audio=$('vsNarration'),videoInput=$('vsVideoFile'),audioInput=$('vsAudioFile');
let videoUrl=null,audioUrl=null,recording=false,recorder=null,raf=0,startedAt=0,wakeLock=null;
let audioContext=null,videoSource=null,narrationSource=null,videoGain=null,narrationGain=null,recordingDestination=null;
const status=msg=>{$('vsStatus').textContent=msg};
const time=s=>{s=Math.max(0,Number(s)||0);return String(Math.floor(s/60)).padStart(2,'0')+':'+String(Math.floor(s%60)).padStart(2,'0')};
const syncUI=()=>{$('vsSyncReadout').textContent=Number($('vsOffset').value).toFixed(1)+' ثانية'};
const ready=()=>{const ok=!!videoUrl;$('vsPreviewBtn').disabled=!ok;$('vsExportBtn').disabled=!ok||recording;$('vsEmpty').hidden=ok};
const release=url=>{if(url)URL.revokeObjectURL(url)};
function updateGains(){if(videoGain)videoGain.gain.value=+$('vsVideoVolume').value;if(narrationGain)narrationGain.gain.value=audioUrl?+$('vsAudioVolume').value:0}
function ensureAudioGraph(){
 if(!audioContext){const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)throw Error('معالجة الصوت غير مدعومة في هذا المتصفح.');audioContext=new Ctx()}
 if(!recordingDestination)recordingDestination=audioContext.createMediaStreamDestination();
 if(!videoSource){videoSource=audioContext.createMediaElementSource(video);videoGain=audioContext.createGain();videoSource.connect(videoGain);videoGain.connect(audioContext.destination);videoGain.connect(recordingDestination)}
 // Create this node once only: browsers forbid createMediaElementSource() twice for one element.
 if(!narrationSource){narrationSource=audioContext.createMediaElementSource(audio);narrationGain=audioContext.createGain();narrationSource.connect(narrationGain);narrationGain.connect(audioContext.destination);narrationGain.connect(recordingDestination)}
 updateGains();
 return audioContext;
}
function inferMediaType(file,kind){
 const ext=(file.name.split('.').pop()||'').toLowerCase();
 const types=kind==='video'?{mp4:'video/mp4',m4v:'video/mp4',mov:'video/quicktime',webm:'video/webm',ogv:'video/ogg',ogg:'video/ogg',3gp:'video/3gpp',mkv:'video/x-matroska'}:{wav:'audio/wav',wave:'audio/wav',mp3:'audio/mpeg',m4a:'audio/mp4',aac:'audio/aac',ogg:'audio/ogg',opus:'audio/ogg',flac:'audio/flac'};
 const detected=types[ext]||'';
 const supplied=(file.type||'').toLowerCase();
 return supplied&&supplied!=='application/octet-stream'&&supplied!=='binary/octet-stream'?supplied:detected||(kind==='video'?'video/mp4':'audio/mpeg');
}
function prepareMediaFile(file,kind){
 const type=inferMediaType(file,kind);
 return file.type===type?file:new Blob([file],{type});
}
function mediaError(el,file,kind){
 const code=el.error?.code||0, supplied=file?.type||'غير محدد';
 const reasons={1:'تم إيقاف قراءة الملف قبل اكتمالها.',2:'تعذر قراءة الملف من ذاكرة الهاتف.',3:'المتصفح فشل في فك ترميز بيانات الوسائط.',4:'صيغة الحاوية أو ترميز الملف غير مدعوم.'};
 const detail=reasons[code]||'تعذر تشغيل الملف.';
 if(code===4&&kind==='video')return detail+' إذا كان MP4 بترميز HEVC/H.265، حوّله إلى H.264/AVC ثم أعد استيراده. نوع الملف: '+inferMediaType(file,'video')+'؛ النوع الأصلي: '+supplied+'.';
 return detail+' رمز الخطأ: '+code+'؛ نوع الملف: '+supplied+'.';
}
videoInput.addEventListener('change',()=>{const file=videoInput.files?.[0];if(!file)return;if(!file.size){status('ملف الفيديو فارغ أو لم يكتمل اختياره من الهاتف.');return}if(file.type&&!file.type.startsWith('video/')&&!['application/octet-stream','binary/octet-stream'].includes(file.type)){status('الملف المختار ليس بصيغة فيديو. اختر فيديو من المعرض.');return}release(videoUrl);videoUrl=URL.createObjectURL(prepareMediaFile(file,'video'));video.pause();video.preload='auto';video.src=videoUrl;video.load();$('vsVideoInfo').textContent=file.name+' · '+(file.size/1048576).toFixed(1)+' MB';$('vsVideoTrackLabel').textContent=file.name;status('تم استيراد الفيديو وفحص نوعه. جارٍ تحميل أول إطار…');ready()});
audioInput.addEventListener('change',()=>{const file=audioInput.files?.[0];if(!file)return;if(!file.size){status('ملف الصوت فارغ أو لم يكتمل اختياره من الهاتف.');return}if(file.type&&!file.type.startsWith('audio/')&&!['application/octet-stream','binary/octet-stream'].includes(file.type)){status('الملف المختار ليس ملفًا صوتيًا. اختر MP3 أو M4A أو WAV أو OGG.');return}release(audioUrl);audioUrl=URL.createObjectURL(prepareMediaFile(file,'audio'));audio.pause();audio.preload='auto';audio.src=audioUrl;audio.load();$('vsAudioInfo').textContent=file.name+' · '+(file.size/1048576).toFixed(1)+' MB';$('vsAudioTrackLabel').textContent=file.name;status('تم استيراد الصوت مع ضبط نوع الملف تلقائيًا.');ready()});
$('vsOffset').addEventListener('input',syncUI);
$('vsAudioVolume').addEventListener('input',e=>{$('vsVolumeValue').textContent=Math.round(+e.target.value*100)+'%';if(narrationGain)narrationGain.gain.value=audioUrl?+e.target.value:0;else audio.volume=+e.target.value});
$('vsVideoVolume').addEventListener('input',e=>{$('vsVideoVolumeValue').textContent=Math.round(+e.target.value*100)+'%';if(videoGain)videoGain.gain.value=+e.target.value;else video.volume=+e.target.value});
$('vsClearAudio').addEventListener('click',()=>{audio.pause();release(audioUrl);audioUrl=null;audio.removeAttribute('src');audio.load();audioInput.value='';$('vsAudioInfo').textContent='لم يتم اختيار ملف صوتي.';$('vsAudioTrackLabel').textContent='بدون تعليق صوتي';if(narrationGain)narrationGain.gain.value=0;status('تمت إزالة التعليق الصوتي.');});
$('vsUseLibrary').addEventListener('click',()=>window.open('./index.html#voiceLibraryPage','_blank','noopener'));
async function stopPreview(){video.onended=null;video.pause();audio.pause();try{video.currentTime=0;audio.currentTime=0}catch{}$('vsPreviewBtn').disabled=!videoUrl;$('vsStopBtn').disabled=true}
$('vsPreviewBtn').addEventListener('click',async()=>{if(!videoUrl)return;await stopPreview();updateGains();const offset=+$('vsOffset').value;try{if(audioContext)await audioContext.resume();await video.play();if(audioUrl){audio.currentTime=0;if(offset===0)await audio.play();else setTimeout(()=>{if(!video.paused&&audioUrl)audio.play().catch(()=>{})},offset*1000)}$('vsStopBtn').disabled=false;$('vsPreviewBtn').disabled=true;video.onended=stopPreview;audio.onended=()=>{status('انتهى التعليق الصوتي؛ يستمر الفيديو بصوته الأصلي حتى نهاية المقطع.')};status('المعاينة تعمل.');}catch(err){status('تعذر تشغيل المعاينة: '+err.message)}});
$('vsStopBtn').addEventListener('click',stopPreview);
video.addEventListener('loadedmetadata',()=>{$('vsDuration').textContent=time(video.duration);$('vsVideoTrackLabel').textContent=$('vsVideoTrackLabel').textContent.split(' · ')[0]+' · '+time(video.duration);status('الفيديو جاهز. يمكنك إضافة صوت أو بدء المعاينة والتصدير.');ready()});
video.addEventListener('error',()=>{if(videoUrl)status('تعذر تشغيل الفيديو: '+mediaError(video,videoInput.files?.[0],'video'));});
audio.addEventListener('error',()=>{if(audioUrl)status('تعذر قراءة الصوت: '+mediaError(audio,audioInput.files?.[0],'audio'));});
async function waitForVideoMetadata(){
 if(video.readyState>=1&&Number.isFinite(video.duration)&&video.duration>0&&video.videoWidth>0&&video.videoHeight>0)return;
 await new Promise((resolve,reject)=>{
  let settled=false;
  const cleanup=()=>{clearTimeout(timer);video.removeEventListener('loadedmetadata',check);video.removeEventListener('error',onError)};
  const finish=()=>{if(settled)return;settled=true;cleanup();resolve()};
  const check=()=>{if(video.readyState>=1&&Number.isFinite(video.duration)&&video.duration>0&&video.videoWidth>0&&video.videoHeight>0)finish()};
  const onError=()=>{if(settled)return;settled=true;cleanup();reject(Error('تعذر قراءة الفيديو. جرّب ملف MP4 أو WebM سليمًا.'))};
  const timer=setTimeout(()=>{if(settled)return;settled=true;cleanup();reject(Error('استغرق تحميل بيانات الفيديو وقتًا طويلًا. انتظر ظهور مدة الفيديو ثم أعد التصدير.'))},15000);
  video.addEventListener('loadedmetadata',check);video.addEventListener('error',onError);check();
 });
}
async function waitForVideoFrame(){
 if(video.readyState>=2&&video.videoWidth>0&&video.videoHeight>0)return;
 await new Promise((resolve,reject)=>{
  let settled=false;
  const cleanup=()=>{clearTimeout(timer);video.removeEventListener('loadeddata',check);video.removeEventListener('canplay',check);video.removeEventListener('error',onError)};
  const finish=()=>{if(settled)return;settled=true;cleanup();resolve()};
  const check=()=>{if(video.readyState>=2&&video.videoWidth>0&&video.videoHeight>0)finish()};
  const onError=()=>{if(settled)return;settled=true;cleanup();reject(Error('فشل فك ترميز الفيديو قبل التصدير: '+mediaError(video,videoInput.files?.[0],'video')))};
  const timer=setTimeout(()=>{if(settled)return;settled=true;cleanup();reject(Error('لم يستطع المتصفح تحميل إطار الفيديو الأول. قد يكون ترميز الملف غير مدعوم على هذا الهاتف.'))},12000);
  video.addEventListener('loadeddata',check);video.addEventListener('canplay',check);video.addEventListener('error',onError);check();
 });
}
async function exportVideo(){
 if(!videoUrl||recording)return;
 if(!('MediaRecorder'in window)||!HTMLCanvasElement.prototype.captureStream){status('تسجيل الفيديو غير مدعوم في هذا المتصفح. جرّب Chrome محدّثًا.');return}
 let canvasStream=null,canvas=null,localRaf=0,offsetTimer=null,doneRecording=null,resolveRecording=null,rejectRecording=null;
 let mime='',startTime=0,streamDownload=null,streamQueue=Promise.resolve();
 recording=true;ready();$('vsProgress').hidden=false;$('vsProgressBar').value=0;$('vsProgressLabel').textContent='جارٍ تجهيز الفيديو والصوت…';
 try{
  await stopPreview();
  // A previous preview's ended handler reset currentTime to zero during export,
  // preventing the export completion listener from ever observing the end.
  video.onended=null;
  $('vsProgressLabel').textContent='جارٍ تحميل بيانات الفيديو…';
  await waitForVideoMetadata();
  await waitForVideoFrame();
  const ac=ensureAudioGraph();await ac.resume();
  if(ac.state!=='running')throw Error('تعذر تشغيل الصوت في المتصفح. اضغط تصدير مرة أخرى.');
  video.currentTime=0;audio.currentTime=0;updateGains();
  const sourceW=video.videoWidth||720,sourceH=video.videoHeight||1280;
  // Keep memory use predictable on phones: the original implementation could
  // allocate a 1080p/30fps canvas and retain a large recording in RAM.
  const mobile=matchMedia('(max-width: 760px)').matches||(Number(navigator.deviceMemory)>0&&Number(navigator.deviceMemory)<=4);
  const maxEdge=mobile?720:1280,fps=mobile?20:24;
  const scale=Math.min(1,maxEdge/Math.max(sourceW,sourceH));
  canvas=document.createElement('canvas');canvas.width=Math.max(2,Math.round(sourceW*scale/2)*2);canvas.height=Math.max(2,Math.round(sourceH*scale/2)*2);
  const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)throw Error('تعذر إنشاء مساحة رسم الفيديو.');
  ctx.drawImage(video,0,0,canvas.width,canvas.height);
  canvasStream=canvas.captureStream(fps);
  const audioTrack=recordingDestination.stream.getAudioTracks().find(t=>t.readyState==='live');
  const videoTrack=canvasStream.getVideoTracks().find(t=>t.readyState==='live');
  if(!audioTrack||!videoTrack)throw Error('تعذر تجهيز مسارات الصوت أو الفيديو.');
  const output=new MediaStream([videoTrack,audioTrack]);
  const qualityMap=mobile?{compact:900000,standard:1400000,high:1800000}:{compact:1800000,standard:3000000,high:4500000};
  const quality=qualityMap[$('vsQuality').value]||qualityMap.standard;
  const candidates=['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'];
  let lastError=null;
  const recorderOptions=candidate=>({mimeType:candidate,videoBitsPerSecond:quality,audioBitsPerSecond:mobile?96000:128000});
  for(const candidate of candidates){
   try{
    if(MediaRecorder.isTypeSupported&&!MediaRecorder.isTypeSupported(candidate))continue;
    recorder=new MediaRecorder(output,recorderOptions(candidate));
    mime=recorder.mimeType||candidate;
    break;
   }catch(err){lastError=err;recorder=null}
  }
  if(!recorder)throw Error('لم يقبل المتصفح أي صيغة تصدير متاحة: '+(lastError?.message||'صيغة غير مدعومة'));
  mime=recorder.mimeType||mime||'video/webm';
  doneRecording=new Promise((resolve,reject)=>{resolveRecording=resolve;rejectRecording=reject});
  streamDownload=await beginStreamDownload(mime);
  if(!streamDownload)throw Error('متصفحك لم يفعّل التنزيل المتدفق. أغلق الصفحة وافتحها مجددًا من التطبيق لتفعيل التحديث، ثم أعد المحاولة.');
  recorder.ondataavailable=e=>{if(e.data&&e.data.size&&streamDownload){streamQueue=streamQueue.then(async()=>{const bytes=await e.data.arrayBuffer();streamDownload.port.postMessage({type:'chunk',bytes},[bytes])}).catch(err=>{console.error('Streaming download failed',err);rejectRecording(err)})}};
  recorder.onstop=()=>{streamQueue.then(()=>{streamDownload?.port.postMessage({type:'close'});resolveRecording()}).catch(rejectRecording)};
  recorder.onerror=e=>rejectRecording(e.error||Error('فشل تسجيل الفيديو'));
  const duration=Number(video.duration);
  if(!Number.isFinite(duration)||duration<=0)throw Error('مدة الفيديو غير صالحة؛ تعذر بدء التصدير.');
  startedAt=performance.now();startTime=startedAt;
  // Prevent Android from suspending the export when the screen dims.
  try{wakeLock=await navigator.wakeLock?.request('screen')}catch(_){}
  recorder.start(2000);
  await video.play();
  if(audioUrl){audio.currentTime=0;if(+ $('vsOffset').value<=0){await audio.play()}else offsetTimer=setTimeout(()=>{if(recording&&!video.paused)audio.play().catch(()=>{})},+$('vsOffset').value*1000)}
  $('vsStopBtn').disabled=true;$('vsPreviewBtn').disabled=true;
  const paint=now=>{
   if(!recording)return;
   try{if(video.readyState>=2)ctx.drawImage(video,0,0,canvas.width,canvas.height)}catch(err){console.warn('Frame capture skipped',err)}
   const elapsed=Math.min(duration,Math.max(0,Number(video.currentTime)||((now-startTime)/1000)));$('vsProgressTime').textContent=time(elapsed);$('vsProgressBar').value=Math.min(99,elapsed/Math.max(.1,duration)*100);
   if(!video.ended&&elapsed<duration+.5)localRaf=requestAnimationFrame(paint);
  };
  localRaf=requestAnimationFrame(paint);
  await new Promise((resolve,reject)=>{
   let settled=false,watchRaf=0;
   const cleanup=()=>{clearTimeout(endTimer);if(watchRaf)cancelAnimationFrame(watchRaf);video.removeEventListener('ended',finish);video.removeEventListener('timeupdate',checkEnd);};
   const finish=()=>{if(settled)return;settled=true;cleanup();resolve()};
   const fail=message=>{if(settled)return;settled=true;cleanup();reject(Error(message))};
   const checkEnd=()=>{
    if(video.ended||video.currentTime>=duration-.2){finish();return}
    if(video.error){fail('حدث خطأ أثناء قراءة الفيديو قبل اكتمال التصدير. جرّب ملف MP4 سليمًا.');return}
    watchRaf=requestAnimationFrame(checkEnd);
   };
   const endTimer=setTimeout(()=>{if(video.ended||video.currentTime>=duration-.2)finish();else fail('توقف تشغيل الفيديو قبل نهايته. أعد اختيار الملف أو جرّب MP4 بترميز H.264.')},Math.max(45000,(duration+60)*1000));
   video.addEventListener('ended',finish);
   video.addEventListener('timeupdate',checkEnd);
   checkEnd();
  });
  if(localRaf)cancelAnimationFrame(localRaf);recording=false;clearTimeout(offsetTimer);audio.pause();
  if(recorder.state!=='inactive')recorder.stop();await doneRecording;
  const actualMime=recorder.mimeType||mime||'video/webm';
  streamDownload?.port.postMessage({type:'finish'});
  $('vsProgressBar').value=100;$('vsProgressLabel').textContent='اكتمل التصدير';status('اكتمل التصدير بالتنزيل المتدفق دون تجميع الفيديو كاملًا في ذاكرة الهاتف. الصيغة: '+(actualMime.includes('mp4')?'MP4':'WebM')+'.');
 }catch(err){
  recording=false;if(localRaf)cancelAnimationFrame(localRaf);clearTimeout(offsetTimer);try{streamDownload?.port.postMessage({type:'abort'})}catch{}
  if(recorder&&recorder.state!=='inactive'){try{recorder.stop()}catch{}}
  status('تعذر التصدير: '+(err?.message||String(err)));
 }finally{
  recording=false;audio.pause();video.pause();canvasStream?.getTracks().forEach(t=>t.stop());streamDownload?.port.close();streamDownload=null;try{await wakeLock?.release()}catch(_){}wakeLock=null;$('vsStopBtn').disabled=true;ready();
 }
}
async function beginStreamDownload(mime){
 const controller=navigator.serviceWorker?.controller;
 if(!controller||!window.MessageChannel)return null;
 const token='z'+Date.now().toString(36)+Math.random().toString(36).slice(2);
 const filename='zereos-gameplay-'+Date.now()+'.'+(mime.toLowerCase().includes('mp4')?'mp4':'webm');
 const channel=new MessageChannel();
 const ready=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('تعذر تجهيز مسار حفظ الفيديو. أعد فتح الاستوديو.')),8000);channel.port1.onmessage=e=>{if(e.data?.type==='ready'){clearTimeout(timer);resolve(true)}else if(e.data?.type==='error'){clearTimeout(timer);reject(Error(e.data.message||'تعذر تجهيز التنزيل'))}}});
 controller.postMessage({type:'ZEREOS_STREAM_START',token,filename,mime},[channel.port2]);
 await ready;
 const a=document.createElement('a');a.href=new URL('./__zereos_stream__/'+token,location.href).href;a.download=filename;a.style.display='none';document.body.appendChild(a);a.click();a.remove();
 return {port:channel.port1};
}
function downloadBlob(blob,mime){const ext=(mime||blob.type).toLowerCase().includes('mp4')?'mp4':'webm',url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='zereos-gameplay-'+Date.now()+'.'+ext;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),120000)}
$('vsExportBtn').addEventListener('click',exportVideo);
window.addEventListener('beforeunload',()=>{release(videoUrl);release(audioUrl);if(audioContext)audioContext.close().catch(()=>{})});
ready();syncUI();
})();