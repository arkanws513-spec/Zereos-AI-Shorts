// Talking-avatar renderer: six selectable profiles, optional local portrait, audio-reactive mouth.
const avatarProfiles={
 modernMan:{name:'الرجل العصري',url:'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=900&q=85',effect:'photo'},
 modernWoman:{name:'المرأة العصرية',url:'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=900&q=85',effect:'photo'},
 elderMan:{name:'الرجل الملتحي كبير السن',url:'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=900&q=85',effect:'elder'},
 hologram:{name:'الهولوغرام الخيالي',url:'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=900&q=85',effect:'hologram'},
 animeMan:{name:'شخصية الأنمي الرجل',url:'',effect:'animeMan'},
 animeWoman:{name:'شخصية الأنمي المرأة',url:'',effect:'animeWoman'}
};
let activeAvatarId='modernMan',avatarEnabled=false,avatarStudioConnected=false,avatarCustomImages={},avatarLoadedImages={},avatarLoadFailed={},avatarObjectUrls={};
function loadAvatarImage(id,url){
 if(!url||avatarLoadedImages[id]||avatarLoadFailed[id])return;
 const img=new Image();if(/^https?:/i.test(url))img.crossOrigin='anonymous';
 img.onload=()=>{avatarLoadedImages[id]=img;avatarLoadFailed[id]=false;try{drawFrame(playing?Math.max(0,performance.now()-startAt):0)}catch(_){}};
 img.onerror=()=>{avatarLoadFailed[id]=true;const status=$('avatarImageStatus');if(id===activeAvatarId&&status)status.textContent='تعذر تحميل الصورة الافتراضية؛ ارفع صورة للشخصية من جهازك.'};
 img.src=url;
}
function avatarAmplitude(elapsed){
 const buffer=narrationBuffer;if(!buffer||!buffer.numberOfChannels||!buffer.length)return .12+.18*(.5+.5*Math.sin((elapsed/1000)*6));
 const seconds=Math.max(0,elapsed/1000+(narrationTrimStart||0));if(seconds>=buffer.duration)return 0;const center=Math.min(buffer.length-1,Math.floor(seconds*buffer.sampleRate));if(center<0)return 0;
 const data=buffer.getChannelData(0),radius=Math.max(24,Math.floor(buffer.sampleRate*.012));let sum=0,count=0;
 for(let i=Math.max(0,center-radius);i<Math.min(data.length,center+radius);i+=3){sum+=data[i]*data[i];count++}
 const rms=Math.sqrt(sum/Math.max(1,count));return Math.max(0,Math.min(1,rms*5.2));
}
function drawAnimeFallback(x,y,w,h,progress){
 const cx=x+w/2,headY=y+h*.31,rx=w*.28,ry=h*.22,skin=activeAvatarId==='animeWoman'?'#f6d2c6':'#f1c9b2',hair=activeAvatarId==='animeWoman'?'#55336d':'#25334f';
 ctx.save();ctx.shadowColor='#a8b9ff88';ctx.shadowBlur=18;ctx.fillStyle='#171b31';ctx.beginPath();ctx.roundRect(x,y,w,h,28);ctx.fill();ctx.shadowBlur=0;
 ctx.fillStyle=activeAvatarId==='animeWoman'?'#704c9c':'#354b72';ctx.beginPath();ctx.ellipse(cx,y+h*.8,w*.48,h*.3,0,Math.PI,Math.PI*2);ctx.fill();
 ctx.fillStyle=skin;ctx.beginPath();ctx.ellipse(cx,headY,rx,ry,0,0,Math.PI*2);ctx.fill();
 ctx.fillStyle=hair;ctx.beginPath();ctx.ellipse(cx,headY-ry*.18,rx*1.1,ry*.95,0,Math.PI,Math.PI*2);ctx.lineTo(cx+rx,headY+ry*.25);ctx.lineTo(cx+rx*.55,headY);ctx.lineTo(cx,headY+ry*.08);ctx.lineTo(cx-rx*.5,headY+ry*.2);ctx.lineTo(cx-rx,headY+ry*.3);ctx.closePath();ctx.fill();
 ctx.fillStyle='#20253a';ctx.beginPath();ctx.ellipse(cx-rx*.42,headY,rx*.12,ry*.14,0,0,Math.PI*2);ctx.ellipse(cx+rx*.42,headY,rx*.12,ry*.14,0,0,Math.PI*2);ctx.fill();
 ctx.fillStyle='#9d3c55';ctx.beginPath();ctx.ellipse(cx,headY+ry*.43,rx*.22,Math.max(3,ry*.04+progress*ry*.12),0,0,Math.PI*2);ctx.fill();
 ctx.fillStyle='#c6d7ff';ctx.font='bold 18px Tajawal';ctx.textAlign='center';ctx.fillText(avatarProfiles[activeAvatarId].name,cx,y+h-28);ctx.restore();
}
function drawAvatar(elapsed){
 if(!avatarEnabled||!$('avatarEnabled')?.checked)return;
 const profile=avatarProfiles[activeAvatarId];if(!profile)return;
 const scale=Number($('avatarScale')?.value||100)/100,baseW=450*scale,baseH=540*scale,x=(W-baseW)/2,y=H*(Number($('avatarPositionY')?.value||10)/100);
 const image=avatarCustomImages[activeAvatarId]||avatarLoadedImages[activeAvatarId];if(!image&&!profile.url){drawAnimeFallback(x,y,baseW,baseH,avatarAmplitude(elapsed));return}
 if(!image){loadAvatarImage(activeAvatarId,profile.url);drawAvatarPlaceholder(x,y,baseW,baseH,profile.name);return}
 const mouth=avatarAmplitude(elapsed)*(Number($('avatarMouthIntensity')?.value||100)/100),mouthX=Number($('avatarMouthX')?.value||50)/100,mouthY=Number($('avatarMouthY')?.value||56)/100;
 ctx.save();ctx.shadowColor=profile.effect==='hologram'?'#00eaffaa':'#0009';ctx.shadowBlur=profile.effect==='hologram'?34:24;ctx.fillStyle='#090e18';ctx.beginPath();ctx.roundRect(x,y,baseW,baseH,24);ctx.fill();ctx.shadowBlur=0;
 ctx.save();ctx.beginPath();ctx.roundRect(x,y,baseW,baseH,24);ctx.clip();
 const iw=image.naturalWidth||image.width,ih=image.naturalHeight||image.height,ratio=Math.max(baseW/iw,baseH/ih),dw=iw*ratio,dh=ih*ratio;
 ctx.filter=profile.effect==='hologram'?'saturate(1.8) hue-rotate(125deg) contrast(1.15)':profile.effect==='elder'?'sepia(.16) contrast(1.04)':'saturate(1.08)';
 ctx.drawImage(image,x+(baseW-dw)/2,y+(baseH-dh)/2,dw,dh);ctx.filter='none';
 if(profile.effect==='hologram'){ctx.globalAlpha=.24;ctx.fillStyle='#00eaff';ctx.fillRect(x,y,baseW,baseH);ctx.globalAlpha=.75;ctx.strokeStyle='#7df7ff';ctx.lineWidth=2;for(let yy=y+8;yy<y+baseH;yy+=12){ctx.beginPath();ctx.moveTo(x,yy);ctx.lineTo(x+baseW,yy);ctx.stroke()}}
 ctx.restore();
 // Approximate mouth motion follows narration amplitude; align X/Y sliders to each portrait.
 const mx=x+baseW*mouthX,my=y+baseH*mouthY,mw=Math.max(13,baseW*.075),mh=2+mouth*baseH*.042;
 ctx.fillStyle='rgba(54,10,18,.88)';ctx.beginPath();ctx.ellipse(mx,my,mw/2,mh,0,0,Math.PI*2);ctx.fill();
 ctx.strokeStyle=profile.effect==='hologram'?'#9ffaff':'rgba(190,87,91,.9)';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(mx,my,mw/2,mh,0,0,Math.PI*2);ctx.stroke();
 ctx.fillStyle='#f4e2bb';ctx.font='bold 20px Tajawal';ctx.textAlign='center';ctx.direction='rtl';ctx.shadowColor='#000';ctx.shadowBlur=8;ctx.fillText(profile.name,W/2,y+baseH+28);ctx.restore();
}
function drawAvatarPlaceholder(x,y,w,h,label){
 ctx.save();ctx.shadowColor='#0009';ctx.shadowBlur=20;ctx.fillStyle='#111a2b';ctx.beginPath();ctx.roundRect(x,y,w,h,24);ctx.fill();ctx.shadowBlur=0;
 const cx=x+w/2,cy=y+h*.34;ctx.fillStyle='#263753';ctx.beginPath();ctx.arc(cx,cy,88,0,Math.PI*2);ctx.fill();ctx.fillStyle='#d7c1a2';ctx.beginPath();ctx.arc(cx,cy,62,0,Math.PI*2);ctx.fill();ctx.fillStyle='#243047';ctx.beginPath();ctx.ellipse(cx,y+h*.8,155,135,0,Math.PI,Math.PI*2);ctx.fill();ctx.fillStyle='#f4e2bb';ctx.font='bold 22px Tajawal';ctx.textAlign='center';ctx.fillText(label,cx,y+h-34);ctx.restore();
}
function selectAvatar(id){
 if(!avatarProfiles[id])return;activeAvatarId=id;window.ZereosActiveAvatarId=id;
 document.querySelectorAll('[data-avatar-preset]').forEach(b=>b.classList.toggle('active',b.dataset.avatarPreset===id));
 const title=$('avatarSelectedTitle');if(title)title.textContent='إعدادات '+avatarProfiles[id].name;
 const status=$('avatarImageStatus');if(status)status.textContent='الشخصية المحددة: '+avatarProfiles[id].name+'. يمكن تحميل نموذج GLB مخصص لهذه الشخصية.';
 window.ZereosTalkingAvatar?.retry?.(id);
 if($('avatarImageFile'))$('avatarImageFile').value='';
 if(typeof drawFrame==='function')drawFrame(playing?Math.max(0,performance.now()-startAt):0);
}
function connectAvatarStudio(){
 if(avatarStudioConnected)return;avatarStudioConnected=true;
 document.querySelectorAll('[data-avatar-preset]').forEach(b=>b.addEventListener('click',()=>selectAvatar(b.dataset.avatarPreset)));
 $('avatarEnabled')?.addEventListener('change',e=>{avatarEnabled=e.target.checked;drawFrame(0)});
 ['avatarScale','avatarPositionY','avatarMouthX','avatarMouthY','avatarMouthIntensity'].forEach(id=>$(id)?.addEventListener('input',()=>{const v=$(id).value,el=$(id+'Value');if(el)el.textContent=(id==='avatarScale'?v+'%':id==='avatarPositionY'?v+'%':id==='avatarMouthIntensity'?v+'%':v+'%');drawFrame(playing?Math.max(0,performance.now()-startAt):0)}));
 $('avatarImageFile')?.addEventListener('change',e=>{const file=e.target.files?.[0];if(!file)return;if(!file.type.startsWith('image/')){ $('avatarImageStatus').textContent='اختر ملف صورة صالحًا.';return}if(file.size>12*1024*1024){$('avatarImageStatus').textContent='حجم الصورة كبير؛ اختر صورة أقل من 12 ميجابايت.';e.target.value='';return}
 const url=URL.createObjectURL(file),img=new Image();img.onload=()=>{if(avatarObjectUrls[activeAvatarId])URL.revokeObjectURL(avatarObjectUrls[activeAvatarId]);avatarObjectUrls[activeAvatarId]=url;avatarCustomImages[activeAvatarId]=img;$('avatarImageStatus').textContent='تم تحميل الصورة محليًا. اضبط موضع الفم ليطابق الوجه.';drawFrame(playing?Math.max(0,performance.now()-startAt):0)};img.onerror=()=>{$('avatarImageStatus').textContent='تعذر فتح الصورة؛ جرّب ملف PNG أو JPG.';URL.revokeObjectURL(url)};img.src=url;
 });
 $('avatarApplyBtn')?.addEventListener('click',()=>{avatarEnabled=true;$('avatarEnabled').checked=true;drawFrame(playing?Math.max(0,performance.now()-startAt):0);$('avatarStatus').textContent='تم تطبيق إعدادات الأفاتار على المعاينة، وستظهر في تصدير الفيديو.'});
 $('avatarResetBtn')?.addEventListener('click',()=>{$('avatarEnabled').checked=true;avatarEnabled=true;$('avatarScale').value=100;$('avatarPositionY').value=10;$('avatarMouthX').value=50;$('avatarMouthY').value=56;$('avatarMouthIntensity').value=100;['avatarScale','avatarPositionY','avatarMouthX','avatarMouthY','avatarMouthIntensity'].forEach(id=>{const el=$(id+'Value');if(el)el.textContent=$(id).value+'%'});drawFrame(0);$('avatarStatus').textContent='تمت إعادة إعدادات الشخصية إلى القيم الافتراضية.'});
 if(avatarProfiles[activeAvatarId]?.url)loadAvatarImage(activeAvatarId,avatarProfiles[activeAvatarId].url);
}
function drawAvatarScene(elapsed,subtitleText=''){
 const profile=avatarProfiles[activeAvatarId];if(!profile)return;
 ctx.clearRect(0,0,W,H);
 const progress=elapsed/1000, pulse=.5+.5*Math.sin(progress*1.1);
 // Each avatar owns its entire scene; template graphics and template text are intentionally bypassed.
 if(activeAvatarId==='elderMan'){
   const bg=ctx.createLinearGradient(0,0,W,H);bg.addColorStop(0,'#211b18');bg.addColorStop(1,'#070707');ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
 }else if(activeAvatarId==='modernMan'){
   const bg=ctx.createLinearGradient(0,0,W,H);bg.addColorStop(0,'#162b3d');bg.addColorStop(.58,'#304958');bg.addColorStop(1,'#111b24');ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
   ctx.fillStyle='#a8c9d5';ctx.globalAlpha=.2;ctx.fillRect(W*.08,H*.08,W*.32,H*.42);ctx.fillRect(W*.12,H*.08,W*.018,H*.42);ctx.fillRect(W*.08,H*.28,W*.32,H*.018);ctx.globalAlpha=1;
   ctx.fillStyle='#19232d';ctx.fillRect(0,H*.68,W,H*.32);ctx.fillStyle='#8b6544';ctx.fillRect(0,H*.72,W,H*.025);ctx.fillStyle='#bd966b';ctx.globalAlpha=.6;ctx.fillRect(0,H*.745,W,H*.008);ctx.globalAlpha=1;
 }else if(activeAvatarId==='modernWoman'){
   const bg=ctx.createLinearGradient(0,0,W,H);bg.addColorStop(0,'#101d38');bg.addColorStop(.55,'#203b60');bg.addColorStop(1,'#0b1425');ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
   ctx.fillStyle='#18395c';ctx.fillRect(0,H*.09,W,H*.53);ctx.strokeStyle='#60d6e9';ctx.lineWidth=3;
   for(let i=0;i<5;i++){ctx.globalAlpha=.25+.12*pulse;ctx.beginPath();ctx.moveTo(W*(.08+i*.21),H*.1);ctx.lineTo(W*(.08+i*.21),H*.61);ctx.stroke()}ctx.globalAlpha=1;
   ctx.fillStyle='#d8edf4';ctx.globalAlpha=.16;ctx.fillRect(W*.06,H*.12,W*.88,H*.12);ctx.globalAlpha=1;
   ctx.fillStyle='#09111e';ctx.fillRect(0,H*.78,W,H*.22);ctx.fillStyle='#e54d65';ctx.fillRect(0,H*.78,W*.22,H*.012);ctx.fillStyle='#f2f6fb';ctx.font='bold '+Math.round(W*.035)+'px sans-serif';ctx.textAlign='left';ctx.fillText('LIVE  •  ZEREOS',W*.07,H*.83);
 }else if(activeAvatarId==='hologram'){
   const bg=ctx.createRadialGradient(W*.5,H*.35,10,W*.5,H*.5,H*.8);bg.addColorStop(0,'#103f58');bg.addColorStop(1,'#030914');ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
   ctx.strokeStyle='#29d9f5';ctx.globalAlpha=.22;ctx.lineWidth=2;for(let yy=H*.12;yy<H;yy+=H*.045){ctx.beginPath();ctx.moveTo(0,yy);ctx.lineTo(W,yy);ctx.stroke()}ctx.globalAlpha=1;
 }else{
   const bg=ctx.createLinearGradient(0,0,W,H);bg.addColorStop(0,'#17142d');bg.addColorStop(1,'#080d1a');ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
 }
 const mouth=avatarAmplitude(elapsed)*(Number($('avatarMouthIntensity')?.value||100)/100);
 const ready=window.ZereosTalkingAvatar?.draw?.(ctx,W,H,activeAvatarId,elapsed,mouth)===true;
 if(!ready){
   ctx.save();
   const cardW=W*.82,cardH=H*.46,cx=W/2,cy=H*.43;
   ctx.fillStyle='rgba(7,12,22,.82)';ctx.strokeStyle=activeAvatarId==='hologram'?'#28dff5':'#a6b7d4';ctx.lineWidth=2;
   ctx.beginPath();ctx.roundRect(cx-cardW/2,cy-cardH/2,cardW,cardH,28);ctx.fill();ctx.stroke();
   ctx.fillStyle='#dce8f5';ctx.textAlign='center';ctx.direction='rtl';ctx.font='bold '+Math.round(W*.042)+'px Tajawal, sans-serif';
   ctx.fillText('جارٍ تجهيز الشخصية ثلاثية الأبعاد',cx,cy-4,cardW*.9);
   ctx.font=Math.round(W*.028)+'px Tajawal, sans-serif';ctx.fillStyle='#aab9ca';
   ctx.fillText('قد يستغرق التحميل الأول بعض الوقت',cx,cy+H*.055,cardW*.9);
   ctx.restore();
 }
 // Simple desk foreground for the presenter scene, independent from all template options.
 if(activeAvatarId==='modernMan'){ctx.fillStyle='#171d25';ctx.beginPath();ctx.moveTo(0,H*.79);ctx.lineTo(W,H*.76);ctx.lineTo(W,H);ctx.lineTo(0,H);ctx.closePath();ctx.fill();ctx.fillStyle='#a8794f';ctx.fillRect(0,H*.79,W,H*.018);ctx.fillStyle='#111923';ctx.fillRect(W*.62,H*.755,W*.2,H*.035);}
 if(activeAvatarId==='modernWoman'){ctx.fillStyle='#0a1321';ctx.fillRect(0,H*.88,W,H*.12);ctx.fillStyle='#e64e67';ctx.fillRect(0,H*.88,W*.25,H*.012);}
 if($('captions')?.checked&&String(subtitleText||'').trim()){
   ctx.save();const barH=H*.11;ctx.fillStyle='rgba(4,8,15,.78)';ctx.fillRect(W*.055,H*.84,W*.89,barH);
   ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.direction='rtl';ctx.font='bold '+Math.round(W*.04)+'px Tajawal, sans-serif';
   const lines=wrapText(String(subtitleText),W*.82,ctx.font).slice(0,2);lines.forEach((line,i)=>ctx.fillText(line,W/2,H*.875+i*W*.047,W*.82));ctx.restore();
 }
}
function drawFrame(elapsed=0){const timeline=sceneTimeline(),sceneTotal=timeline[timeline.length-1]?.end||Number($('sceneSeconds').value)*4000,total=timedSubtitlesEnabled&&timedSubtitleCues.length?Math.max(sceneTotal,Math.max(...timedSubtitleCues.map(c=>c.end))-Math.min(narrationTrimStart*1000,Math.max(0,(narrationBuffer?.duration||0)*1000))):sceneTotal,safeElapsed=Math.max(0,Math.min(Number(elapsed)||0,total)),t=Math.min(safeElapsed,Math.max(0,total-1));let scene=timeline.findIndex((item,i)=>t>=item.start&&(t<item.end||i===timeline.length-1));if(scene<0)scene=timeline.length-1;const sceneElapsed=t-timeline[scene].start,sceneLen=timeline[scene].end-timeline[scene].start,subtitleClock=t+(narrationBuffer?Math.min(narrationTrimStart*1000,Math.max(0,narrationBuffer.duration*1000)):0),activeTimedCue=timedSubtitlesEnabled?timedSubtitleCues.find(cue=>subtitleClock>=cue.start&&subtitleClock<cue.end):null;currentScene=scene;updateTimelineUI(scene);const arr=texts();if(avatarEnabled&&$('avatarEnabled')?.checked){drawAvatarScene(safeElapsed,timedSubtitlesEnabled?(activeTimedCue?.text||''):(arr[scene]||''));$('clock').textContent=formatTime(safeElapsed/1000)+' / '+formatTime(total/1000);$('progress').style.width=(safeElapsed/total*100)+'%';return}ctx.clearRect(0,0,W,H);drawBackground(safeElapsed);drawImportedImage(safeElapsed);drawTemplateComposition(safeElapsed,scene,sceneElapsed,sceneLen);drawOrnament(safeElapsed);drawParticles(safeElapsed);drawAvatar(safeElapsed);drawTextBlock(timedSubtitlesEnabled?(activeTimedCue?.text||''):(arr[scene]||''),scene,t,activeTimedCue?Math.max(0,subtitleClock-activeTimedCue.start):sceneElapsed,activeTimedCue?activeTimedCue.end-activeTimedCue.start:sceneLen);drawSeal();ctx.save();ctx.textAlign='center';ctx.direction='ltr';ctx.font='18px Tajawal';ctx.fillStyle='#e8c783';ctx.globalAlpha=.75;ctx.fillText('Z E R E O S   •   W I S D O M',W/2,H-65);ctx.restore();const edge=sceneElapsed,fadeMs=320,fade=Math.max(0,1-Math.min(edge,sceneLen-edge)/fadeMs),transition=$('sceneTransition')?.value||'fade';if(safeElapsed>0&&safeElapsed<total&&fade>0&&transition!=='cut'){ctx.save();ctx.globalAlpha=fade*(transition==='flash'?.62:.48);ctx.fillStyle=transition==='flash'?'#fff':'#000';ctx.fillRect(0,0,W,H);ctx.restore()}$('clock').textContent=formatTime(safeElapsed/1000)+' / '+formatTime(total/1000);$('progress').style.width=(safeElapsed/total*100)+'%'}
function formatTime(s){s=Math.floor(Math.max(0,s));return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')}
function frameLoop(now){if(!playing)return;const timeline=sceneTimeline(),elapsed=previewOnlyScene===null?now-startAt:timeline[previewOnlyScene].start+(now-startAt),scene=Math.max(0,timeline.findIndex((item,i)=>elapsed>=item.start&&(elapsed<item.end||i===timeline.length-1)));drawFrame(elapsed);if(scene!==lastSpeak){lastSpeak=scene;const line=texts()[scene];/* Device speech synthesis disabled: preview is silent unless an audio file is attached. */}const finished=previewOnlyScene===null?elapsed>=totalMs():now-startAt>=timeline[previewOnlyScene].end-timeline[previewOnlyScene].start;if(finished){playing=false;previewOnlyScene=null;cancelAnimationFrame(raf);$('playBtn').textContent='▶ تشغيل المعاينة';stopPreviewNarration();stopMusic();if(importedSceneVideo)importedSceneVideo.pause();drawFrame(elapsed);$('status').textContent='انتهت المعاينة.';return}raf=requestAnimationFrame(frameLoop)}
function startPreview(){if(playing){playing=false;previewOnlyScene=null;cancelAnimationFrame(raf);$('playBtn').textContent='▶ تشغيل المعاينة';stopPreviewNarration();stopMusic();if(importedSceneVideo)importedSceneVideo.pause();$('status').textContent='تم إيقاف المعاينة.';return}previewOnlyScene=null;try{const ac=ensureAudio();ac.resume();startMusic();startPreviewNarration(0,totalMs());if(importedSceneVideo){importedSceneVideo.currentTime=0;importedSceneVideo.play().catch(error=>console.warn('تعذر تشغيل خلفية الفيديو:',error))}}catch(e){console.warn('تعذر تشغيل الصوت أو الخلفية:',e)}playing=true;lastSpeak=-1;startAt=performance.now();$('playBtn').textContent='Ⅱ إيقاف المعاينة';$('status').textContent=narrationBuffer?'المعاينة تعمل مع التعليق الصوتي والموسيقى…':'المعاينة تعمل؛ أضف تعليقًا صوتيًا لسماع الراوي.';raf=requestAnimationFrame(frameLoop)}
function playSingleScene(index){if(playing){playing=false;cancelAnimationFrame(raf)}stopPreviewNarration();stopMusic();previewOnlyScene=Math.max(0,Math.min(3,Number(index)||0));const timeline=sceneTimeline(),scene=timeline[previewOnlyScene];try{const ac=ensureAudio();ac.resume();startMusic();startPreviewNarration(scene.start,scene.end-scene.start);if(importedSceneVideo){importedSceneVideo.currentTime=0;importedSceneVideo.play().catch(error=>console.warn(error))}}catch(error){console.warn(error)}lastSpeak=-1;playing=true;startAt=performance.now();$('playBtn').textContent='Ⅱ إيقاف المعاينة';$('status').textContent='معاينة المشهد '+(previewOnlyScene+1)+(narrationBuffer?' مع التعليق الصوتي…':' فقط…');raf=requestAnimationFrame(frameLoop)}
function resetPreview(){playing=false;cancelAnimationFrame(raf);previewElapsed=0;lastSpeak=-1;stopPreviewNarration();stopMusic();$('playBtn').textContent='▶ تشغيل المعاينة';drawFrame(0);$('status').textContent='تمت إعادة المعاينة.'}
function fillPreset(p){$('scriptTitle').value=p.title;$('scriptBody1').value=p.body1;$('scriptBody2').value=p.body2;$('scriptCta').value=p.cta;clearStaleNarrationForScriptChange();drawFrame(0);$('status').textContent='تم تطبيق الحكمة.'}
function renderPresets(){$('presets').innerHTML='';presets.forEach((p,i)=>{const b=document.createElement('button');b.className='preset';b.textContent=(i+1)+'. '+p.title;b.onclick=()=>fillPreset(p);$('presets').appendChild(b)})}
function update(){ $('fontSizeVal').textContent=$('fontSize').value;$('sceneSecondsVal').textContent=$('sceneSeconds').value;$('volumeVal').textContent=Math.round(Number($('volume').value)*100)+'%';if($('glowIntensityVal')&&$('glowIntensity'))$('glowIntensityVal').textContent=$('glowIntensity').value;if($('cameraMotionSpeedVal')&&$('cameraMotionSpeed'))$('cameraMotionSpeedVal').textContent=Number($('cameraMotionSpeed').value).toFixed(1)+'×';if($('narrationVolumeVal'))$('narrationVolumeVal').textContent=Math.round(Number($('narrationVolume').value)*100)+'%';updateWordCount();saveDraft();drawFrame(0);updateLiveRecordingPrompt()}
function updateWordCount(){const content=texts().filter(Boolean).join(' '),words=content.trim()?content.trim().split(/\s+/).length:0;$('wordCount').textContent=words+' كلمة · '+content.length+' حرف'}
const draftIds=['scriptTitle','scriptBody1','scriptBody2','scriptCta','bulkText','bgStyle','fontFamily','fontSize','sceneSeconds','imageMotion','cameraMotionSpeed','textAnimation','graphicFrame','sceneTransition','exportProfile','glowIntensity','dust','seal','captions','captionStyle','music','volume','narrationVolume'];
function saveDraft(){try{const draft={};draftIds.forEach(id=>{const el=$(id);if(el)draft[id]=el.type==='checkbox'?el.checked:el.value});localStorage.setItem('zereos-shorts-draft-v2',JSON.stringify(draft));$('saveState').textContent='تم الحفظ تلقائيًا على هذا الجهاز.'}catch(error){$('saveState').textContent='الحفظ المحلي غير متاح في هذا المتصفح.'}}
function restoreDraft(){try{const draft=JSON.parse(localStorage.getItem('zereos-shorts-draft-v2')||'{}');draftIds.forEach(id=>{const el=$(id);if(!el||!(id in draft))return;if(el.type==='checkbox')el.checked=Boolean(draft[id]);else el.value=draft[id]});if(Object.keys(draft).length)$('saveState').textContent='تم استرجاع مسودتك المحفوظة على هذا الجهاز.'}catch(error){console.warn('تعذر استرجاع المسودة:',error)}}
function distributeScript(){const raw=$('bulkText').value.trim();if(!raw){$('status').textContent='الصق النص الطويل أولًا.';return}let chunks=raw.match(/[^.!؟?]+[.!؟?]*/g)||[raw];chunks=chunks.map(x=>x.trim()).filter(Boolean);const scenes=['','','',''];if(chunks.length<4){const words=raw.split(/\s+/),size=Math.ceil(words.length/4);for(let i=0;i<4;i++)scenes[i]=words.slice(i*size,(i+1)*size).join(' ')}else{let index=0,used=0,target=raw.length/4;chunks.forEach(part=>{if(index<3&&used>=target*(index+1))index++;scenes[index]+=(scenes[index]?' ':'')+part;used+=part.length})}['scriptTitle','scriptBody1','scriptBody2','scriptCta'].forEach((id,i)=>$(id).value=scenes[i]);clearStaleNarrationForScriptChange();update();$('status').textContent='تم توزيع النص على المشاهد الأربعة. راجع التقسيم قبل التصدير.'}
async function copyScript(){const text=texts().filter(Boolean).join('\n\n');try{await navigator.clipboard.writeText(text);$('status').textContent='تم نسخ النص كاملًا.'}catch(error){$('status').textContent='تعذر النسخ تلقائيًا؛ حدّد النص وانسخه يدويًا.'}}
function exportThumbnail(){try{drawFrame(playing?Math.max(0,performance.now()-startAt):0);const link=document.createElement('a');link.download='zereos-thumbnail-'+Date.now()+'.png';link.href=canvas.toDataURL('image/png');document.body.appendChild(link);link.click();link.remove();$('status').textContent='تم حفظ غلاف الفيديو بصيغة PNG.'}catch(error){console.error(error);$('status').textContent='تعذر حفظ الغلاف؛ جرّب إيقاف المعاينة ثم أعد المحاولة.'}}
function exportSubtitles(){const trimOffset=narrationBuffer?Math.min(narrationTrimStart*1000,Math.max(0,(narrationBuffer.duration-.05)*1000)):0;let cues;if(timedSubtitlesEnabled&&timedSubtitleCues.length)cues=timedSubtitleCues.map(cue=>({line:cue.text,start:Math.max(0,cue.start-trimOffset),end:Math.max(0,cue.end-trimOffset)})).filter(cue=>cue.end>cue.start&&cue.line.trim());else{const lines=texts(),timeline=sceneTimeline();cues=lines.map((line,index)=>({line:String(line||'').trim(),start:timeline[index].start,end:timeline[index].end})).filter(cue=>cue.line)}const stamp=ms=>{const total=Math.max(0,Math.floor(ms/1000)),hours=Math.floor(total/3600),minutes=Math.floor(total%3600/60),seconds=total%60,millis=Math.floor(ms%1000);return String(hours).padStart(2,'0')+':'+String(minutes).padStart(2,'0')+':'+String(seconds).padStart(2,'0')+','+String(millis).padStart(3,'0')};if(!cues.length){$('status').textContent='اكتب نصًا أو استورد ملف ترجمة صالحًا قبل التصدير.';return}const srt='\uFEFF'+cues.map((cue,index)=>(index+1)+'\n'+stamp(cue.start)+' --> '+stamp(cue.end)+'\n'+cue.line).join('\n\n')+'\n';const blob=new Blob([srt],{type:'application/x-subrip;charset=utf-8'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='zereos-subtitles-'+Date.now()+'.srt';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);$('status').textContent=timedSubtitlesEnabled?'تم تصدير الترجمة المستوردة بتوقيتها الأصلي بعد احتساب قص الصوت.':'تم تنزيل ملف الترجمة SRT وفق '+(narrationBuffer?'مدة التعليق الصوتي الفعلية':'مدة المشاهد المحددة')+'؛ التوقيت غير المستورد يظل تقديريًا.'}
function exportWordSubtitles(format='srt'){const lines=texts(),timeline=sceneTimeline(),cues=[];lines.forEach((line,index)=>{if(!String(line||'').trim())return;wordTimings(line,timeline[index].start,timeline[index].end).forEach(item=>cues.push(item))});if(!cues.length){$('status').textContent='اكتب نصًا في مشهد واحد على الأقل قبل تصدير الترجمة.';return}const stamp=(ms,webvtt=false)=>{const total=Math.max(0,Math.floor(ms/1000)),hours=Math.floor(total/3600),minutes=Math.floor(total%3600/60),seconds=total%60,millis=Math.floor(ms%1000);return String(hours).padStart(2,'0')+':'+String(minutes).padStart(2,'0')+':'+String(seconds).padStart(2,'0')+(webvtt?'.':',')+String(millis).padStart(3,'0')};const webvtt=format==='vtt',body=cues.map((cue,index)=>(webvtt?'':(index+1)+'\n')+stamp(cue.start,webvtt)+' --> '+stamp(cue.end,webvtt)+'\n'+cue.word).join('\n\n');const content=(webvtt?'WEBVTT\n\n':'\uFEFF')+body+'\n';const blob=new Blob([content],{type:webvtt?'text/vtt;charset=utf-8':'application/x-subrip;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='zereos-word-captions-'+Date.now()+'.'+(webvtt?'vtt':'srt');document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);$('status').textContent='تم تنزيل ترجمة كلمة بكلمة بتوقيت تقديري موزّع حسب طول الكلمات وعلامات الوقف؛ ليست محاذاة صوتية دقيقة.'}
function switchTab(name){document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));['script','style','audio','export'].forEach(n=>{const el=$('tab-'+n);if(el)el.classList.toggle('hidden',n!==name)});const titles={script:['المحتوى والمشاهد','اكتب القصة ووزّعها على أربعة مشاهد.'],style:['تصميم المشاهد','اضبط الخلفيات والخط والحركة والهوية البصرية.'],audio:['الصوت والتعليق','اختر الموسيقى وسجّل أو أضف التعليق الصوتي.'],export:['تصدير الفيديو والمشروع','أنشئ الفيديو واحفظ مشروعك أو صدّره.']};if(titles[name]){$('workspaceTitle').textContent=titles[name][0];$('workspaceDescription').textContent=titles[name][1]}document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.page===name));}
function showToolPage(name){const layout=document.querySelector('main.layout'),editor=$('editorWorkspace'),preview=document.querySelector('.preview'),media=$('mediaPanel'),projects=$('projectsPanel'),standalone=['voiceDesignPage','neuralVoicePage','voiceLibraryPage'],customPages=['templatesPage','sceneStudioPage','avatarPage'],solo=standalone.includes(name);layout.classList.toggle('workspace-library',name==='media'||name==='projects'||solo);if(preview)preview.classList.toggle('hidden',name==='media'||name==='projects'||solo);if(media)media.classList.toggle('hidden',name!=='media');if(projects)projects.classList.toggle('hidden',name!=='projects');editor.classList.toggle('hidden',name==='media'||name==='projects'||solo||customPages.includes(name));customPages.forEach(id=>{const p=$(id);if(p){p.hidden=id!==name;p.classList.toggle('hidden',id!==name)}});standalone.forEach(id=>{const p=$(id);if(p){p.hidden=id!==name;p.classList.toggle('hidden',id!==name)}});document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.page===name));if(name==='media'){$('mediaBtn')?.click();media?.classList.remove('hidden')}if(name==='projects'){$('projectsBtn')?.click();projects?.classList.remove('hidden')}if(['script','style','audio','export'].includes(name)){if(media)media.classList.add('hidden');if(projects)projects.classList.add('hidden');switchTab(name)}if(name==='voiceLibraryPage')window.ZereosRefreshVoiceLibrary?.();if(name==='templatesPage')setVideoTemplate(activeTemplate);if(name==='sceneStudioPage')updateSceneTextPreviews();if(name==='avatarPage')connectAvatarStudio();if(name==='export'){setTimeout(()=>$('tab-export')?.scrollIntoView({behavior:'smooth',block:'start'}),30)}}
document.querySelectorAll('.nav-item').forEach(button=>button.addEventListener('click',()=>showToolPage(button.dataset.page)));
const leaveCover=()=>{$('appCover')?.classList.add('is-gone');try{sessionStorage.setItem('zereos-cover-seen','1')}catch(_){}};
$('startAppBtn').addEventListener('click',leaveCover);
document.querySelector('.skip-link')?.addEventListener('click',leaveCover);
try{if(sessionStorage.getItem('zereos-cover-seen')==='1')$('appCover').classList.add('is-gone')}catch(_){}

