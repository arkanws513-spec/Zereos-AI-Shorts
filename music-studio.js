(()=>{'use strict';
const $=id=>document.getElementById(id);
let sourceBuffer=null,renderedBuffer=null,playSource=null,liveContext=null,rendering=false;
const status=(s)=>$('engineStatus').textContent=s;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const midiHz=n=>440*Math.pow(2,(n-69)/12);
const keyMidi={C:60,D:62,E:64,F:65,G:67,A:69,Bb:70};
const scales={nahawand:[0,2,3,5,7,8,10],rast:[0,2,4,5,7,9,10],hijaz:[0,1,4,5,7,8,10],minor:[0,2,3,5,7,8,10],major:[0,2,4,5,7,9,11]};
function styleParams(){const style=$('musicStyle').value,mood=$('musicMood').value;return {style,mood,bpm:clamp(Number($('musicTempo').value)||96,60,160),root:keyMidi[$('musicKey').value]||62,scale:scales[$('musicMaqam').value]||scales.nahawand,seconds:clamp(Number($('musicLength').value)||30,20,60)}}
function addTone(ctx,dest,freq,start,duration,wave,volume,pan=0,filter=4200){const osc=ctx.createOscillator(),gain=ctx.createGain(),lp=ctx.createBiquadFilter(),p=ctx.createStereoPanner?ctx.createStereoPanner():null;osc.type=wave;osc.frequency.setValueAtTime(freq,start);lp.type='lowpass';lp.frequency.setValueAtTime(filter,start);gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(Math.max(.0002,volume),start+.025);gain.gain.exponentialRampToValueAtTime(.0001,start+duration);osc.connect(lp);lp.connect(gain);if(p){p.pan.value=pan;gain.connect(p);p.connect(dest)}else gain.connect(dest);osc.start(start);osc.stop(start+duration+.04)}
function addKick(ctx,dest,t,amount=0.7){const o=ctx.createOscillator(),g=ctx.createGain();o.type='sine';o.frequency.setValueAtTime(115,t);o.frequency.exponentialRampToValueAtTime(42,t+.14);g.gain.setValueAtTime(amount,t);g.gain.exponentialRampToValueAtTime(.001,t+.22);o.connect(g);g.connect(dest);o.start(t);o.stop(t+.24)}
function addNoise(ctx,dest,t,duration,amount,highpass){const n=Math.max(1,Math.floor(ctx.sampleRate*duration)),b=ctx.createBuffer(1,n,ctx.sampleRate),d=b.getChannelData(0);for(let i=0;i<n;i++)d[i]=Math.random()*2-1;const s=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();s.buffer=b;f.type='highpass';f.frequency.value=highpass;g.gain.setValueAtTime(amount,t);g.gain.exponentialRampToValueAtTime(.001,t+duration);s.connect(f);f.connect(g);g.connect(dest);s.start(t);s.stop(t+duration)}
function scheduleArrangement(ctx,dest,p,seconds){const beat=60/p.bpm,bar=beat*4,total=Math.ceil(seconds/bar),triad=p.style==='tarab'?[0,3,7]:p.style==='shaabi'?[0,4,7]:p.style==='khaleeji'?[0,4,7]:p.style==='rap'?[0,3,7]:[0,3,7],progressions=[[0,5,3,4],[0,3,5,4],[0,4,5,3],[0,5,4,3]],prog=progressions[p.style==='shaabi'?2:p.style==='khaleeji'?1:p.style==='rap'?3:0];let step=0;
for(let barIndex=0;barIndex<total;barIndex++){const base=barIndex*bar,degree=prog[barIndex%4],chordRoot=p.root+p.scale[degree%7],chord=triad.map((v,i)=>chordRoot+v+(i===2?12:0));const padVol=p.style==='rap'?.035:.055;
chord.forEach((note,i)=>addTone(ctx,dest,midiHz(note),base,Math.min(bar,seconds-base),p.mood==='calm'?'sine':'triangle',padVol,i===0?-.25:i===2?.25:0,p.style==='tarab'?1500:2600));
for(let beatIndex=0;beatIndex<4;beatIndex++){const t=base+beatIndex*beat;if(t>=seconds)continue;addTone(ctx,dest,midiHz(chordRoot-24),t,Math.min(beat*.82,seconds-t),'sine',p.style==='rap'?.16:.10,0,500);
if(p.style==='rap'||p.style==='shaabi'||p.style==='arabpop'){if(beatIndex===0||beatIndex===2)addKick(ctx,dest,t,p.style==='rap'?.9:.55);if(beatIndex===1||beatIndex===3)addNoise(ctx,dest,t,.12,.10,1100)}
else {if(beatIndex===0)addKick(ctx,dest,t,.55);if(beatIndex===2)addNoise(ctx,dest,t,.16,.12,900)}
addNoise(ctx,dest,t,.035,p.style==='tarab'?.018:.035,6500);
const scale=p.scale,degreeNote=scale[(step*2+barIndex)%scale.length],octave=(barIndex%2?12:0),melodyRoot=p.root+12+degreeNote+octave;
if(beatIndex===0||beatIndex===2||p.style==='rap'&&beatIndex===3){const note=melodyRoot+(p.mood==='bright'?12:0);addTone(ctx,dest,midiHz(note),t,Math.min(beat*.42,seconds-t),p.style==='tarab'?'triangle':'sine',p.style==='rap'?.025:.045,beatIndex%2?-.16:.16,3200)}
step++}
}
}
async function buildMix(){if(rendering)return;rendering=true;$('buildTrackBtn').disabled=true;$('exportWavBtn').disabled=true;$('playTrackBtn').disabled=true;try{const p=styleParams(),rate=44100,frames=Math.ceil(p.seconds*rate);if(frames>rate*60)throw Error('المدة أكبر من الحد المسموح به على الهاتف.');status('جارٍ تأليف المسودة الموسيقية محليًا…');$('musicMeterFill').style.width='12%';const Offline=window.OfflineAudioContext||window.webkitOfflineAudioContext;if(!Offline)throw Error('هذا المتصفح لا يدعم التصدير الصوتي المحلي.');const off=new Offline(2,frames,rate),master=off.createGain();master.gain.value=1;master.connect(off.destination);const inst=off.createGain();inst.gain.value=Number($('instrumentGain').value);inst.connect(master);scheduleArrangement(off,inst,p,p.seconds);
if(sourceBuffer){const vocal=off.createBufferSource(),gain=off.createGain();vocal.buffer=sourceBuffer;gain.gain.value=Number($('vocalGain').value);vocal.connect(gain);gain.connect(master);vocal.start(0,0,Math.min(sourceBuffer.duration,p.seconds))}
$('musicMeterFill').style.width='48%';renderedBuffer=await off.startRendering();$('musicMeterFill').style.width='100%';$('playTrackBtn').disabled=false;$('exportWavBtn').disabled=false;status('اكتملت المسودة. استمع إليها، ثم صدّر ملف WAV أو عدّل الإعدادات وأعد التكوين.');}catch(e){status('تعذر تكوين المسودة: '+(e.message||e));}finally{rendering=false;$('buildTrackBtn').disabled=false}}
function invalidateMix(){if(rendering)return;renderedBuffer=null;$('playTrackBtn').disabled=true;$('exportWavBtn').disabled=true;$('musicMeterFill').style.width='0';status('تغيّرت إعدادات الصوت أو التوزيع؛ أعد تكوين الخلفية قبل الاستماع أو التصدير.')}
function stopPlayback(){if(playSource){try{playSource.stop()}catch{}playSource.disconnect();playSource=null}$('playTrackBtn').disabled=!renderedBuffer;$('stopTrackBtn').disabled=true}
async function playRendered(){if(!renderedBuffer)return;stopPlayback();const Ctx=window.AudioContext||window.webkitAudioContext;liveContext=liveContext||new Ctx();await liveContext.resume();playSource=liveContext.createBufferSource();playSource.buffer=renderedBuffer;playSource.connect(liveContext.destination);playSource.onended=()=>{playSource=null;$('playTrackBtn').disabled=false;$('stopTrackBtn').disabled=true};playSource.start();$('playTrackBtn').disabled=true;$('stopTrackBtn').disabled=false}
function wavBlob(buffer){const channels=buffer.numberOfChannels,length=buffer.length,bytes=44+length*channels*2,ab=new ArrayBuffer(bytes),v=new DataView(ab);const write=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i))};write(0,'RIFF');v.setUint32(4,bytes-8,true);write(8,'WAVE');write(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,channels,true);v.setUint32(24,buffer.sampleRate,true);v.setUint32(28,buffer.sampleRate*channels*2,true);v.setUint16(32,channels*2,true);v.setUint16(34,16,true);write(36,'data');v.setUint32(40,bytes-44,true);let offset=44;const data=Array.from({length:channels},(_,c)=>buffer.getChannelData(c));for(let i=0;i<length;i++)for(let c=0;c<channels;c++){const s=clamp(data[c][i],-1,1);v.setInt16(offset,s<0?s*32768:s*32767,true);offset+=2}return new Blob([ab],{type:'audio/wav'})}
['musicStyle','musicTempo','musicMaqam','musicKey','musicLength','musicMood','vocalGain','instrumentGain'].forEach(id=>$(id).addEventListener('change',invalidateMix));
$('musicTempo').addEventListener('input',invalidateMix);$('vocalGain').addEventListener('input',invalidateMix);$('instrumentGain').addEventListener('input',invalidateMix);
$('buildTrackBtn').addEventListener('click',buildMix);$('playTrackBtn').addEventListener('click',playRendered);$('stopTrackBtn').addEventListener('click',stopPlayback);
$('vocalFile').addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;invalidateMix();try{const Ctx=window.AudioContext||window.webkitAudioContext;liveContext=liveContext||new Ctx();sourceBuffer=await liveContext.decodeAudioData(await f.arrayBuffer());$('vocalStatus').textContent='تم تحميل التسجيل: '+f.name+' · '+Math.round(sourceBuffer.duration)+' ثانية. أعد تكوين المزيج لإضافته.';$('exportWavBtn').disabled=true;renderedBuffer=null}catch(err){sourceBuffer=null;$('vocalStatus').textContent='تعذر قراءة هذا الملف الصوتي: '+err.message}});
$('clearVocalBtn').addEventListener('click',()=>{sourceBuffer=null;$('vocalFile').value='';$('vocalStatus').textContent='تمت إزالة التسجيل.';invalidateMix()});
$('vocalGain').addEventListener('input',e=>{$('vocalGainValue').textContent=Math.round(+e.target.value*100)+'%'});$('instrumentGain').addEventListener('input',e=>{$('instrumentGainValue').textContent=Math.round(+e.target.value*100)+'%'});
$('exportWavBtn').addEventListener('click',()=>{if(!renderedBuffer)return;const blob=wavBlob(renderedBuffer),url=URL.createObjectURL(blob),a=document.createElement('a'),name=($('songTitle').value.trim()||'zereos-song').replace(/[^\p{L}\p{N}_ -]/gu,'').slice(0,50);a.href=url;a.download=name+'-draft.wav';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);status('بدأ تنزيل ملف WAV. تحقق من اكتمال التنزيل قبل إغلاق الصفحة.')});
function lyrics(){return ['# '+($('songTitle').value.trim()||'أغنية جديدة'),'الفكرة: '+$('songTheme').value,'','[المقطع الأول]',$('songVerse').value,'','[اللازمة]',$('songChorus').value,'','[المقطع الثاني / الجسر]',$('songBridge').value].join('\n')}
$('copyLyricsBtn').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(lyrics());status('تم نسخ الكلمات.')}catch{status('تعذر النسخ التلقائي؛ استخدم حفظ الكلمات TXT.')}});$('downloadLyricsBtn').addEventListener('click',()=>{const b=new Blob(['\ufeff'+lyrics()],{type:'text/plain;charset=utf-8'}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download='zereos-lyrics.txt';a.click();setTimeout(()=>URL.revokeObjectURL(u),10000)});

const aiState={connected:false,busy:false,token:'',base:''};
const aiStatus=(message)=>$('aiEngineStatus').textContent=message;
function aiBaseUrl(){return $('aiEngineUrl').value.trim().replace(/\/+$/,'')}
function aiHeaders(){return {'Content-Type':'application/json','Authorization':'Bearer '+aiState.token}}
function aiSetBusy(value){aiState.busy=value;$('aiGenerateBtn').disabled=!aiState.connected||value;$('aiEngineCheckBtn').disabled=value}
function aiGenrePrompt(){const styles={tarab:'Arabic classical tarab, expressive melismatic lead vocals, orchestral strings, qanun and oud, traditional Arabic percussion',shaabi:'Egyptian shaabi pop, lively tabla, energetic original male vocals',arabpop:'Modern Arabic pop, polished contemporary production, catchy melodic chorus',khaleeji:'Khaleeji Gulf Arabic music, mirwas percussion, oud, warm melodic vocals',rap:'Arabic hip-hop, rhythmic rap delivery, deep bass, modern drums'};return styles[$('musicStyle').value]||styles.arabpop}
function aiLyricsPayload(){const verse=$('songVerse').value.trim(),chorus=$('songChorus').value.trim(),bridge=$('songBridge').value.trim();return [verse?'[Verse 1]\n'+verse:'',chorus?'[Chorus]\n'+chorus:'',bridge?'[Verse 2]\n'+bridge:''].filter(Boolean).join('\n\n')}
async function aiCheckConnection(){
 const base=aiBaseUrl(),token=$('aiEngineToken').value.trim();
 if(!/^https:\/\//i.test(base)){aiStatus('أدخل رابط HTTPS صحيحًا لجلسة المحرك.');return}
 if(!token){aiStatus('أدخل رمز الجلسة الذي ظهر في دفتر Colab.');return}
 aiSetBusy(true);aiStatus('جارٍ فحص جلسة ACE-Step…');
 try{const response=await fetch(base+'/health');if(!response.ok)throw Error('HTTP '+response.status);const payload=await response.json();const data=payload.data||payload;if(payload.code&&payload.code!==200)throw Error(payload.error||'استجابة غير صالحة');aiState.base=base;aiState.token=token;aiState.connected=true;$('aiGenerateBtn').disabled=false;aiStatus('اتصلنا بالمحرك. '+(data.models_initialized?'النموذج جاهز.':'الخادم يعمل؛ قد يحتاج تحميل النموذج عند أول توليد.'))}
 catch(error){aiState.connected=false;$('aiGenerateBtn').disabled=true;aiStatus('فشل الاتصال: '+error.message+'. تأكد أن جلسة Colab ما زالت تعمل وأن الرابط صحيح.')}
 finally{$('aiEngineCheckBtn').disabled=false}
}
async function aiGenerateSong(){
 if(!aiState.connected||aiState.busy)return;
 const lyrics=aiLyricsPayload();if(!lyrics){aiStatus('اكتب كلمات المقطع واللازمة أولًا.');return}
 const duration=Number($('musicLength').value)||60,bpm=clamp(Number($('musicTempo').value)||96,60,160);
 const maqams={nahawand:'Nahawand',rast:'Rast',hijaz:'Hijaz',minor:'Minor',major:'Major'},keys={C:'C',D:'D',E:'E',F:'F',G:'G',A:'A',Bb:'Bb'},moods={warm:'warm and emotional',dramatic:'dramatic and epic',bright:'bright and joyful',calm:'calm and reflective'};
 const prompt=aiGenrePrompt()+', Arabic lyrics and Arabic lead singing, '+(moods[$('musicMood').value]||'warm')+' mood, '+(maqams[$('musicMaqam').value]||'Nahawand')+' maqam, studio quality, original fictional singer, no imitation of any real singer';
 aiSetBusy(true);$('aiEngineProgress').hidden=false;$('aiEngineProgressFill').style.width='4%';$('aiEngineResult').hidden=true;
 aiStatus('جارٍ إرسال الكلمات إلى محرك ACE-Step…');
 try{
  const submitted=await fetch(aiState.base+'/release_task',{method:'POST',headers:aiHeaders(),body:JSON.stringify({prompt,lyrics,vocal_language:'ar',thinking:true,use_format:true,bpm,key_scale:(keys[$('musicKey').value]||'D')+' '+(maqams[$('musicMaqam').value]||'Nahawand'),audio_duration:duration,audio_format:'mp3',model:'acestep-v15-turbo',inference_steps:8,batch_size:1,use_random_seed:true})});
  const created=await submitted.json();if(!submitted.ok||created.code!==200)throw Error(created.error||'تعذر إنشاء مهمة التوليد (HTTP '+submitted.status+')');
  const taskId=created.data&&created.data.task_id;if(!taskId)throw Error('لم يرجع المحرك رقم المهمة.');
  aiStatus('تم استلام المهمة. يجري توليد اللحن والغناء؛ قد يستغرق ذلك عدة دقائق…');
  let completed=null;
  for(let attempt=0;attempt<240;attempt++){
   await new Promise(resolve=>setTimeout(resolve,3000));
   const response=await fetch(aiState.base+'/query_result',{method:'POST',headers:aiHeaders(),body:JSON.stringify({task_id_list:[taskId]})});
   const result=await response.json();if(!response.ok||result.code!==200)throw Error(result.error||'تعذر متابعة مهمة التوليد.');
   const item=Array.isArray(result.data)?result.data[0]:null;
   if(item&&item.status===2)throw Error(item.error||item.result||'فشل توليد الأغنية.');
   if(item&&item.status===1){completed=item;break}
   $('aiEngineProgressFill').style.width=Math.min(94,8+attempt*.36)+'%';
   if(attempt%4===0)aiStatus('المحرك يعمل على الأغنية… ('+Math.floor((attempt+1)*3/60)+' دقيقة تقريبًا)');
  }
  if(!completed)throw Error('انتهت مهلة الانتظار. قد تكون جلسة GPU المجانية توقفت؛ افحصها ثم حاول مجددًا.');
  let parsed=completed.result;if(typeof parsed==='string')parsed=JSON.parse(parsed);if(!Array.isArray(parsed))parsed=[parsed];
  const track=parsed.find(x=>x&&x.status===1&&x.file)||parsed.find(x=>x&&x.file);if(!track||!track.file)throw Error('اكتملت المهمة لكن لم يظهر ملف صوت.');
  const audioUrl=new URL(track.file,aiState.base).href;$('aiGeneratedAudio').src=audioUrl;$('aiDownloadBtn').href=audioUrl;
   const safeName=($('songTitle').value.trim()||'zereos-song').replace(/[^\p{L}\p{N}_ -]/gu,'').slice(0,50)||'zereos-song';$('aiDownloadBtn').download=safeName+'.mp3';
  $('aiGeneratedMeta').textContent='ACE-Step 1.5 · '+duration+' ثانية · '+bpm+' BPM · العربية';$('aiEngineResult').hidden=false;$('aiEngineProgressFill').style.width='100%';aiStatus('اكتمل توليد الأغنية. استمع إليها ثم نزّل ملف MP3.');
 }catch(error){aiStatus('لم يكتمل التوليد: '+error.message);$('aiEngineProgressFill').style.width='0%'}
 finally{aiSetBusy(false)}
}
$('aiEngineCheckBtn').addEventListener('click',aiCheckConnection);$('aiGenerateBtn').addEventListener('click',aiGenerateSong);

window.addEventListener('pagehide',stopPlayback);
})();