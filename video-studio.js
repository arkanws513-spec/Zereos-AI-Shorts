(()=>{'use strict';
const $=id=>document.getElementById(id);
const video=$('vsVideo'),audio=$('vsNarration'),videoInput=$('vsVideoFile'),audioInput=$('vsAudioFile');
let videoUrl=null,audioUrl=null,recording=false,recorder=null,raf=0,startedAt=0;
const status=msg=>{$('vsStatus').textContent=msg};
const time=s=>{s=Math.max(0,Number(s)||0);return String(Math.floor(s/60)).padStart(2,'0')+':'+String(Math.floor(s%60)).padStart(2,'0')};
const syncUI=()=>{$('vsSyncReadout').textContent=Number($('vsOffset').value).toFixed(1)+' ثانية'};
const ready=()=>{const ok=!!videoUrl;$('vsPreviewBtn').disabled=!ok;$('vsExportBtn').disabled=!ok||recording;$('vsEmpty').hidden=ok};
const release=url=>{if(url)URL.revokeObjectURL(url)};
videoInput.addEventListener('change',()=>{const file=videoInput.files?.[0];if(!file)return;if(!file.type.startsWith('video/')){status('الملف المختار ليس فيديو مدعومًا.');return}release(videoUrl);videoUrl=URL.createObjectURL(file);video.src=videoUrl;video.load();$('vsVideoInfo').textContent=file.name+' · '+(file.size/1048576).toFixed(1)+' MB';$('vsVideoTrackLabel').textContent=file.name;status('تم تحميل الفيديو. أضف التعليق الصوتي أو ابدأ المعاينة.');ready()});
audioInput.addEventListener('change',()=>{const file=audioInput.files?.[0];if(!file)return;if(!file.type.startsWith('audio/')){status('الملف المختار ليس ملفًا صوتيًا.');return}release(audioUrl);audioUrl=URL.createObjectURL(file);audio.src=audioUrl;audio.load();$('vsAudioInfo').textContent=file.name+' · '+(file.size/1048576).toFixed(1)+' MB';$('vsAudioTrackLabel').textContent=file.name;status('تم تحميل التعليق الصوتي. اضبط توقيت بدايته ثم عاين النتيجة.');ready()});
$('vsOffset').addEventListener('input',syncUI);
$('vsAudioVolume').addEventListener('input',e=>{$('vsVolumeValue').textContent=Math.round(+e.target.value*100)+'%';audio.volume=+e.target.value});
$('vsVideoVolume').addEventListener('input',e=>{$('vsVideoVolumeValue').textContent=Math.round(+e.target.value*100)+'%';video.volume=+e.target.value});
$('vsClearAudio').addEventListener('click',()=>{audio.pause();release(audioUrl);audioUrl=null;audio.removeAttribute('src');audio.load();audioInput.value='';$('vsAudioInfo').textContent='لم يتم اختيار ملف صوتي.';$('vsAudioTrackLabel').textContent='بدون تعليق صوتي';status('تمت إزالة التعليق الصوتي.');});
$('vsUseLibrary').addEventListener('click',()=>window.open('./index.html#voiceLibraryPage','_blank','noopener'));
async function stopPreview(){video.pause();audio.pause();try{video.currentTime=0;audio.currentTime=0}catch{}$('vsPreviewBtn').disabled=!videoUrl;$('vsStopBtn').disabled=true}
$('vsPreviewBtn').addEventListener('click',async()=>{if(!videoUrl)return;await stopPreview();audio.volume=+$('vsAudioVolume').value;video.volume=+$('vsVideoVolume').value;const offset=+$('vsOffset').value;try{await video.play();if(audioUrl){audio.currentTime=0;if(offset===0)await audio.play();else setTimeout(()=>{if(!video.paused&&audioUrl)audio.play().catch(()=>{})},offset*1000)}$('vsStopBtn').disabled=false;$('vsPreviewBtn').disabled=true;video.onended=stopPreview;audio.onended=()=>{status('انتهى التعليق الصوتي؛ يستمر الفيديو بصوته الأصلي حتى نهاية المقطع.')};status('المعاينة تعمل.');}catch(err){status('تعذر تشغيل المعاينة: '+err.message)}});
$('vsStopBtn').addEventListener('click',stopPreview);
video.addEventListener('loadedmetadata',()=>{$('vsDuration').textContent=time(video.duration);$('vsVideoTrackLabel').textContent=$('vsVideoTrackLabel').textContent+' · '+time(video.duration);ready()});
async function exportVideo(){if(!videoUrl||recording)return;if(!video.captureStream&&!video.mozCaptureStream){status('هذا المتصفح لا يتيح تسجيل مسار الفيديو. جرّب Chrome حديثًا.');return}
const capture=video.captureStream?video.captureStream.bind(video):video.mozCaptureStream.bind(video);
const mimeCandidates=['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'];
const mime=mimeCandidates.find(t=>MediaRecorder.isTypeSupported(t));if(!mime){status('لا توجد صيغة تسجيل مدعومة في هذا المتصفح.');return}
let stream=null,audioStream=null,chunks=[];recording=true;ready();$('vsProgress').hidden=false;$('vsProgressBar').value=0;
try{
 await stopPreview();video.currentTime=0;video.volume=+$('vsVideoVolume').value;audio.volume=+$('vsAudioVolume').value;
 stream=capture();const tracks=[...stream.getVideoTracks(),...stream.getAudioTracks()];
 if(audioUrl){audio.currentTime=0;const audioCapture=audio.captureStream?audio.captureStream():audio.mozCaptureStream?.();if(audioCapture){audioStream=audioCapture;tracks.push(...audioCapture.getAudioTracks())}else{throw new Error('المتصفح لا يدعم التقاط صوت التعليق.')} }
 const output=new MediaStream(tracks);const bitrate=({compact:2000000,standard:4000000,high:8000000})[$('vsQuality').value]||4000000;
 recorder=new MediaRecorder(output,{mimeType:mime,videoBitsPerSecond:bitrate});recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data)};
 const done=new Promise((resolve,reject)=>{recorder.onstop=resolve;recorder.onerror=e=>reject(e.error||new Error('فشل التسجيل'))});
 recorder.start(1000);startedAt=Date.now();const offset=+$('vsOffset').value;
 await video.play();if(audioUrl){if(offset===0)await audio.play();else setTimeout(()=>{if(recording&&!video.paused)audio.play().catch(()=>{})},offset*1000)}
 const tick=()=>{if(!recording)return;const elapsed=(Date.now()-startedAt)/1000;$('vsProgressTime').textContent=time(elapsed);$('vsProgressBar').value=Math.min(99,elapsed/Math.max(1,video.duration)*100);if(!video.paused&&!video.ended)raf=requestAnimationFrame(tick)};tick();
 await new Promise(resolve=>video.addEventListener('ended',resolve,{once:true}));
 recording=false;cancelAnimationFrame(raf);audio.pause();if(recorder.state!=='inactive')recorder.stop();await done;
 const blob=new Blob(chunks,{type:mime});if(!blob.size)throw new Error('ملف التصدير فارغ.');
 const url=URL.createObjectURL(blob),ext=mime.includes('mp4')?'mp4':'webm',a=document.createElement('a');a.href=url;a.download='zereos-gameplay-'+Date.now()+'.'+ext;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
 $('vsProgressBar').value=100;status('اكتمل التصدير: '+(blob.size/1048576).toFixed(1)+' MB · '+ext.toUpperCase()+'. تحقق من الملف قبل نشره.');
}catch(err){recording=false;cancelAnimationFrame(raf);if(recorder&&recorder.state!=='inactive')recorder.stop();status('تعذر التصدير: '+(err?.message||String(err))+' — جرّب Chrome وحدّث الصفحة.')}
finally{recording=false;audio.pause();video.pause();stream?.getTracks().forEach(t=>t.stop());audioStream?.getTracks().forEach(t=>t.stop());ready()}
}
$('vsExportBtn').addEventListener('click',exportVideo);
window.addEventListener('beforeunload',()=>{release(videoUrl);release(audioUrl)});
ready();syncUI();
})();