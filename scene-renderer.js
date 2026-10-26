
'use strict';
const $=id=>document.getElementById(id);
const presets=[
{title:'سأل شابٌ حكيماً: متى أعرف أنني أسير في الطريق الصحيح؟',body1:'ابتسم الحكيم وقال: عندما تتعب... ولا تفكر في التراجع.',body2:'لأن الذي يصعد الجبل... هو الوحيد الذي يشعر بثقل الطريق.',cta:'اشترك في ZEREOS لتصلك حكمة اليوم'},
{title:'سُئل أحد الفلاسفة: ما هو أثقل شيء على الإنسان؟',body1:'أجاب: الكتمان... عندما تحمل في قلبك حديثاً لا يستوعبه أحد.',body2:'فالكلمات التي لا تخرج، تصبح أوزاناً تسكن الروح.',cta:'شارك الحكمة مع من تحب | ZEREOS'},
{title:'قال حكيمٌ لابنه: لا تحزن إن لم يقدّر أحدٌ طيبتك...',body1:'طبيعة البشر لا تدرك قيمة الماء... إلا بعد أن يجف البئر.',body2:'حافظ على نقاء قلبك، فالذهب لا يفقد قيمته تحت التراب.',cta:'اشترك للمزيد من الحكم | ZEREOS'},
{title:'سألوا حكيماً: كيف تجد السلام؟',body1:'قال: لا تحمل همّ الغد قبل أن يأتي.',body2:'فبعض الأبواب تُفتح بالصبر، لا بكثرة الطرق.',cta:'احفظ الحكمة وشاركها'}
];
const canvas=$('videoCanvas'),ctx=canvas.getContext('2d');
let playing=false,recording=false,raf=0,startAt=0,previewElapsed=0,previewOnlyScene=null,particles=[],audioContext=null,musicOsc=[],musicGain=null,recordingDestination=null,narrationBuffer=null,previewNarrationSource=null,narrationLoadToken=0,lastSpeak=-1,currentScene=0;let microphoneStream=null,voiceRecorder=null,voiceChunks=[],recordedVoiceBlob=null,recordedVoiceBuffer=null,recordedVoiceUrl=null,liveVoiceToken=0;let narrationTrimStart=0,narrationTrimEnd=null,narrationSeekSeconds=0,musicBuffer=null,musicBufferSource=null,timedSubtitleCues=[],timedSubtitlesEnabled=false;
const W=canvas.width,H=canvas.height;
function exportProfileSettings(){const profile=$('exportProfile')?.value||'standard';return profile==='mobile'?{fps:24,videoBitsPerSecond:1600000,audioBitsPerSecond:96000}:profile==='high'?{fps:30,videoBitsPerSecond:5000000,audioBitsPerSecond:160000}:{fps:30,videoBitsPerSecond:2800000,audioBitsPerSecond:128000}}
function texts(){return [$('scriptTitle').value.trim(),$('scriptBody1').value.trim(),$('scriptBody2').value.trim(),$('scriptCta').value.trim()]}
function wordTimings(text,start,end){const words=String(text||'').trim().split(/\s+/u).filter(Boolean);if(!words.length)return [];const weights=words.map(word=>{let weight=Math.max(1,[...word].length);if(/[،,:؛;]$/u.test(word))weight+=2;if(/[.!؟?…]$/u.test(word))weight+=5;return weight});const sum=weights.reduce((a,b)=>a+b,0)||1;let cursor=start;return words.map((word,index)=>{const wordStart=cursor;cursor=index===words.length-1?end:cursor+(end-start)*weights[index]/sum;return {word,start:wordStart,end:cursor}})}
function lineTimingWeight(line){const words=String(line||'').trim().split(/\s+/u).filter(Boolean);return words.reduce((sum,word)=>sum+Math.max(1,[...word].length)+(/[،,:؛;]$/u.test(word)?2:0)+(/[.!؟?…]$/u.test(word)?5:0),0)||1}
let cachedTimelineKey='',cachedTimelineValue=null,cachedTimelineBuffer=null;
function findQuietBoundary(targetMs,totalMs,channelData,sampleRate,offsetMs=0){
  const hopMs=20,windowMs=40,hop=Math.max(1,Math.round(sampleRate*hopMs/1000)),win=Math.max(hop,Math.round(sampleRate*windowMs/1000));
  const center=Math.round((targetMs+offsetMs)/hopMs),radius=Math.max(1,Math.round(Math.min(1200,totalMs*.12)/hopMs));
  const targetIndex=Math.max(0,Math.min(Math.ceil(channelData.length/hop)-1,center));
  let best=null;
  for(let k=Math.max(1,targetIndex-radius);k<=Math.min(Math.ceil(channelData.length/hop)-1,targetIndex+radius);k++){
    const from=k*hop,to=Math.min(channelData.length,from+win);if(to<=from)continue;
    let sum=0,count=0;for(let i=from;i<to;i+=4){const v=channelData[i];sum+=v*v;count++}
    const rms=Math.sqrt(sum/Math.max(1,count)),time=k*hopMs-offsetMs;
    const distance=Math.abs(time-targetMs),score=rms*1.8+distance/Math.max(1,radius*hopMs)*.035;
    if(!best||score<best.score)best={time,score,rms,distance};
  }
  if(!best)return targetMs;
  return best.rms<.045?best.time:targetMs;
}
function effectiveNarrationEnd(){return narrationBuffer?Math.max(narrationTrimStart+0.05,Math.min(narrationBuffer.duration,narrationTrimEnd==null?narrationBuffer.duration:narrationTrimEnd)):0}
function effectiveNarrationDuration(){return narrationBuffer?Math.max(0.05,effectiveNarrationEnd()-Math.min(narrationTrimStart,Math.max(0,narrationBuffer.duration-0.05))):0}
function sceneTimeline(){
  const lines=texts(),fixed=Number($('sceneSeconds').value)*1000;
  if(!narrationBuffer||!Number.isFinite(narrationBuffer.duration)||narrationBuffer.duration<=0)return lines.map((_,i)=>({start:i*fixed,end:(i+1)*fixed}));
  const trimStart=Math.min(narrationTrimStart,Math.max(0,narrationBuffer.duration-0.05)),total=effectiveNarrationDuration()*1000,key=[lines.join('¦'),Math.round(total),narrationBuffer.sampleRate,narrationBuffer.length,Math.round(trimStart)].join('|');
  if(narrationBuffer===cachedTimelineBuffer&&key===cachedTimelineKey&&cachedTimelineValue)return cachedTimelineValue;
  const weights=lines.map(line=>Math.max(1,lineTimingWeight(line))),sum=weights.reduce((a,b)=>a+b,0)||1;
  const boundaries=[0];let cursor=0;
  for(let i=0;i<weights.length-1;i++){
    cursor+=total*weights[i]/sum;
    const channel=narrationBuffer.getChannelData(0);
    const snapped=findQuietBoundary(cursor,total,channel,narrationBuffer.sampleRate,trimStart*1000);
    const min=boundaries[boundaries.length-1]+Math.min(350,total/Math.max(2,weights.length*2));
    const max=total-Math.min(350,total/Math.max(2,weights.length*2))*(weights.length-i-1);
    boundaries.push(Math.max(min,Math.min(max,snapped)));
  }
  boundaries.push(total);
  cachedTimelineValue=weights.map((_,i)=>({start:boundaries[i],end:boundaries[i+1]}));cachedTimelineKey=key;cachedTimelineBuffer=narrationBuffer;
  return cachedTimelineValue;
}
function updateTimelineUI(active=currentScene){const strip=$('sceneTimelineStrip');if(!strip)return;const timeline=sceneTimeline();strip.querySelectorAll('[data-timeline-scene]').forEach(button=>{const index=Number(button.dataset.timelineScene),item=timeline[index];if(!item)return;button.classList.toggle('active',index===active);button.setAttribute('aria-pressed',String(index===active));button.style.flexGrow=String(Math.max(1,item.end-item.start));button.textContent='مشهد '+(index+1)+' · '+Math.max(1,Math.round((item.end-item.start)/1000))+'ث';button.title='من '+formatTime(item.start/1000)+' إلى '+formatTime(item.end/1000)})}
function totalMs(){const base=narrationBuffer?Math.max(1000,effectiveNarrationDuration()*1000):Number($('sceneSeconds').value)*4*1000;return timedSubtitlesEnabled&&timedSubtitleCues.length?Math.max(base,Math.max(...timedSubtitleCues.map(c=>c.end))-Math.min(narrationTrimStart*1000,Math.max(0,(narrationBuffer?.duration||0)*1000))):base}
function currentStyle(){return $('bgStyle').value}
function initParticles(){particles=Array.from({length:75},()=>({x:Math.random()*W,y:Math.random()*H,r:1+Math.random()*3,v:.2+Math.random()*.7,a:.15+Math.random()*.55,phase:Math.random()*6.28}))}
function wrapText(text,maxWidth,font){ctx.font=font;const words=(text||'').split(/\s+/);let lines=[],line='';for(const word of words){const test=line?line+' '+word:word;if(ctx.measureText(test).width>maxWidth&&line){lines.push(line);line=word}else line=test}if(line)lines.push(line);return lines}
function roundedRect(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r)}
function drawBackground(t){
if(isImageTemplate(activeTemplate)){drawZereosTemplateBackground(activeTemplate);return}
const style=currentStyle();let g;const theme=videoTemplates[activeTemplate]||videoTemplates.royal;
if(activeTemplate!=='royal'){
g=ctx.createLinearGradient(0,0,W,H);g.addColorStop(0,theme.a);g.addColorStop(.52,theme.b);g.addColorStop(1,theme.c);ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
const pulse=.5+.5*Math.sin(t*.0012);const glow=ctx.createRadialGradient(W*(.35+.3*pulse),H*(.24+.06*Math.sin(t*.0007)),4,W*.5,H*.38,H*.72);glow.addColorStop(0,theme.glow+'55');glow.addColorStop(1,'#00000000');ctx.fillStyle=glow;ctx.fillRect(0,0,W,H);
ctx.save();ctx.globalAlpha=activeTemplate==='minimal'?.35:.62;ctx.strokeStyle=theme.line;ctx.lineWidth=activeTemplate==='cyber'?3:1.5;
if(activeTemplate==='cyber'){for(let i=0;i<9;i++){ctx.beginPath();ctx.moveTo(i*100,0);ctx.lineTo(i*100,H);ctx.stroke()}for(let y=160;y<H;y+=180){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke()}}
else if(activeTemplate==='ivory'){for(let i=0;i<7;i++){ctx.beginPath();ctx.ellipse(W/2,H*.5,100+i*55,150+i*65,0,0,Math.PI*2);ctx.stroke()}}
else if(activeTemplate==='crystal'){for(let i=0;i<7;i++){ctx.beginPath();ctx.moveTo(W/2,130+i*8);ctx.lineTo(W-60-i*16,H*.42);ctx.lineTo(W/2,H-150-i*8);ctx.lineTo(60+i*16,H*.42);ctx.closePath();ctx.stroke()}}
else if(activeTemplate==='nebula'||activeTemplate==='aurora'){for(let i=0;i<5;i++){ctx.beginPath();ctx.ellipse(W/2,H*.35,90+i*70,35+i*28,Math.sin(t*.00025+i)*.12,0,Math.PI*2);ctx.stroke()}}
else if(activeTemplate==='minimal'){ctx.beginPath();ctx.moveTo(95,H*.3);ctx.lineTo(W-95,H*.3);ctx.moveTo(95,H*.72);ctx.lineTo(W-95,H*.72);ctx.stroke()}
else{for(let i=0;i<6;i++){ctx.beginPath();ctx.arc(W/2,H*.32,70+i*56+Math.sin(t*.0007+i)*4,0,Math.PI*2);ctx.stroke()}}
ctx.restore();
ctx.strokeStyle=theme.line;ctx.globalAlpha=.8;ctx.lineWidth=2;roundedRect(30,30,W-60,H-60,activeTemplate==='minimal'?2:18);ctx.stroke();ctx.globalAlpha=.4;ctx.lineWidth=1;roundedRect(44,44,W-88,H-88,12);ctx.stroke();return;
}
if(style==='parchment'){g=ctx.createLinearGradient(0,0,W,H);g.addColorStop(0,'#332515');g.addColorStop(.48,'#17110b');g.addColorStop(1,'#080706');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);ctx.fillStyle='#c8953a0c';for(let i=0;i<90;i++){const x=(i*83)%W,y=(i*137)%H;ctx.fillRect(x,y,2,2)}}
else if(style==='darkgold'){g=ctx.createRadialGradient(W*.5,H*.4,10,W*.5,H*.4,H*.8);g.addColorStop(0,'#49300f');g.addColorStop(.45,'#1c140b');g.addColorStop(1,'#050506');ctx.fillStyle=g;ctx.fillRect(0,0,W,H)}
else{g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,'#10252a');g.addColorStop(.5,'#17121c');g.addColorStop(1,'#070709');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);ctx.save();ctx.strokeStyle='#e8bb5140';ctx.lineWidth=3;for(let i=0;i<5;i++){ctx.beginPath();ctx.moveTo(70+i*145,0);ctx.lineTo(70+i*145,H);ctx.stroke()}ctx.strokeStyle='#e8bb5128';ctx.lineWidth=2;ctx.beginPath();ctx.arc(W/2,H*.35,190,Math.PI,0);ctx.stroke();ctx.restore()}
const glow=ctx.createRadialGradient(W*.5,H*.42,5,W*.5,H*.42,420);glow.addColorStop(0,style==='mystic'?'#61b8a51c':'#e4a33b20');glow.addColorStop(1,'#00000000');ctx.fillStyle=glow;ctx.fillRect(0,0,W,H);
ctx.strokeStyle=style==='parchment'?'#d4ad6a88':'#d6a64d99';ctx.lineWidth=2;roundedRect(30,30,W-60,H-60,15);ctx.stroke();ctx.strokeStyle='#e3bd6d45';ctx.lineWidth=1;roundedRect(42,42,W-84,H-84,11);ctx.stroke();
}
function drawOrnament(t){if(isImageTemplate(activeTemplate))return;ctx.save();ctx.translate(W/2,220);ctx.rotate(Math.sin(t*.0004)*.04);ctx.strokeStyle=(videoTemplates[activeTemplate]||videoTemplates.royal).line;ctx.lineWidth=2;ctx.globalAlpha=.75;ctx.beginPath();ctx.moveTo(-70,0);ctx.lineTo(-22,0);ctx.moveTo(22,0);ctx.lineTo(70,0);ctx.moveTo(0,-27);ctx.lineTo(0,-9);ctx.moveTo(0,9);ctx.lineTo(0,27);ctx.stroke();ctx.beginPath();ctx.moveTo(0,-20);ctx.lineTo(20,0);ctx.lineTo(0,20);ctx.lineTo(-20,0);ctx.closePath();ctx.stroke();ctx.restore()}
function drawParticles(t){if(isImageTemplate(activeTemplate)||!$('dust').checked)return;ctx.save();for(const p of particles){const y=(p.y-t*p.v*.035+H)%H,x=p.x+Math.sin(t*.0006+p.phase)*15;ctx.globalAlpha=p.a*(.6+.4*Math.sin(t*.002+p.phase));ctx.fillStyle='#f2c66d';ctx.beginPath();ctx.arc(x,y,p.r,0,Math.PI*2);ctx.fill()}ctx.restore()}
function drawSeal(){if(isImageTemplate(activeTemplate))return;if(!$('seal')?.checked)return;ctx.save();const x=W-92,y=H-104;ctx.globalAlpha=.78;ctx.strokeStyle=(videoTemplates[activeTemplate]||videoTemplates.royal).line;ctx.fillStyle='rgba(9,14,24,.66)';ctx.lineWidth=3;ctx.beginPath();ctx.arc(x,y,49,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(x,y,41,0,Math.PI*2);ctx.stroke();ctx.fillStyle=(videoTemplates[activeTemplate]||videoTemplates.royal).text;ctx.textAlign='center';ctx.textBaseline='middle';ctx.direction='ltr';ctx.font='bold 13px Tajawal';ctx.fillText('ZEREOS',x,y-5);ctx.font='bold 9px Tajawal';ctx.fillText('AI  •  ORIGINAL',x,y+13);ctx.globalAlpha=.42;ctx.beginPath();ctx.moveTo(x-20,y-25);ctx.lineTo(x+20,y-25);ctx.stroke();ctx.restore()}
function paginateTemplateText(text,maxWidth,startSize,fontName,maxLines,minSize=20){
 let fitted=startSize,font='800 '+fitted+'px "'+fontName+'"',lines=wrapText(String(text||''),maxWidth,font);
 while(lines.some(line=>{ctx.font=font;return ctx.measureText(line).width>maxWidth})&&fitted>minSize){fitted=Math.max(minSize,fitted-2);font='800 '+fitted+'px "'+fontName+'"';lines=wrapText(String(text||''),maxWidth,font)}
 const pages=[];for(let i=0;i<lines.length;i+=maxLines)pages.push({lines:lines.slice(i,i+maxLines),size:fitted,font,lineH:fitted*1.42});
 return pages.length?pages:[{lines:[''],size:fitted,font,lineH:fitted*1.42}];
}
function selectTemplateCaptionPage(pages,progress,anim){
 const index=Math.min(pages.length-1,Math.floor(progress*pages.length));
 const pageProgress=Math.max(0,Math.min(1,progress*pages.length-index));
 const page=pages[index]||pages[0];
 let lines=page.lines.slice();
 if(anim==='wordByWord'&&pageProgress<1){
  let remaining=Math.max(1,Math.ceil(lines.reduce((sum,line)=>sum+line.split(/\s+/).filter(Boolean).length,0)*Math.max(.04,pageProgress)));
  lines=lines.map(line=>{const words=line.split(/\s+/).filter(Boolean),visible=words.slice(0,remaining).join(' ');remaining=Math.max(0,remaining-words.length);return visible}).filter(Boolean);
 }else if(anim==='typewriter'&&pageProgress<1){
  const charsByLine=lines.map(line=>Array.from(line));
  let remaining=Math.max(1,Math.ceil(charsByLine.reduce((sum,chars)=>sum+chars.length,0)*Math.max(.03,pageProgress)));
  lines=charsByLine.map(chars=>{const visible=chars.slice(0,remaining).join('');remaining=Math.max(0,remaining-chars.length);return visible}).filter(Boolean);
 }
 return {...page,lines:lines.length?lines:['']};
}
function drawTemplateCaption(text,scene,t,sceneElapsed,sceneDuration,fontName,size,anim,progress,glowIntensity){
 const theme=videoTemplates[activeTemplate]||videoTemplates.royal;
 const local=Math.max(0,Math.min(sceneDuration,sceneElapsed));
 const fade=Math.min(1,local/240,(sceneDuration-local)/220),alpha=Math.max(.12,Math.min(1,fade));
 const pulse=anim==='glowPulse'?1+Math.sin(progress*Math.PI)*.035:1;
 ctx.save();ctx.globalAlpha=alpha;ctx.direction='rtl';ctx.textAlign='center';ctx.textBaseline='middle';
 if(activeTemplate==='zereosIvory'||activeTemplate==='zereosNoir'){
   const ivory=activeTemplate==='zereosIvory',maxW=W*.72;
   const pages=paginateTemplateText(text,maxW,Math.min(size,47),fontName,5,21),fit=selectTemplateCaptionPage(pages,progress,anim),lineH=fit.lineH;
   const cx=W/2,cy=H*.535,boxW=W*.78,boxH=Math.max(210,fit.lines.length*lineH+102),x=cx-boxW/2,y=cy-boxH/2;
   ctx.save();ctx.shadowColor=ivory?'#9a753f55':'#f0a52b55';ctx.shadowBlur=18;
   ctx.fillStyle=ivory?'rgba(255,249,235,.90)':'rgba(7,6,5,.82)';roundedRect(x,y,boxW,boxH,18);ctx.fill();ctx.shadowBlur=0;
   ctx.strokeStyle=ivory?'#a67b3d':'#dcae4e';ctx.lineWidth=3;roundedRect(x+5,y+5,boxW-10,boxH-10,14);ctx.stroke();
   ctx.strokeStyle=ivory?'#d8c095':'#78501d';ctx.lineWidth=1;roundedRect(x+15,y+15,boxW-30,boxH-30,10);ctx.stroke();
   ctx.fillStyle=ivory?'#8e642e':'#f4c76a';ctx.font='bold 22px "Aref Ruqaa",serif';ctx.fillText('✦  حكمة زيريوس  ✦',cx,y+38);
   ctx.strokeStyle=ivory?'#b9955d':'#9a6a24';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(x+42,y+55);ctx.lineTo(x+boxW-42,y+55);ctx.stroke();
   ctx.font=fit.font;ctx.fillStyle=ivory?'#21180f':'#fff0c5';ctx.shadowColor=ivory?'#fff':'#f9b847';ctx.shadowBlur=ivory?0:glowIntensity*.45;
   const startY=cy-(fit.lines.length-1)*lineH/2+13;fit.lines.forEach((line,i)=>ctx.fillText(line,cx,startY+i*lineH,maxW));
   ctx.shadowBlur=0;ctx.restore();ctx.restore();return;
 }
 if(isImageTemplate(activeTemplate)){
   const light=activeTemplate==='ivory'||activeTemplate==='zereosIvory';
   const maxW=W*.70;
   const pages=paginateTemplateText(text,maxW,Math.min(size,42),fontName,5,19);
   const fit=selectTemplateCaptionPage(pages,progress,anim),lineH=Math.min(55,fit.lineH);
   const cx=W/2,cy=H*.50;
   if(activeTemplate==='ivory'||activeTemplate==='zereosIvory'||activeTemplate==='zereosNoir'){
     const boxW=W*.78,boxH=Math.min(H*.34,Math.max(220,fit.lines.length*lineH+104)),x=cx-boxW/2,y=cy-boxH/2;
     const pale=activeTemplate!=='zereosNoir';
     ctx.save();ctx.shadowColor=light?'#9a753f55':'#f0a52b55';ctx.shadowBlur=14;
     ctx.fillStyle=light?'rgba(255,249,235,.93)':'rgba(7,6,5,.86)';roundedRect(x,y,boxW,boxH,18);ctx.fill();ctx.shadowBlur=0;
     ctx.strokeStyle=light?'#a67b3d':'#dcae4e';ctx.lineWidth=3;roundedRect(x+5,y+5,boxW-10,boxH-10,14);ctx.stroke();
     ctx.strokeStyle=light?'#d8c095':'#78501d';ctx.lineWidth=1;roundedRect(x+15,y+15,boxW-30,boxH-30,10);ctx.stroke();ctx.restore();
   }
   ctx.fillStyle=light?'#8e642e':(activeTemplate==='zereosNoir'?'#f4c76a':theme.accent);
   ctx.font='bold 19px "Aref Ruqaa",serif';ctx.fillText('✦  حكمة زيريوس  ✦',cx,cy-(Math.min(H*.34,Math.max(220,fit.lines.length*lineH+104))*.5)+34);
   ctx.strokeStyle=theme.line;ctx.globalAlpha=.8;ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(W*.25,cy-(Math.min(H*.34,Math.max(220,fit.lines.length*lineH+104))*.5)+51);ctx.lineTo(W*.75,cy-(Math.min(H*.34,Math.max(220,fit.lines.length*lineH+104))*.5)+51);ctx.stroke();ctx.globalAlpha=alpha;
   ctx.font=fit.font;ctx.fillStyle=light?'#21180f':(activeTemplate==='zereosNoir'?'#fff0c5':theme.text);ctx.shadowColor=light?'#fff':theme.glow;ctx.shadowBlur=light?0:glowIntensity*.32;
   const startY=cy-(fit.lines.length-1)*lineH/2+16;fit.lines.forEach((line,i)=>ctx.fillText(line,cx,startY+i*lineH,maxW));
   ctx.shadowBlur=0;ctx.restore();return;
 }
 if(activeTemplate==='royal'){
   const maxW=W*.67,pages=paginateTemplateText(text,maxW,Math.min(size,55),fontName,2,20),fit=selectTemplateCaptionPage(pages,progress,anim),lineH=fit.lineH;
   const cx=W/2,cy=H*.53,rx=Math.min(W*.43,290),ry=Math.min(H*.19,245),boxH=Math.max(190,fit.lines.length*lineH+76);
   ctx.translate(cx,cy);ctx.scale(pulse,pulse);ctx.translate(-cx,-cy);
   ctx.shadowColor='#e7ad42';ctx.shadowBlur=glowIntensity+12;ctx.fillStyle='rgba(43,27,8,.88)';ctx.beginPath();ctx.ellipse(cx,cy,rx,ry,0,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
   ctx.strokeStyle='#f8d98a';ctx.lineWidth=5;ctx.beginPath();ctx.ellipse(cx,cy,rx-4,ry-4,0,0,Math.PI*2);ctx.stroke();
   ctx.strokeStyle='#b77a20';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(cx,cy,rx-17,ry-17,0,0,Math.PI*2);ctx.stroke();
   ctx.fillStyle='#f8d98a';ctx.font='bold 19px "Aref Ruqaa",serif';ctx.fillText('✦',cx,cy-ry+31);
   ctx.font=fit.font;ctx.fillStyle='#fff0c9';ctx.shadowColor='#f3c65d';ctx.shadowBlur=glowIntensity*.8;
   const startY=cy-(fit.lines.length-1)*lineH/2+4;fit.lines.forEach((line,i)=>ctx.fillText(line,cx,startY+i*lineH,maxW));
   ctx.shadowBlur=0;ctx.restore();return;
 }
 if(activeTemplate==='nebula'){
   const maxW=W*.54,pages=paginateTemplateText(text,maxW,Math.min(size,47),fontName,3,18),fit=selectTemplateCaptionPage(pages,progress,anim),lineH=fit.lineH;
   const cx=W/2,cy=H*.49,rx=W*.32,ry=Math.min(H*.18,220),planetR=Math.min(W*.30,190);
   ctx.translate(cx,cy);ctx.scale(pulse,pulse);ctx.translate(-cx,-cy);
   const grad=ctx.createRadialGradient(cx-planetR*.3,cy-planetR*.35,5,cx,cy,planetR*1.15);grad.addColorStop(0,'#b9a6ff');grad.addColorStop(.45,'#5b3e9c');grad.addColorStop(1,'#17152f');
   ctx.fillStyle=grad;ctx.globalAlpha=.87;ctx.beginPath();ctx.ellipse(cx,cy,rx,ry,0,0,Math.PI*2);ctx.fill();
   ctx.globalAlpha=.85;ctx.strokeStyle='#d4c6ff';ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(cx,cy,rx+10,ry+8,-.16,0,Math.PI*2);ctx.stroke();
   ctx.globalAlpha=1;ctx.font=fit.font;ctx.fillStyle='#fffaff';ctx.shadowColor='#c4a7ff';ctx.shadowBlur=glowIntensity+9;
   const startY=cy-(fit.lines.length-1)*lineH/2;fit.lines.forEach((line,i)=>ctx.fillText(line,cx,startY+i*lineH,maxW));
   ctx.shadowBlur=0;ctx.restore();return;
 }
 if(activeTemplate==='cyber'){
   text=texts().filter(Boolean).join('  •  ');
   const maxW=W-112;let fitted=Math.min(size,42),font='800 '+fitted+'px "'+fontName+'"',lines=wrapText(String(text||''),maxW,font),lineH=fitted*1.28;
   while((lines.length*lineH>H*.62||lines.some(line=>{ctx.font=font;return ctx.measureText(line).width>maxW}))&&fitted>13){fitted-=1;font='800 '+fitted+'px "'+fontName+'"';lines=wrapText(String(text||''),maxW,font);lineH=fitted*1.28}
   const boxW=W-62,boxH=Math.min(H*.78,Math.max(210,lines.length*lineH+110)),x=31,y=(H-boxH)/2;
   ctx.translate(W/2,H/2);ctx.scale(pulse,pulse);ctx.translate(-W/2,-H/2);
   ctx.fillStyle='rgba(2,12,22,.82)';roundedRect(x,y,boxW,boxH,8);ctx.fill();
   ctx.strokeStyle='#46e4ef';ctx.lineWidth=3;ctx.shadowColor='#20c7e4';ctx.shadowBlur=glowIntensity+14;ctx.strokeRect(x+7,y+7,boxW-14,boxH-14);ctx.shadowBlur=0;
   ctx.textAlign='left';ctx.direction='ltr';ctx.font='bold 14px monospace';ctx.fillStyle='#43e5ef';ctx.fillText('ZEREOS // SMART DISPLAY  •  '+String(scene+1).padStart(2,'0'),x+22,y+31);
   ctx.textAlign='center';ctx.direction='rtl';ctx.font=font;ctx.fillStyle='#dffcff';ctx.shadowColor='#36eaf5';ctx.shadowBlur=glowIntensity+12;
   const startY=H/2-(lines.length-1)*lineH/2+12;lines.forEach((line,i)=>ctx.fillText(line,W/2,startY+i*lineH,maxW));
   ctx.shadowBlur=0;ctx.strokeStyle='#46e4ef';ctx.globalAlpha=.8;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x+22,y+boxH-28);ctx.lineTo(x+90,y+boxH-28);ctx.lineTo(x+105,y+boxH-36);ctx.lineTo(x+170,y+boxH-36);ctx.stroke();ctx.restore();return;
 }
 if(activeTemplate==='ocean'){
   const maxW=W*.64,pages=paginateTemplateText(text,maxW,Math.min(size,46),fontName,2,19),fit=selectTemplateCaptionPage(pages,progress,anim),lineH=fit.lineH;
   const cx=W/2,cy=H*.53,rx=W*.34,ry=Math.max(100,fit.lines.length*lineH*.9+44);
   ctx.translate(cx,cy);ctx.scale(pulse,pulse);ctx.translate(-cx,-cy);
   fit.lines.forEach((line,i)=>{const by=cy+(i-(fit.lines.length-1)/2)*lineH;ctx.font=fit.font;const bw=Math.min(W*.68,Math.max(W*.28,ctx.measureText(line).width+66)),bh=Math.max(75,fit.size*1.8);
    ctx.globalAlpha=.72;ctx.fillStyle='rgba(16,92,120,.58)';ctx.strokeStyle='#78e8f4';ctx.lineWidth=2;ctx.shadowColor='#2eafce';ctx.shadowBlur=glowIntensity+8;
    ctx.beginPath();ctx.ellipse(cx,by,bw/2,bh/2,Math.sin(t*.001+i)*.025,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.shadowBlur=0;
    ctx.globalAlpha=1;ctx.font=fit.font;ctx.fillStyle='#eaffff';ctx.shadowColor='#71d7ec';ctx.shadowBlur=glowIntensity*.8;ctx.fillText(line,cx,by,maxW);
   });
   ctx.shadowBlur=0;ctx.restore();return;
 }
 if(activeTemplate==='ivory'){
   const maxW=W*.68,pages=paginateTemplateText(text,maxW,Math.min(size,45),fontName,3,18),fit=selectTemplateCaptionPage(pages,progress,anim),lineH=fit.lineH;
   const cx=W/2,cy=H*.52,boxW=W*.82,boxH=Math.max(240,fit.lines.length*lineH+100),x=(W-boxW)/2,y=cy-boxH/2;
   ctx.translate(cx,cy);ctx.scale(pulse,pulse);ctx.translate(-cx,-cy);
   const paper=ctx.createLinearGradient(x,y,x+boxW,y+boxH);paper.addColorStop(0,'#4b3522');paper.addColorStop(.45,'#2c2119');paper.addColorStop(1,'#17120f');
   ctx.fillStyle=paper;ctx.fillRect(x,y,boxW,boxH);ctx.strokeStyle='#d8b77b';ctx.lineWidth=4;ctx.strokeRect(x+7,y+7,boxW-14,boxH-14);ctx.strokeStyle='#a9824d';ctx.lineWidth=1.5;ctx.strokeRect(x+17,y+17,boxW-34,boxH-34);
   ctx.fillStyle='#d8b77b';ctx.font='bold 20px "Aref Ruqaa",serif';ctx.fillText('❧',cx,y+35);
   ctx.font='bold '+fit.size+'px "Aref Ruqaa", serif';ctx.fillStyle='#f4dfb7';ctx.shadowColor='#c49a5a';ctx.shadowBlur=glowIntensity*.35;
   const startY=cy-(fit.lines.length-1)*lineH/2+7;fit.lines.forEach((line,i)=>ctx.fillText(line,cx,startY+i*lineH,maxW));
   ctx.shadowBlur=0;ctx.restore();return;
 }
 ctx.restore();return false;
}
function drawTextBlock(text,scene,t,sceneElapsed=0,sceneDuration=Number($('sceneSeconds').value)*1000){
 if(!$('captions').checked)return;
 const fontName=$('fontFamily').value,size=Number($('fontSize').value),maxW=W-130;
 const anim=$('textAnimation')?.value||'fadeUp',frame=$('graphicFrame')?.value||'ornate';
 const progress=Math.max(0,Math.min(1,sceneElapsed/Math.max(1,sceneDuration)));
 const glowIntensity=Number($('glowIntensity')?.value??18);
 if(['royal','nebula','cyber','ocean','ivory','zereosIvory','zereosNoir'].includes(activeTemplate)){
  drawTemplateCaption(text,scene,t,sceneElapsed,sceneDuration,fontName,size,anim,progress,glowIntensity);return;
 }
 if(anim==='wordByWord'&&String(text||'').trim()){
  const words=String(text).trim().split(/\s+/),visibleCount=Math.max(1,Math.ceil(words.length*Math.max(.04,progress)));
  text=words.slice(0,visibleCount).join(' ');
 }else if(anim==='typewriter'&&String(text||'').trim()){
  const chars=Array.from(String(text));text=chars.slice(0,Math.max(1,Math.ceil(chars.length*Math.max(.03,progress)))).join('');
 }
 if($('captionStyle')?.value==='karaoke'&&String(text||'').trim()){
  const words=String(text).trim().split(/\s+/).filter(Boolean),safeDuration=Math.max(1,sceneDuration),timedWords=wordTimings(text,0,safeDuration),foundIndex=timedWords.findIndex(item=>sceneElapsed>=item.start&&sceneElapsed<item.end),activeIndex=foundIndex<0?words.length-1:foundIndex,windowSize=Math.min(4,words.length),startIndex=Math.max(0,Math.min(words.length-windowSize,activeIndex-1)),visible=words.slice(startIndex,startIndex+windowSize);
  let karaokeSize=Math.min(size,48),karaokeFont='800 '+karaokeSize+'px "'+fontName+'"',gap=karaokeSize*.25,widths=[];
  const measure=()=>{ctx.font=karaokeFont;widths=visible.map(word=>ctx.measureText(word).width);return widths.reduce((a,b)=>a+b,0)+gap*Math.max(0,visible.length-1)};
  let rowWidth=measure();while(rowWidth>maxW&&karaokeSize>25){karaokeSize-=2;karaokeFont='800 '+karaokeSize+'px "'+fontName+'"';gap=karaokeSize*.22;rowWidth=measure()}
  const centerY=H*.62,padX=22,padY=18,boxW=Math.min(W-72,rowWidth+padX*2),boxH=karaokeSize*1.7+padY*2;
  ctx.save();ctx.direction='rtl';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=karaokeFont;
  ctx.fillStyle='#050403d9';roundedRect((W-boxW)/2,centerY-boxH/2,boxW,boxH,20);ctx.fill();ctx.strokeStyle=(videoTemplates[activeTemplate]||videoTemplates.royal).line+'cc';ctx.lineWidth=2;roundedRect((W-boxW)/2,centerY-boxH/2,boxW,boxH,20);ctx.stroke();
  let right=W/2+rowWidth/2;visible.forEach((word,i)=>{const wordWidth=widths[i],cx=right-wordWidth/2,originalIndex=startIndex+i;if(originalIndex===activeIndex){ctx.fillStyle=(videoTemplates[activeTemplate]||videoTemplates.royal).accent;roundedRect(cx-wordWidth/2-10,centerY-karaokeSize*.72,wordWidth+20,karaokeSize*1.44,10);ctx.fill();ctx.fillStyle='#101522'}else ctx.fillStyle=(videoTemplates[activeTemplate]||videoTemplates.royal).text;ctx.shadowColor=originalIndex===activeIndex?(videoTemplates[activeTemplate]||videoTemplates.royal).accent:'transparent';ctx.shadowBlur=originalIndex===activeIndex?10:0;ctx.fillText(word,cx,centerY,maxW);ctx.shadowBlur=0;right-=wordWidth+gap});ctx.restore();return;
 }
 let fittedSize=size,font='700 '+size+'px "'+fontName+'"',lines=wrapText(text,maxW,font),lineH=fittedSize*1.55;
 while(lines.length*lineH>H*.52&&fittedSize>26){fittedSize-=2;font='700 '+fittedSize+'px "'+fontName+'"';lines=wrapText(text,maxW,font);lineH=fittedSize*1.55}
 const blockH=lines.length*lineH,centerY=H*.52,local=Math.max(0,Math.min(sceneDuration,sceneElapsed));
 const fade=Math.min(1,local/300,(sceneDuration-local)/260),alpha=Math.max(.08,Math.min(1,fade));
 const riseOffset=anim==='fadeUp'?(1-alpha)*42:0,slideOffset=anim==='kineticSlide'?(1-progress)*W*.22:0;
 const pulse=anim==='glowPulse'?1+Math.sin(progress*Math.PI)*.055:1,offset=riseOffset;
 ctx.save();ctx.globalAlpha=alpha;ctx.translate(W/2,centerY);ctx.scale(pulse,anim==='kineticSlide'?1:pulse);ctx.translate(-W/2+slideOffset,-centerY+offset);
 ctx.textAlign='center';ctx.textBaseline='middle';ctx.direction='rtl';ctx.font=font;
 const boxY=centerY-blockH/2-34+offset,boxH=blockH+68,theme=videoTemplates[activeTemplate]||videoTemplates.royal;
 const boxX=64,boxW=W-128,round=frame==='minimal'?3:frame==='cyberBox'?5:frame==='ornate'?24:20;
 if(frame==='goldGlass'){ctx.fillStyle='rgba(18,15,20,.48)';ctx.shadowColor=theme.glow;ctx.shadowBlur=glowIntensity;roundedRect(boxX,boxY,boxW,boxH,round);ctx.fill();ctx.shadowBlur=0;ctx.strokeStyle=theme.line+'dd';ctx.lineWidth=3;roundedRect(boxX,boxY,boxW,boxH,round);ctx.stroke();ctx.strokeStyle=theme.line+'55';ctx.lineWidth=1;roundedRect(boxX+10,boxY+10,boxW-20,boxH-20,Math.max(2,round-6));ctx.stroke()}
 else if(frame==='cyberBox'){ctx.fillStyle='rgba(3,12,22,.72)';roundedRect(boxX,boxY,boxW,boxH,round);ctx.fill();ctx.strokeStyle=theme.line;ctx.lineWidth=2;ctx.shadowColor=theme.glow;ctx.shadowBlur=glowIntensity;ctx.strokeRect(boxX+8,boxY+8,boxW-16,boxH-16);ctx.shadowBlur=0;ctx.beginPath();ctx.moveTo(boxX,boxY+28);ctx.lineTo(boxX+34,boxY+28);ctx.moveTo(boxX+boxW-34,boxY+boxH-28);ctx.lineTo(boxX+boxW,boxY+boxH-28);ctx.stroke()}
 else if(frame==='ornate'){ctx.fillStyle='rgba(5,4,3,.68)';roundedRect(boxX,boxY,boxW,boxH,round);ctx.fill();ctx.strokeStyle=theme.line+'cc';ctx.lineWidth=2;roundedRect(boxX,boxY,boxW,boxH,round);ctx.stroke();ctx.strokeStyle=theme.line+'88';ctx.lineWidth=1;ctx.strokeRect(boxX+15,boxY+15,boxW-30,boxH-30);ctx.beginPath();ctx.moveTo(W/2-30,boxY+12);ctx.lineTo(W/2,boxY+24);ctx.lineTo(W/2+30,boxY+12);ctx.stroke()}
 else {ctx.fillStyle='rgba(5,8,14,.55)';roundedRect(boxX,boxY,boxW,boxH,round);ctx.fill();if(frame!=='minimal'){ctx.strokeStyle=theme.line+'99';ctx.lineWidth=1.5;roundedRect(boxX,boxY,boxW,boxH,round);ctx.stroke()}}
 lines.forEach((line,i)=>{const y=centerY-blockH/2+lineH*(i+.5)+offset;ctx.shadowColor=theme.glow;ctx.shadowBlur=glowIntensity*(anim==='glowPulse'?1+Math.sin(progress*Math.PI)*.7:1);ctx.fillStyle=theme.text;ctx.fillText(line,W/2,y,maxW);ctx.shadowBlur=0});
 if(anim==='typewriter'&&progress<1){ctx.fillStyle=theme.accent;ctx.fillRect(W/2+Math.sin(t*.02)*4,boxY+boxH-8,Math.max(8,size*.14),3)}
 ctx.restore()
}
let importedSceneImage=null, importedSceneImageObject=null, importedSceneMediaId=null, importedSceneVideo=null, importedSceneVideoUrl=null, importedSceneVideoMediaId=null, importedNarrationMediaId=null;

const videoTemplates={
 royal:{label:'الذهب الملكي',a:'#49300f',b:'#1c140b',c:'#050506',line:'#e8bb51',glow:'#e4a33b',text:'#fff0c9',accent:'#e7ad42',mode:'gold'},
 nebula:{label:'سديم كوني',a:'#493b83',b:'#171b3c',c:'#070914',line:'#b7a0ff',glow:'#9e72ff',text:'#f2eaff',accent:'#c6a7ff',mode:'nebula'},
 cyber:{label:'سايبربانك',a:'#075267',b:'#0b1c2c',c:'#050912',line:'#46e4ef',glow:'#20c7e4',text:'#e5fcff',accent:'#43e5ef',mode:'cyber'},
 ember:{label:'جمر سينمائي',a:'#8e321e',b:'#2b1118',c:'#08070c',line:'#ff9b60',glow:'#ef4d2d',text:'#fff0e6',accent:'#ff855a',mode:'ember'},
 ocean:{label:'أعماق المحيط',a:'#13526c',b:'#102839',c:'#060c17',line:'#69d8e9',glow:'#2eafce',text:'#e5f9ff',accent:'#71d7ec',mode:'ocean'},
 emerald:{label:'زمرد فاخر',a:'#28644e',b:'#102c26',c:'#060d0d',line:'#91dfb6',glow:'#31a879',text:'#e8fff1',accent:'#9ce8bc',mode:'emerald'},
 ivory:{label:'مخطوطة عتيقة',a:'#8b7049',b:'#3b2c20',c:'#120e0c',line:'#e5c58c',glow:'#d1a45c',text:'#fff0d4',accent:'#f0c878',mode:'ivory'},
 minimal:{label:'بساطة أنيقة',a:'#343844',b:'#171a22',c:'#07090f',line:'#aeb8ca',glow:'#8795b8',text:'#f7f8fc',accent:'#d8deef',mode:'minimal'},
 aurora:{label:'الشفق القطبي',a:'#24635e',b:'#30264e',c:'#070d1c',line:'#86f1d5',glow:'#53cbb8',text:'#eafffa',accent:'#8bf2d8',mode:'aurora'},
 crystal:{label:'كريستال ملكي',a:'#687994',b:'#29283f',c:'#080d18',line:'#d5e4ff',glow:'#a2b9ee',text:'#f1f6ff',accent:'#d6e4ff',mode:'crystal'},
 zereosIvory:{label:'زيريوس الكلاسيكي — رخام عاجي',a:'#f8efd9',b:'#e6d4b4',c:'#c8b18a',line:'#a67b3d',glow:'#e6c98b',text:'#2c2116',accent:'#a67b3d',mode:'zereosIvory'},
 zereosNoir:{label:'زيريوس الملكي — أسود وذهبي',a:'#18110a',b:'#080807',c:'#030303',line:'#dcae4e',glow:'#f9a52b',text:'#fff0c5',accent:'#f4c76a',mode:'zereosNoir'}
};
const zereosTemplateImages={
 royal:{src:'./assets/template-zereos-royal.svg',image:null,loading:false},
 nebula:{src:'./assets/template-zereos-nebula.svg',image:null,loading:false},
 cyber:{src:'./assets/template-zereos-cyber.svg',image:null,loading:false},
 ember:{src:'./assets/template-zereos-ember.svg',image:null,loading:false},
 ocean:{src:'./assets/template-zereos-ocean.svg',image:null,loading:false},
 emerald:{src:'./assets/template-zereos-emerald.svg',image:null,loading:false},
 ivory:{src:'./assets/template-zereos-manuscript.svg',image:null,loading:false},
 minimal:{src:'./assets/template-zereos-minimal.svg',image:null,loading:false},
 aurora:{src:'./assets/template-zereos-aurora.svg',image:null,loading:false},
 crystal:{src:'./assets/template-zereos-crystal.svg',image:null,loading:false},
 zereosIvory:{src:'./assets/template-zereos-ivory.svg',image:null,loading:false},
 zereosNoir:{src:'./assets/template-zereos-noir.svg',image:null,loading:false}
};
function isImageTemplate(id){return Object.prototype.hasOwnProperty.call(zereosTemplateImages,id)}

function drawZereosTemplateBackground(id){
 const entry=zereosTemplateImages[id];if(!entry)return false;
 if(!entry.image&&!entry.loading){
  entry.loading=true;const image=new Image();
  image.onload=()=>{entry.image=image;entry.loading=false;try{drawFrame(playing?Math.max(0,performance.now()-startAt):0)}catch(_){}};
  image.onerror=()=>{entry.loading=false;console.warn('تعذر تحميل قالب زيريوس:',entry.src)};
  image.src=entry.src;
 }
 if(entry.image){ctx.drawImage(entry.image,0,0,W,H)}
 else{ctx.fillStyle=id==='zereosIvory'?'#f1e3c9':'#080807';ctx.fillRect(0,0,W,H)}
 return true;
}
let activeTemplate='royal';
try{activeTemplate=localStorage.getItem('zereos-video-template')||'royal'}catch(_){}
function setVideoTemplate(id){if(!videoTemplates[id])return;activeTemplate=id;try{localStorage.setItem('zereos-video-template',id)}catch(_){}document.querySelectorAll('[data-template]').forEach(card=>card.setAttribute('aria-pressed',String(card.dataset.template===id)));const label=videoTemplates[id].label;if($('activeTemplateLabel'))$('activeTemplateLabel').textContent=label;if($('templateStatus'))$('templateStatus').textContent='تم اختيار قالب «'+label+'». سيظهر في المعاينة والتصدير.';if(typeof drawFrame==='function')drawFrame(playing?Math.max(0,performance.now()-startAt):0);window.dispatchEvent(new Event('zereos-template-change'))}
document.querySelectorAll('[data-template]').forEach(card=>card.addEventListener('click',()=>setVideoTemplate(card.dataset.template)));
$('applyTemplateBtn')?.addEventListener('click',()=>{setVideoTemplate(activeTemplate);$('status').textContent='تم تطبيق قالب '+videoTemplates[activeTemplate].label+' على معاينة الفيديو والتصدير.'});
$('resetTemplateBtn')?.addEventListener('click',()=>setVideoTemplate('royal'));
const sceneImageObjects={};const sceneImageUrls={};const sceneImageMediaIds={};let currentProjectId=null;
function updateSceneTextPreviews(){const lines=typeof texts==='function'?texts():[];lines.forEach((line,i)=>{const el=$('sceneTextPreview'+i);if(el)el.textContent=String(line||'').trim().slice(0,85)||'لا يوجد نص لهذا المشهد بعد'})}
document.querySelectorAll('[data-scene-image]').forEach(input=>input.addEventListener('change',async()=>{const index=Number(input.dataset.sceneImage),file=input.files?.[0];if(!file)return;if(!file.type.startsWith('image/')){if($('sceneFileState'+index))$('sceneFileState'+index).textContent='الملف ليس صورة مدعومة.';input.value='';return}const url=URL.createObjectURL(file),img=new Image();img.onload=async()=>{if(sceneImageUrls[index])URL.revokeObjectURL(sceneImageUrls[index]);sceneImageUrls[index]=url;sceneImageObjects[index]=img;const state=$('sceneFileState'+index);if(state)state.textContent='جاهزة للمعاينة والتصدير: '+file.name;try{if(window.ZereosStorage?.local){const saved=await window.ZereosStorage.local.saveMedia({name:file.name,type:file.type,kind:'image',size:file.size,blob:file,projectId:currentProjectId||null,sceneIndex:index});sceneImageMediaIds[index]=saved.id;window.dispatchEvent(new Event('zereos-project-change'));if(state)state.textContent='تم حفظ الصورة مع المشروع: '+file.name}}catch(error){console.warn('تعذر حفظ صورة المشهد محليًا:',error);if(state)state.textContent='الصورة جاهزة الآن، لكن تعذر حفظها للمرة القادمة.'}drawFrame(playing?Math.max(0,performance.now()-startAt):0)};img.onerror=()=>{URL.revokeObjectURL(url);const state=$('sceneFileState'+index);if(state)state.textContent='تعذّر فتح الصورة؛ جرّب ملفًا آخر.'};img.src=url}));
document.querySelectorAll('[data-clear-scene]').forEach(button=>button.addEventListener('click',async()=>{const i=Number(button.dataset.clearScene),mediaId=sceneImageMediaIds[i];if(sceneImageUrls[i])URL.revokeObjectURL(sceneImageUrls[i]);delete sceneImageUrls[i];delete sceneImageObjects[i];delete sceneImageMediaIds[i];const input=document.querySelector('[data-scene-image="'+i+'"]');if(input)input.value='';if($('sceneFileState'+i))$('sceneFileState'+i).textContent='لم تُضف صورة لهذا المشهد.';if(mediaId&&window.ZereosStorage?.local){try{await window.ZereosStorage.local.deleteMedia(mediaId)}catch(error){console.warn('تعذر حذف صورة المشهد من المكتبة:',error)}}window.dispatchEvent(new Event('zereos-project-change'));drawFrame(playing?Math.max(0,performance.now()-startAt):0)}));
$('previewSceneStudioBtn')?.addEventListener('click',()=>{showToolPage('script');$('resetBtn')?.click();$('playBtn')?.click()});
$('openScriptFromStudioBtn')?.addEventListener('click',()=>showToolPage('script'));
$('openExportFromStudioBtn')?.addEventListener('click',()=>showToolPage('export'));
$('templateGrid')?.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){const card=event.target.closest('[data-template]');if(card){event.preventDefault();setVideoTemplate(card.dataset.template)}}});

