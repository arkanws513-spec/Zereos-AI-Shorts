// Prevent narration from a previous wisdom/script being reused after the text changes.
let narrationScriptSnapshot = '';
function clearStaleNarrationForScriptChange(){
 const currentScript=texts().map(line=>String(line||'').trim()).join('\n');
 if(!narrationBuffer&&!importedNarrationMediaId)return;
 if(currentScript===narrationScriptSnapshot)return;
 narrationLoadToken++;
 stopPreviewNarration();
 narrationBuffer=null;
 importedNarrationMediaId=null;
 narrationTrimStart=0;
 narrationTrimEnd=null;
 narrationSeekSeconds=0;
 const fileInput=$('narrationFile');
 if(fileInput)fileInput.value='';
 updateNarrationEditor();
 $('fileStatus').textContent='تغيّر نص الحكمة؛ تم إلغاء التعليق الصوتي السابق حتى لا يُستخدم مع نص مختلف. اختر أو ولّد صوتًا جديدًا.';
 if(playing){playing=false;cancelAnimationFrame(raf);$('playBtn').textContent='▶ تشغيل المعاينة';}
 scheduleAutoSave();
}
['scriptTitle','scriptBody1','scriptBody2','scriptCta'].forEach(id=>{
 const el=$(id);
 if(el){el.addEventListener('input',clearStaleNarrationForScriptChange);el.addEventListener('change',clearStaleNarrationForScriptChange);}
});
function updateLiveRecordingPrompt(){
 const prompt=$('liveRecordingPrompt');if(!prompt)return;
 const script=texts().filter(Boolean).join('\n\n');
 prompt.textContent=script||'اكتب نص الفيديو في المشاهد أولًا.';
}
function releaseMicrophone(){
 if(microphoneStream){microphoneStream.getTracks().forEach(track=>track.stop());microphoneStream=null}
}
async function startLiveVoiceRecording(){
 if(voiceRecorder&&voiceRecorder.state==='recording')return;
 if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){$('liveVoiceStatus').textContent='التسجيل المباشر غير مدعوم في هذا المتصفح. افتح التطبيق في Chrome محدّث عبر HTTPS.';return}
 const script=texts().filter(Boolean).join('\n\n');
 if(!script){$('liveVoiceStatus').textContent='اكتب النص الذي تريد قراءته في مشاهد الفيديو أولًا.';return}
 try{
  $('recordVoiceBtn').disabled=true;$('liveVoiceStatus').textContent='بانتظار إذن الميكروفون…';
  const token=++liveVoiceToken;
  microphoneStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
  if(token!==liveVoiceToken){releaseMicrophone();return}
  voiceChunks=[];recordedVoiceBlob=null;recordedVoiceBuffer=null;
  if(recordedVoiceUrl){URL.revokeObjectURL(recordedVoiceUrl);recordedVoiceUrl=null}
  $('liveVoicePreview').classList.add('hidden');$('useVoiceRecordingBtn').disabled=true;
  const candidates=['audio/webm;codecs=opus','audio/mp4','audio/webm','audio/ogg;codecs=opus'];
  let options={};
  if(MediaRecorder.isTypeSupported){const mime=candidates.find(type=>MediaRecorder.isTypeSupported(type));if(mime)options.mimeType=mime}
  voiceRecorder=new MediaRecorder(microphoneStream,options);
  voiceRecorder.ondataavailable=event=>{if(event.data&&event.data.size)voiceChunks.push(event.data)};
  voiceRecorder.onerror=event=>{$('liveVoiceStatus').textContent='حدث خطأ أثناء التسجيل: '+(event.error?.message||'تعذر تسجيل الصوت.');releaseMicrophone();$('recordVoiceBtn').disabled=false;$('stopVoiceRecordingBtn').disabled=true};
  voiceRecorder.onstop=async()=>{
   releaseMicrophone();$('stopVoiceRecordingBtn').disabled=true;
   const blob=new Blob(voiceChunks,{type:voiceRecorder?.mimeType||voiceChunks[0]?.type||'audio/webm'});
   voiceChunks=[];
   if(!blob.size){$('liveVoiceStatus').textContent='لم يُسجّل صوت. تحقق من إذن الميكروفون ثم أعد المحاولة.';$('recordVoiceBtn').disabled=false;return}
   recordedVoiceBlob=blob;
   if(recordedVoiceUrl)URL.revokeObjectURL(recordedVoiceUrl);
   recordedVoiceUrl=URL.createObjectURL(blob);
   const player=$('liveVoicePreview');player.src=recordedVoiceUrl;player.classList.remove('hidden');player.load();
   $('liveVoiceStatus').textContent='تم التسجيل ('+Math.max(1,Math.round(blob.size/1024))+' كيلوبايت). جارٍ تجهيز الصوت للفيديو…';
   try{
    const ac=ensureAudio();
    recordedVoiceBuffer=await ac.decodeAudioData(await blob.arrayBuffer());
    $('useVoiceRecordingBtn').disabled=false;
    $('liveVoiceStatus').textContent='التسجيل جاهز ('+Math.ceil(recordedVoiceBuffer.duration)+' ثانية). استمع إليه، ثم اضغط «اعتماد الصوت للفيديو».';
   }catch(error){
    console.error('تعذر فك ترميز التسجيل الصوتي',error);
    $('liveVoiceStatus').textContent='تم حفظ التسجيل للمعاينة، لكن المتصفح لم يستطع تجهيز صيغته لدمجها بالفيديو. جرّب التسجيل في Chrome أو استخدم WAV/MP3 من زر الاستيراد.';
   }finally{$('recordVoiceBtn').disabled=false}
  };
  voiceRecorder.start(250);
  $('recordVoiceBtn').textContent='● جارٍ التسجيل…';$('recordVoiceBtn').disabled=true;$('stopVoiceRecordingBtn').disabled=false;
  $('liveVoiceStatus').textContent='التسجيل يعمل الآن. اقرأ النص الظاهر بالأعلى، ثم اضغط «إيقاف التسجيل».';
 }catch(error){
  releaseMicrophone();$('recordVoiceBtn').disabled=false;$('recordVoiceBtn').textContent='● بدء التسجيل';
  $('liveVoiceStatus').textContent='تعذر تشغيل الميكروفون: '+(error?.message||'تحقق من إذن الميكروفون وافتح التطبيق عبر HTTPS.');
 }
}
async function stopLiveVoiceRecording(){
 if(!voiceRecorder||voiceRecorder.state!=='recording')return;
 $('stopVoiceRecordingBtn').disabled=true;$('liveVoiceStatus').textContent='جارٍ إنهاء التسجيل وتجهيز الملف…';
 try{voiceRecorder.stop()}catch(error){releaseMicrophone();$('recordVoiceBtn').disabled=false;$('liveVoiceStatus').textContent='تعذر إنهاء التسجيل: '+error.message}
 $('recordVoiceBtn').textContent='● بدء تسجيل جديد';
}
async function useLiveVoiceRecording(){
 if(!recordedVoiceBlob||!recordedVoiceBuffer){$('liveVoiceStatus').textContent='سجّل صوتك وأوقف التسجيل أولًا.';return}
 narrationBuffer=recordedVoiceBuffer;narrationTrimStart=0;narrationTrimEnd=recordedVoiceBuffer.duration;narrationSeekSeconds=0;updateNarrationEditor();$('narrationFile').value='';narrationLoadToken++;importedNarrationMediaId=null;
 $('fileStatus').textContent='تم اعتماد تسجيلك الشخصي ('+Math.ceil(recordedVoiceBuffer.duration)+' ثانية) للتصدير.';
 $('liveVoiceStatus').textContent='تم اعتماد صوتك للتعليق في الفيديو. جارٍ حفظ نسخة في مكتبة الأصوات…';
 $('useVoiceRecordingBtn').disabled=true;
 try{
  if(window.ZereosStorage?.local?.saveMedia){
   const mime=recordedVoiceBlob.type||'audio/webm';
   const ext=mime.includes('mp4')?'m4a':mime.includes('ogg')?'ogg':mime.includes('wav')?'wav':'webm';
   const activeProjectId=await window.ZereosStorage.local.activeProjectId();
   const saved=await window.ZereosStorage.local.saveMedia({name:'ZEREOS-Voice-'+Date.now()+'.'+ext,type:mime,kind:'audio',size:recordedVoiceBlob.size,blob:recordedVoiceBlob,projectId:activeProjectId||null,voiceCategory:'human',voiceProfile:'human'});
   if(saved?.id)importedNarrationMediaId=saved.id;
   await window.ZereosRefreshVoiceLibrary?.();
  }
  window.dispatchEvent(new Event('zereos-project-change'));
  $('liveVoiceStatus').textContent='تم اعتماد صوتك وحفظ التسجيل محليًا في مكتبة الأصوات. أصبح جاهزًا للمعاينة وتصدير الفيديو.';
 }catch(error){
  console.warn('تم اعتماد الصوت لكن تعذر حفظ نسخة في المكتبة',error);
  $('liveVoiceStatus').textContent='تم اعتماد صوتك للفيديو، لكن تعذر حفظ نسخة بالمكتبة: '+(error?.message||'خطأ تخزين محلي');
 }
 $('recordVoiceBtn').textContent='● بدء تسجيل جديد';$('useVoiceRecordingBtn').disabled=false;
}
$('recordVoiceBtn')?.addEventListener('click',startLiveVoiceRecording);
$('stopVoiceRecordingBtn')?.addEventListener('click',stopLiveVoiceRecording);
$('useVoiceRecordingBtn')?.addEventListener('click',useLiveVoiceRecording);
window.addEventListener('pagehide',releaseMicrophone);

/* Device-provided voices are intentionally disabled. */
restoreDraft();initParticles();renderPresets();document.fonts?.ready?.then(()=>drawFrame(0));update();drawFrame(0);