const voiceCharacterPresets={
 mystery:{description:'رجل مصري بالغ، صوت وثائقي عميق ودافئ، إيقاع بطيء محسوب، غموض وتشويق واضحان، نطق مصري طبيعي، أداء سينمائي احترافي دون مبالغة.'},
 documentary:{description:'راوٍ عربي فصيح، صوت بالغ ثابت وواثق، مخارج حروف واضحة، نبرة وثائقية احترافية، إيقاع متوسط وهادئ، تعبير طبيعي غير آلي.'},
 egyptian:{description:'رجل مصري بالغ، لهجة مصرية طبيعية أصيلة، صوت دافئ وقريب من المستمع، أداء عفوي وواضح، سرعة متوسطة دون تمثيل مبالغ.'},
 news:{description:'مذيع أخبار عربي بالغ، صوت واضح وحازم، نطق دقيق، إيقاع منظم وثابت، ثقة وحياد، أسلوب إذاعي احترافي.'},
 female:{description:'امرأة عربية بالغة، صوت وثائقي دافئ وواضح، نبرة متزنة وواثقة، نطق فصيح طبيعي، إيقاع متوسط وتعبير رصين.'},
 energetic:{description:'رجل عربي بالغ، صوت حيوي وحماسي، نطق واضح وسريع باعتدال، طاقة مرتفعة وتعبير مشوق، دون صراخ أو مبالغة.'},
 whisper:{description:'رجل عربي بالغ، صوت هادئ وخافت قليلًا، أداء قصصي حميم وغامض، إيقاع بطيء مع وقفات طبيعية، وضوح ممتاز دون همس مبالغ.'}
};
const characterSelect=document.getElementById('voiceCharacterPreset');
const characterDescription=document.getElementById('voiceCharacterDescription');
const characterStatus=document.getElementById('voiceCharacterStatus');
function updateVoiceCharacter(){if(!characterSelect||!characterDescription)return;characterDescription.value=voiceCharacterPresets[characterSelect.value]?.description||voiceCharacterPresets.mystery.description}
characterSelect?.addEventListener('change',updateVoiceCharacter);updateVoiceCharacter();
async function copyVoiceText(text,label){try{await navigator.clipboard.writeText(text);if(characterStatus)characterStatus.textContent='تم نسخ '+label+'؛ افتح محرك الصوت والصقه.'}catch(error){if(characterDescription){characterDescription.focus();characterDescription.select();if(characterStatus)characterStatus.textContent='تعذر النسخ التلقائي في هذا المتصفح. تم تحديد الوصف؛ انسخه يدويًا.'}}}
document.getElementById('copyVoiceDescriptionBtn')?.addEventListener('click',()=>copyVoiceText(characterDescription?.value||'', 'وصف الشخصية'));
document.getElementById('copyVoicePackageBtn')?.addEventListener('click',()=>{const narration=document.getElementById('neuralTtsText')?.value?.trim()||['scriptTitle','scriptBody1','scriptBody2','scriptCta'].map(id=>document.getElementById(id)?.value?.trim()).filter(Boolean).join('\n\n');if(!narration){if(characterStatus)characterStatus.textContent='اكتب نص التعليق أولًا في حقل توليد الصوت أو جهّز نص المشاهد.';return}copyVoiceText('وصف الشخصية الصوتية:\n'+(characterDescription?.value||'')+'\n\nالنص المراد تحويله إلى صوت:\n'+narration,'وصف الشخصية والنص')});
function audioClock(seconds){const value=Math.max(0,Number(seconds)||0),minutes=Math.floor(value/60),secs=Math.floor(value%60),tenths=Math.floor((value%1)*10);return String(minutes).padStart(2,'0')+':'+String(secs).padStart(2,'0')+(tenths?'.'+tenths:'')}
function drawNarrationWaveform(){const canvas=$('narrationWaveform');if(!canvas)return;const c=canvas.getContext('2d'),w=canvas.width,h=canvas.height;c.clearRect(0,0,w,h);c.fillStyle='#090b12';c.fillRect(0,0,w,h);if(!narrationBuffer){c.fillStyle='#b9a98f';c.font='20px Tajawal';c.textAlign='center';c.fillText('حمّل تعليقًا صوتيًا لعرض الموجة',w/2,h/2);return}const data=narrationBuffer.getChannelData(0),step=Math.max(1,Math.floor(data.length/w)),middle=h/2,trimStart=Math.min(narrationTrimStart,Math.max(0,narrationBuffer.duration-.05)),trimEnd=effectiveNarrationEnd(),startX=trimStart/narrationBuffer.duration*w,endX=trimEnd/narrationBuffer.duration*w;c.fillStyle='#2b2b3a';c.fillRect(0,0,w,h);c.fillStyle='#e9ad42';for(let x=0;x<w;x++){let peak=0;const from=x*step,to=Math.min(data.length,from+step);for(let i=from;i<to;i+=3)peak=Math.max(peak,Math.abs(data[i]));const bar=Math.max(1,peak*(h*.78));c.fillRect(x,middle-bar/2,1,bar)}c.fillStyle='rgba(4,7,15,.72)';c.fillRect(0,0,startX,h);c.fillRect(endX,0,w-endX,h);c.strokeStyle='#ffe29a';c.lineWidth=2;c.beginPath();c.moveTo(startX,0);c.lineTo(startX,h);c.moveTo(endX,0);c.lineTo(endX,h);c.stroke();const seekX=Math.max(startX,Math.min(endX,(narrationSeekSeconds/narrationBuffer.duration)*w));c.strokeStyle='#ffffff';c.lineWidth=2;c.beginPath();c.moveTo(seekX,0);c.lineTo(seekX,h);c.stroke()}
function updateNarrationEditor(){const canvas=$('narrationWaveform'),start=$('narrationTrimStart'),end=$('narrationTrimEnd'),seek=$('narrationSeek'),play=$('playNarrationSelectionBtn'),reset=$('resetNarrationTrimBtn');if(!canvas||!start||!end||!seek)return;const ready=!!narrationBuffer,duration=ready?Math.max(.1,narrationBuffer.duration):1;if(ready){narrationTrimStart=Math.max(0,Math.min(narrationTrimStart,duration-.05));narrationTrimEnd=Math.max(narrationTrimStart+.05,Math.min(narrationTrimEnd==null?duration:narrationTrimEnd,duration));start.max=String(Math.max(0,duration-.05));end.max=String(duration);start.step=end.step='0.05';start.value=String(narrationTrimStart);end.value=String(narrationTrimEnd);seek.disabled=false;start.disabled=false;end.disabled=false;play.disabled=false;reset.disabled=false;$('narrationTrimStartVal').textContent=audioClock(narrationTrimStart);$('narrationTrimEndVal').textContent=audioClock(narrationTrimEnd);$('narrationTrimSummary').textContent='المدة الأصلية '+audioClock(duration)+' · الجزء المستخدم '+audioClock(effectiveNarrationDuration());narrationSeekSeconds=Math.max(narrationTrimStart,Math.min(narrationTrimEnd,narrationSeekSeconds));seek.value=String(Math.round(narrationSeekSeconds/duration*1000));$('narrationSeekTime').textContent=audioClock(narrationSeekSeconds)}else{start.disabled=end.disabled=seek.disabled=play.disabled=reset.disabled=true;$('narrationTrimSummary').textContent='لم يُحمّل تعليق صوتي بعد.';$('narrationSeekTime').textContent='00:00';$('narrationTrimStartVal').textContent=$('narrationTrimEndVal').textContent='00:00'}drawNarrationWaveform();cachedTimelineBuffer=null;cachedTimelineKey='';cachedTimelineValue=null;updateTimelineUI();drawFrame(playing?Math.max(0,performance.now()-startAt):0)}
function parseTimedSubtitleText(raw){const cleaned=String(raw||'').replace(/^\uFEFF/,'').replace(/\r/g,'').trim(),blocks=cleaned.split(/\n\s*\n/);const parseTime=value=>{const parts=value.trim().replace(',', '.').split(':');let seconds=0;if(parts.length===3)seconds=Number(parts[0])*3600+Number(parts[1])*60+Number(parts[2]);else if(parts.length===2)seconds=Number(parts[0])*60+Number(parts[1]);return Number.isFinite(seconds)&&seconds>=0?seconds*1000:null};const cues=[];for(const block of blocks){const lines=block.split('\n').map(line=>line.trim()).filter(Boolean),index=lines.findIndex(line=>line.includes('-->'));if(index<0)continue;const match=lines[index].match(/(\d{1,2}:)?\d{2}:\d{2}[,.]\d{3}\s*-->\s*(\d{1,2}:)?\d{2}:\d{2}[,.]\d{3}/);if(!match)continue;const times=match[0].split('-->').map(value=>value.trim()),start=parseTime(times[0]),end=parseTime(times[1]),text=lines.slice(index+1).join(' ').replace(/<[^>]*>/g,'').replace(/\{[^}]*\}/g,'').trim();if(start!==null&&end!==null&&end>start&&text)cues.push({start,end,text})}return cues.sort((a,b)=>a.start-b.start)}
function connectTimedSubtitles(){const input=$('subtitleTimingFile'),toggle=$('useTimedSubtitles'),clear=$('clearTimedSubtitlesBtn');input?.addEventListener('change',async event=>{const file=event.target.files?.[0];if(!file)return;try{const cues=parseTimedSubtitleText(await file.text());if(!cues.length)throw Error('لم أجد مقاطع ذات طوابع زمنية صالحة.');timedSubtitleCues=cues;timedSubtitlesEnabled=true;toggle.disabled=false;toggle.checked=true;clear.disabled=false;$('subtitleTimingStatus').textContent='تم تحميل '+cues.length+' مقطعًا من '+file.name+'؛ سيُستخدم توقيتها داخل المعاينة والتصدير.';drawFrame(0);$('status').textContent='تم تفعيل الترجمة ذات التوقيت المستورد.'}catch(error){timedSubtitleCues=[];timedSubtitlesEnabled=false;toggle.disabled=true;toggle.checked=false;clear.disabled=true;$('subtitleTimingStatus').textContent='تعذر قراءة ملف الترجمة: '+(error.message||'صيغة غير صالحة');drawFrame(0)}});toggle?.addEventListener('change',()=>{timedSubtitlesEnabled=!!toggle.checked&&timedSubtitleCues.length>0;drawFrame(playing?Math.max(0,performance.now()-startAt):0);$('status').textContent=timedSubtitlesEnabled?'الترجمة المستوردة مفعّلة.':'تم إيقاف الترجمة المستوردة؛ عاد عرض نص المشاهد.'});clear?.addEventListener('click',()=>{timedSubtitleCues=[];timedSubtitlesEnabled=false;if(toggle){toggle.checked=false;toggle.disabled=true}if(clear)clear.disabled=true;if(input)input.value='';$('subtitleTimingStatus').textContent='أزيلت الترجمة المستوردة. يمكنك استيراد ملف SRT أو VTT آخر.';drawFrame(0)})}
function connectNarrationEditor(){const start=$('narrationTrimStart'),end=$('narrationTrimEnd'),seek=$('narrationSeek'),canvas=$('narrationWaveform');start?.addEventListener('input',()=>{if(!narrationBuffer)return;narrationTrimStart=Math.min(Number(start.value),Math.max(0,effectiveNarrationEnd()-.05));updateNarrationEditor()});end?.addEventListener('input',()=>{if(!narrationBuffer)return;narrationTrimEnd=Math.max(narrationTrimStart+.05,Math.min(Number(end.value),narrationBuffer.duration));updateNarrationEditor()});seek?.addEventListener('input',()=>{if(!narrationBuffer)return;narrationSeekSeconds=Math.max(narrationTrimStart,Math.min(effectiveNarrationEnd(),narrationBuffer.duration*Number(seek.value)/1000));$('narrationSeekTime').textContent=audioClock(narrationSeekSeconds);drawNarrationWaveform()});canvas?.addEventListener('click',event=>{if(!narrationBuffer)return;const rect=canvas.getBoundingClientRect(),ratio=Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width));narrationSeekSeconds=Math.max(narrationTrimStart,Math.min(effectiveNarrationEnd(),ratio*narrationBuffer.duration));const seek=$('narrationSeek');seek.value=String(Math.round(ratio*1000));$('narrationSeekTime').textContent=audioClock(narrationSeekSeconds);drawNarrationWaveform()});$('playNarrationSelectionBtn')?.addEventListener('click',async()=>{if(!narrationBuffer)return;try{const ac=ensureAudio();await ac.resume();startPreviewNarration(Math.max(0,narrationSeekSeconds-narrationTrimStart)*1000,Math.max(.05,effectiveNarrationEnd()-Math.max(narrationTrimStart,narrationSeekSeconds)));$('status').textContent='تشغيل الجزء المحدد من التعليق الصوتي.'}catch(error){$('status').textContent='تعذر تشغيل الجزء المحدد: '+(error.message||'')} });$('resetNarrationTrimBtn')?.addEventListener('click',()=>{if(!narrationBuffer)return;narrationTrimStart=0;narrationTrimEnd=narrationBuffer.duration;narrationSeekSeconds=0;updateNarrationEditor();$('status').textContent='تم إلغاء القص واستخدام التسجيل كاملًا.'});$('musicFadeIn')?.addEventListener('input',()=>{$('musicFadeInVal').textContent=Number($('musicFadeIn').value).toFixed(1)+' ث'});$('musicFadeOut')?.addEventListener('input',()=>{$('musicFadeOutVal').textContent=Number($('musicFadeOut').value).toFixed(1)+' ث'});$('musicFile')?.addEventListener('change',async event=>{const file=event.target.files?.[0];musicBuffer=null;if(!file){$('musicFileStatus').textContent='يمكنك استخدام الموسيقى المولّدة أو اختيار ملف صوتي خاص بك.';return}try{const ac=ensureAudio(),decoded=await ac.decodeAudioData(await file.arrayBuffer());musicBuffer=decoded;$('musicFileStatus').textContent='تم تجهيز '+file.name+' ('+audioClock(decoded.duration)+') وسيُكرّر كخلفية حتى نهاية الفيديو.';if(playing){startMusic()}}catch(error){musicBuffer=null;$('musicFileStatus').textContent='تعذر قراءة ملف الموسيقى. جرّب ملف MP3 أو WAV مدعومًا.';console.warn('Music decode failed',error)}})}
function ensureAudio(){if(!audioContext){const AC=window.AudioContext||window.webkitAudioContext;if(!AC)throw Error('المتصفح لا يدعم Web Audio');audioContext=new AC();musicGain=audioContext.createGain();recordingDestination=audioContext.createMediaStreamDestination();musicGain.gain.value=Number($('volume').value);musicGain.connect(audioContext.destination);musicGain.connect(recordingDestination)}return audioContext}
function stopPreviewNarration(){if(!previewNarrationSource)return;const source=previewNarrationSource;previewNarrationSource=null;try{source.stop()}catch(error){}try{source.disconnect()}catch(error){}}
function startPreviewNarration(offsetMs=0,durationMs=null){stopPreviewNarration();if(!narrationBuffer||!Number.isFinite(narrationBuffer.duration)||narrationBuffer.duration<=0)return;const ac=ensureAudio(),source=ac.createBufferSource(),gain=ac.createGain(),trimStart=Math.min(narrationTrimStart,Math.max(0,narrationBuffer.duration-.05)),trimEnd=effectiveNarrationEnd(),absoluteOffset=Math.max(trimStart,Math.min(trimEnd-.01,trimStart+offsetMs/1000)),available=Math.max(.01,trimEnd-absoluteOffset),duration=Number.isFinite(durationMs)?Math.max(.01,Math.min(available,durationMs/1000)):available;source.buffer=narrationBuffer;gain.gain.value=Number($('narrationVolume')?.value??1);source.connect(gain);gain.connect(ac.destination);source.onended=()=>{if(previewNarrationSource===source){previewNarrationSource=null;try{source.disconnect();gain.disconnect()}catch(error){}}};previewNarrationSource=source;source.start(0,absoluteOffset,duration)}
function stopMusic(){musicOsc.forEach(o=>{try{o.stop()}catch(e){}});musicOsc=[];if(musicBufferSource){try{musicBufferSource.stop()}catch(e){}try{musicBufferSource.disconnect()}catch(e){}musicBufferSource=null}}
function startMusic(){const ac=ensureAudio();stopMusic();const target=Number($('volume').value),fadeIn=Math.max(0,Number($('musicFadeIn')?.value||0));musicGain.gain.cancelScheduledValues(ac.currentTime);musicGain.gain.setValueAtTime(0,ac.currentTime);if($('music').value==='none'&&!musicBuffer)return;musicGain.gain.linearRampToValueAtTime(target,ac.currentTime+fadeIn);if(musicBuffer){musicBufferSource=ac.createBufferSource();musicBufferSource.buffer=musicBuffer;musicBufferSource.loop=true;musicBufferSource.connect(musicGain);musicBufferSource.start(0);return}const notes=$('music').value==='dramatic'?[110,146.83,164.81,123.47]:[130.81,164.81,196,146.83];notes.forEach((hz,i)=>{const osc=ac.createOscillator(),gain=ac.createGain(),filter=ac.createBiquadFilter();osc.type=i===0?'sine':'triangle';osc.frequency.value=hz;filter.type='lowpass';filter.frequency.value=500;gain.gain.value=i===0?.12:.035;osc.connect(filter);filter.connect(gain);gain.connect(musicGain);osc.start();musicOsc.push(osc)})}
async function exportVideo(){
if(recording)return;
if(!('MediaRecorder'in window)||!canvas.captureStream){$('status').textContent='تسجيل الفيديو غير مدعوم في هذا المتصفح. افتح الصفحة في Chrome محدّث.';return}
let ac=null,recorder=null,canvasStream=null,localRaf=0,narrationSource=null;
const chunks=[];
try{
if(playing){playing=false;previewOnlyScene=null;cancelAnimationFrame(raf);$('playBtn').textContent='▶ تشغيل المعاينة'}stopPreviewNarration();
recording=true;$('exportBtn').disabled=true;$('exportBtn').textContent='جارٍ تجهيز الفيديو والصوت…';$('status').textContent='يتم تسجيل الفيديو والصوت. اترك الصفحة مفتوحة حتى يبدأ التنزيل.';
ac=ensureAudio();await ac.resume();
if(ac.state!=='running')throw Error('تعذر تشغيل الصوت. اضغط مرة أخرى للسماح بالصوت في المتصفح.');
if($('narrationFile').files?.[0]&&!narrationBuffer)throw Error('ملف التعليق الصوتي لم يجهز بعد. انتظر اكتمال تحميله ثم أعد التصدير.');
stopMusic();musicGain.gain.setValueAtTime(Number($('volume').value),ac.currentTime);
if(narrationBuffer){
narrationSource=ac.createBufferSource();narrationSource.buffer=narrationBuffer;
const voiceGain=ac.createGain();voiceGain.gain.value=Number($('narrationVolume')?.value??1);
narrationSource.connect(voiceGain);voiceGain.connect(ac.destination);voiceGain.connect(recordingDestination);
}
startMusic();
const profileSettings=exportProfileSettings();
canvasStream=canvas.captureStream(profileSettings.fps);
const audioTrack=recordingDestination.stream.getAudioTracks().find(track=>track.readyState==='live');
if(!audioTrack)throw Error('تعذر تجهيز مسار الصوت للتسجيل.');
const stream=new MediaStream([...canvasStream.getVideoTracks(),audioTrack]);
const mimeCandidates=['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'];
let selectedMime='',startError=null;
for(const candidate of mimeCandidates){
try{
if(MediaRecorder.isTypeSupported&&!MediaRecorder.isTypeSupported(candidate))continue;
const trial=new MediaRecorder(stream,{mimeType:candidate,videoBitsPerSecond:profileSettings.videoBitsPerSecond,audioBitsPerSecond:profileSettings.audioBitsPerSecond});
trial.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data)};
trial.onerror=e=>console.error('MediaRecorder error',e.error||e);
recorder=trial;selectedMime=trial.mimeType||candidate;break;
}catch(error){startError=error;console.warn('تعذر إعداد التصدير بصيغة '+candidate,error)}
}
if(!recorder){
try{
recorder=new MediaRecorder(stream,{videoBitsPerSecond:profileSettings.videoBitsPerSecond,audioBitsPerSecond:profileSettings.audioBitsPerSecond});
recorder.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data)};
recorder.onerror=e=>console.error('MediaRecorder error',e.error||e);
selectedMime=recorder.mimeType||'';
}catch(error){throw Error('المتصفح رفض إعدادات ترميز الفيديو. جرّب فتح التطبيق في Chrome محدّث. '+(error?.message||startError?.message||''))}
}
let rejectRecording;
const doneRecording=new Promise((resolve,reject)=>{
rejectRecording=reject;
recorder.onstop=resolve;
recorder.onerror=e=>reject(e.error||Error('تعذر تسجيل الفيديو'));
});
const duration=Math.max(10000,totalMs()),start=performance.now(),fadeIn=Math.max(0,Number($('musicFadeIn')?.value||0)),fadeOut=Math.max(0,Number($('musicFadeOut')?.value||0)),fadeOutAt=Math.max(ac.currentTime+fadeIn,ac.currentTime+duration/1000-fadeOut);
if(fadeOut>0){musicGain.gain.setValueAtTime(Number($('volume').value),Math.min(fadeOutAt,ac.currentTime+duration/1000-.01));musicGain.gain.linearRampToValueAtTime(0,ac.currentTime+duration/1000)}
try{recorder.start(1000)}catch(error){throw Error('تعذر بدء تسجيل الفيديو: '+(error?.message||''))}
if(narrationSource){const trimStart=Math.min(narrationTrimStart,Math.max(0,narrationBuffer.duration-.05));narrationSource.start(0,trimStart,effectiveNarrationDuration())}
if(importedSceneVideo){try{importedSceneVideo.currentTime=0;await importedSceneVideo.play()}catch(error){console.warn('تعذر تشغيل فيديو الخلفية أثناء التصدير:',error)}}
const paint=now=>{
const elapsed=now-start;
drawFrame(Math.min(elapsed,duration));
if(elapsed<duration)localRaf=requestAnimationFrame(paint);
else{
localRaf=0;
try{if(recorder&&recorder.state!=='inactive')recorder.stop()}catch(error){rejectRecording(error)}
}
};
localRaf=requestAnimationFrame(paint);
await doneRecording;
const mime=recorder.mimeType||chunks.find(chunk=>chunk.type)?.type||selectedMime||'video/webm';
let blob=new Blob(chunks,{type:mime});
if(mime.toLowerCase().includes('webm')&&typeof window.ysFixWebmDuration==='function'){try{blob=await window.ysFixWebmDuration(blob,duration,{logger:false})}catch(metaError){console.warn('تعذر إصلاح بيانات مدة WebM:',metaError)}}
if(!blob.size)throw Error('الملف الناتج فارغ.');
if(duration>=10000&&chunks.length<2)throw Error('التسجيل لم يكتمل: لم يستقبل التطبيق بيانات فيديو كافية. أعد المحاولة واترك الصفحة مفتوحة.');
const isMp4=mime.toLowerCase().includes('mp4'),extension=isMp4?'mp4':'webm';
const url=URL.createObjectURL(blob),link=document.createElement('a');
link.href=url;link.download='zereos-shorts-'+Date.now()+'.'+extension;
document.body.appendChild(link);link.click();link.remove();
setTimeout(()=>URL.revokeObjectURL(url),120000);
drawFrame(0);
$('status').textContent='اكتمل إنشاء الفيديو ('+Math.round(duration/1000)+' ثانية) بصيغة '+extension.toUpperCase()+' · جودة '+({'mobile':'خفيف','standard':'قياسي','high':'مرتفعة'}[$('exportProfile')?.value||'standard'])+'. جرّب تشغيل الملف من المعرض قبل مشاركته.';
}catch(err){
console.error(err);
$('status').textContent='لم يكتمل التصدير: '+(err.message||'خطأ غير معروف');
}finally{
if(localRaf)cancelAnimationFrame(localRaf);
if(recorder&&recorder.state!=='inactive'){try{recorder.stop()}catch(e){}}
if(canvasStream)canvasStream.getTracks().forEach(track=>track.stop());
if(narrationSource){try{narrationSource.stop()}catch(e){}try{narrationSource.disconnect()}catch(e){}}
stopMusic();if(importedSceneVideo)importedSceneVideo.pause();
recording=false;$('exportBtn').disabled=false;$('exportBtn').textContent='● إنشاء وتنزيل الفيديو بالصوت';
}
}
connectNarrationEditor();connectTimedSubtitles();
document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.tab)));document.querySelectorAll('[data-preview-scene]').forEach(b=>b.addEventListener('click',()=>playSingleScene(b.dataset.previewScene)));document.querySelectorAll('[data-timeline-scene]').forEach(b=>b.addEventListener('click',()=>playSingleScene(b.dataset.timelineScene)));
$('playBtn').addEventListener('click',startPreview);$('resetBtn').addEventListener('click',resetPreview);$('exportBtn').addEventListener('click',exportVideo);
$('randomBtn').addEventListener('click',()=>fillPreset(presets[Math.floor(Math.random()*presets.length)]));
['scriptTitle','scriptBody1','scriptBody2','scriptCta','bulkText','bgStyle','fontFamily','fontSize','sceneSeconds','imageMotion','textAnimation','graphicFrame','sceneTransition','exportProfile','glowIntensity','dust','seal','captions','captionStyle','music','volume','narrationVolume'].forEach(id=>{const el=$(id);if(el)el.addEventListener('input',update)});$('exportThumbBtn')?.addEventListener('click',exportThumbnail);
$('splitScriptBtn').addEventListener('click',distributeScript);$('copyScriptBtn').addEventListener('click',copyScript);$('exportSrtBtn').addEventListener('click',exportSubtitles);$('exportWordSrtBtn').addEventListener('click',()=>exportWordSubtitles('srt'));$('exportWordVttBtn').addEventListener('click',()=>exportWordSubtitles('vtt'));
$('narrationFile').addEventListener('change',async e=>{
const file=e.target.files?.[0],token=++narrationLoadToken;
narrationBuffer=null;narrationTrimStart=0;narrationTrimEnd=null;narrationSeekSeconds=0;updateNarrationEditor();importedNarrationMediaId=null;
if(!file){$('fileStatus').textContent='يمكنك اختيار ملف MP3 أو WAV أو ملف صوتي يدعمه المتصفح.';return}
$('fileStatus').textContent='جارٍ تجهيز الملف الصوتي…';
try{
const ac=ensureAudio(),bytes=await file.arrayBuffer(),decoded=await ac.decodeAudioData(bytes);
if(token!==narrationLoadToken)return;
narrationBuffer=decoded;narrationScriptSnapshot=texts().map(line=>String(line||'').trim()).join('\n');narrationTrimStart=0;narrationTrimEnd=decoded.duration;narrationSeekSeconds=0;updateNarrationEditor();
$('fileStatus').textContent='تم تجهيز '+file.name+' ('+Math.ceil(decoded.duration)+' ثانية) وسيُضمّن في الفيديو.';
}catch(error){
if(token!==narrationLoadToken)return;
console.error(error);
$('fileStatus').textContent='تعذر قراءة هذا الملف. جرّب MP3 أو WAV أو ملفًا صوتيًا آخر يدعمه المتصفح.';updateNarrationEditor();
}
});