function drawImportedImage(elapsed){
 const image=sceneImageObjects[currentScene]||importedSceneVideo||importedSceneImageObject;if(!image)return;
 const iw=importedSceneVideo?(image.videoWidth||W):image.width,ih=importedSceneVideo?(image.videoHeight||H):image.height;if(!iw||!ih)return;
 ctx.save();ctx.globalAlpha=.86;
 const timeline=sceneTimeline(),scene=timeline.find(item=>elapsed>=item.start&&elapsed<item.end)||timeline[timeline.length-1],sceneMs=Math.max(1,scene.end-scene.start),local=Math.max(0,Math.min(1,(elapsed-scene.start)/sceneMs)),motion=$('imageMotion')?.value||'cinematic',motionSpeed=Number($('cameraMotionSpeed')?.value||1);
 const base=Math.max(W/iw,H/ih),zoom=motion==='static'?1:motion==='drift'?1+.035*motionSpeed:1+local*.075*motionSpeed,w=iw*base*zoom,h=ih*base*zoom;
 const drift=motion==='drift'?(local-.5)*W*.035*motionSpeed:0;
 try{ctx.drawImage(image,(W-w)/2+drift,(H-h)/2,w,h)}catch(error){}
 ctx.fillStyle='rgba(0,0,0,.42)';ctx.fillRect(0,0,W,H);ctx.restore();
}
function drawTemplateComposition(t,scene,sceneElapsed,sceneDuration){
 if(isImageTemplate(activeTemplate))return;
 const theme=videoTemplates[activeTemplate]||videoTemplates.royal,progress=Math.max(0,Math.min(1,sceneElapsed/Math.max(1,sceneDuration)));
 const pulse=.5+.5*Math.sin(t*.0015),accent=theme.accent,line=theme.line;
 ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
 if(activeTemplate==='royal'){
   const x=W/2,y=H*.28,r=92+Math.sin(t*.0008)*4;
   ctx.globalAlpha=.72;ctx.strokeStyle=accent;ctx.lineWidth=2;
   for(let i=0;i<3;i++){ctx.beginPath();ctx.ellipse(x,y,r+i*19,r*.42+i*12,t*.00012,0,Math.PI*2);ctx.stroke()}
   ctx.fillStyle=accent;ctx.beginPath();ctx.moveTo(x,y-30);ctx.lineTo(x+22,y);ctx.lineTo(x,y+30);ctx.lineTo(x-22,y);ctx.closePath();ctx.fill();
   ctx.globalAlpha=.28;for(let i=0;i<8;i++){const a=i*Math.PI/4+t*.00015;ctx.beginPath();ctx.moveTo(x+Math.cos(a)*150,y+Math.sin(a)*72);ctx.lineTo(x+Math.cos(a)*174,y+Math.sin(a)*84);ctx.stroke()}
 }else if(activeTemplate==='nebula'){
   const x=W*(.22+.56*pulse),y=H*.23,r=70+progress*18;
   ctx.globalAlpha=.75;ctx.fillStyle='#d9d2ff';ctx.beginPath();ctx.arc(x,y,r*.23,0,Math.PI*2);ctx.fill();
   ctx.globalAlpha=.5;ctx.strokeStyle=line;ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(x,y,r*1.9,r*.48,-.25+t*.0001,0,Math.PI*2);ctx.stroke();
   ctx.globalAlpha=.23;ctx.lineWidth=1;for(let i=0;i<30;i++){const sx=(i*97+23)%W,sy=(i*173+41)%H;ctx.fillStyle=i%4===0?accent:'#fff';ctx.fillRect(sx,sy, i%5===0?3:1.5,i%5===0?3:1.5)}
 }else if(activeTemplate==='cyber'){
   ctx.globalAlpha=.85;ctx.strokeStyle=line;ctx.lineWidth=2;
   const y=H*.19+Math.sin(t*.001)*5;
   ctx.beginPath();ctx.moveTo(54,y);ctx.lineTo(170,y);ctx.lineTo(198,y+28);ctx.lineTo(W-198,y+28);ctx.lineTo(W-170,y);ctx.lineTo(W-54,y);ctx.stroke();
   ctx.globalAlpha=.45;for(let i=0;i<5;i++){const yy=H*.76+i*19;ctx.strokeRect(70,yy, W-140,5)}
   ctx.globalAlpha=.8;ctx.fillStyle=accent;ctx.font='bold 17px monospace';ctx.textAlign='left';ctx.direction='ltr';ctx.fillText('Z-0'+(scene+1)+' / '+Math.round(progress*100).toString().padStart(2,'0'),62,H*.15);
 }else if(activeTemplate==='ember'){
   ctx.globalAlpha=.38;ctx.fillStyle=accent;
   ctx.beginPath();ctx.moveTo(0,H*.16);ctx.lineTo(W*.28,0);ctx.lineTo(W*.18,H*.33);ctx.closePath();ctx.fill();
   ctx.beginPath();ctx.moveTo(W,H*.66);ctx.lineTo(W*.78,H);ctx.lineTo(W*.88,H*.72);ctx.closePath();ctx.fill();
   for(let i=0;i<22;i++){const x=(i*67+Math.sin(t*.001+i)*18)%W,y=(H-((i*113+t*(.025+i%3*.01))%H));ctx.globalAlpha=.2+.45*((i%5)/5);ctx.fillRect(x,y,2+(i%3),4+(i%4)*2)}
 }else if(activeTemplate==='ocean'){
   for(let band=0;band<4;band++){ctx.globalAlpha=.22+band*.07;ctx.strokeStyle=band%2?accent:line;ctx.lineWidth=2+band*.5;ctx.beginPath();for(let x=0;x<=W;x+=12){const y=H*(.17+band*.055)+Math.sin(x*.012+t*.0012+band)*11+Math.sin(x*.027-t*.0007)*5;if(x===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)}ctx.stroke()}
   ctx.globalAlpha=.38;ctx.fillStyle='#d8faff';ctx.beginPath();ctx.ellipse(W*.76,H*.23,40,9,-.18,0,Math.PI*2);ctx.fill();
 }else if(activeTemplate==='emerald'){
   ctx.globalAlpha=.56;ctx.strokeStyle=line;ctx.lineWidth=2;
   for(let i=0;i<5;i++){const x=70+i*145,y=H*.22+(i%2)*28;ctx.beginPath();ctx.moveTo(x,y+36);ctx.quadraticCurveTo(x-35,y,x,y-35);ctx.quadraticCurveTo(x+35,y,x,y+36);ctx.stroke();ctx.beginPath();ctx.moveTo(x,y+30);ctx.lineTo(x,y-24);ctx.stroke()}
   ctx.globalAlpha=.3;ctx.beginPath();ctx.arc(W/2,H*.25,100+progress*15,0,Math.PI*2);ctx.stroke();
 }else if(activeTemplate==='ivory'){
   ctx.globalAlpha=.8;ctx.strokeStyle=line;ctx.lineWidth=2;
   ctx.strokeRect(58,70,W-116,H-140);ctx.globalAlpha=.55;ctx.lineWidth=1;
   for(let i=0;i<6;i++){const y=H*.18+i*13;ctx.beginPath();ctx.moveTo(88,y);ctx.lineTo(W-88,y);ctx.stroke()}
   ctx.globalAlpha=.65;ctx.font='bold 16px serif';ctx.fillStyle=accent;ctx.textAlign='center';ctx.fillText('✦  مخطوطات زيريوس  ✦',W/2,H*.13);
 }else if(activeTemplate==='minimal'){
   ctx.globalAlpha=.9;ctx.fillStyle=accent;ctx.fillRect(64,H*.2,7,H*.54);ctx.globalAlpha=.5;ctx.fillRect(82,H*.2,2,H*.54);
   ctx.globalAlpha=.75;ctx.strokeStyle=line;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(W*.25,H*.81);ctx.lineTo(W*.75,H*.81);ctx.stroke();
   ctx.globalAlpha=.55;ctx.font='bold 15px sans-serif';ctx.textAlign='center';ctx.fillStyle=theme.text;ctx.fillText('IDEA  /  '+String(scene+1).padStart(2,'0'),W/2,H*.86);
 }else if(activeTemplate==='aurora'){
   for(let band=0;band<4;band++){ctx.globalAlpha=.18+band*.07;ctx.strokeStyle=band%2?accent:'#a3b7ff';ctx.lineWidth=16-band*3;ctx.beginPath();for(let x=-40;x<=W+40;x+=10){const y=H*(.15+band*.045)+Math.sin(x*.006+t*.0006+band)*48+Math.sin(x*.013-t*.0004)*20;if(x<0)ctx.moveTo(x,y);else ctx.lineTo(x,y)}ctx.stroke()}
 }else if(activeTemplate==='crystal'){
   ctx.globalAlpha=.52;ctx.strokeStyle=line;ctx.lineWidth=2;
   const points=[[W*.5,H*.09],[W*.83,H*.28],[W*.74,H*.51],[W*.5,H*.63],[W*.26,H*.51],[W*.17,H*.28]];
   ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();ctx.stroke();
   ctx.globalAlpha=.2;ctx.fillStyle=accent;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+2)%points.length],c=points[(i+1)%points.length];ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.lineTo(c[0],c[1]);ctx.closePath();ctx.fill()}
 }
 ctx.restore();
}

