
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
function drawOrnament(t){ctx.save();ctx.translate(W/2,220);ctx.rotate(Math.sin(t*.0004)*.04);ctx.strokeStyle=(videoTemplates[activeTemplate]||videoTemplates.royal).line;ctx.lineWidth=2;ctx.globalAlpha=.75;ctx.beginPath();ctx.moveTo(-70,0);ctx.lineTo(-22,0);ctx.moveTo(22,0);ctx.lineTo(70,0);ctx.moveTo(0,-27);ctx.lineTo(0,-9);ctx.moveTo(0,9);ctx.lineTo(0,27);ctx.stroke();ctx.beginPath();ctx.moveTo(0,-20);ctx.lineTo(20,0);ctx.lineTo(0,20);ctx.lineTo(-20,0);ctx.closePath();ctx.stroke();ctx.restore()}
function drawParticles(t){if(!$('dust').checked)return;ctx.save();for(const p of particles){const y=(p.y-t*p.v*.035+H)%H,x=p.x+Math.sin(t*.0006+p.phase)*15;ctx.globalAlpha=p.a*(.6+.4*Math.sin(t*.002+p.phase));ctx.fillStyle='#f2c66d';ctx.beginPath();ctx.arc(x,y,p.r,0,Math.PI*2);ctx.fill()}ctx.restore()}
function drawSeal(){if(!$('seal')?.checked)return;ctx.save();const x=W-92,y=H-104;ctx.globalAlpha=.78;ctx.strokeStyle=(videoTemplates[activeTemplate]||videoTemplates.royal).line;ctx.fillStyle='rgba(9,14,24,.66)';ctx.lineWidth=3;ctx.beginPath();ctx.arc(x,y,49,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(x,y,41,0,Math.PI*2);ctx.stroke();ctx.fillStyle=(videoTemplates[activeTemplate]||videoTemplates.royal).text;ctx.textAlign='center';ctx.textBaseline='middle';ctx.direction='ltr';ctx.font='bold 13px Tajawal';ctx.fillText('ZEREOS',x,y-5);ctx.font='bold 9px Tajawal';ctx.fillText('AI  •  ORIGINAL',x,y+13);ctx.globalAlpha=.42;ctx.beginPath();ctx.moveTo(x-20,y-25);ctx.lineTo(x+20,y-25);ctx.stroke();ctx.restore()}
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
 if(['royal','nebula','cyber','ocean','ivory'].includes(activeTemplate)){
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
 crystal:{label:'كريستال ملكي',a:'#687994',b:'#29283f',c:'#080d18',line:'#d5e4ff',glow:'#a2b9ee',text:'#f1f6ff',accent:'#d6e4ff',mode:'crystal'}
};
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
/* IndexedDB project persistence bootstrap */
(async function initProjectStorage(){
  
  $('exportFromPageBtn')?.addEventListener('click',()=>$('exportBtn').click());$('srtFromPageBtn')?.addEventListener('click',()=>$('exportSrtBtn').click());$('exportProjectFromPageBtn')?.addEventListener('click',()=>$('exportProjectBtn').click());
  const projectButton=document.createElement('button');
  projectButton.className='btn hidden';projectButton.id='projectsBtn';projectButton.textContent='▣ مشاريعي';
  $('randomBtn').insertAdjacentElement('beforebegin',projectButton);
  const panel=document.createElement('section');
  panel.className='panel hidden';panel.id='projectsPanel';panel.style.cssText='max-width:900px;margin:0 auto 20px;';
  panel.innerHTML='<div class="panelhead"><span>المشاريع المحفوظة على هذا الجهاز</span><button class="btn" id="closeProjectsBtn" type="button">إغلاق</button></div><div class="tool-actions"><button class="btn" id="newProjectBtn" type="button">مشروع جديد</button><button class="btn" id="exportProjectBtn" type="button">تصدير ملف المشروع</button><label class="btn" for="importProjectFile">استيراد مشروع</label><input id="importProjectFile" type="file" accept=".json,application/json" hidden></div><div id="projectList" class="fields"><p class="note">جارٍ تحميل المشاريع…</p></div><p class="note">تُحفظ المشاريع محليًا باستخدام IndexedDB. الملفات السحابية غير مفعلة بعد؛ تم فصل طبقة التخزين لتسهيل إضافتها لاحقًا.</p>';
  document.querySelector('main.layout').insertAdjacentElement('beforeend',panel);
  const mediaPanel=document.createElement('section');
  mediaPanel.className='panel hidden';mediaPanel.id='mediaPanel';mediaPanel.style.cssText='max-width:900px;margin:0 auto 20px;';
  mediaPanel.innerHTML='<div class="panelhead"><span>مكتبة الوسائط المحلية</span><button class="btn" id="closeMediaBtn" type="button">إغلاق</button></div><p class="note">اختر صورًا أو فيديوهات أو ملفات صوتية من هاتفك. تُحفظ الملفات داخل IndexedDB على هذا الجهاز.</p><div class="tool-actions"><label class="btn primary" for="mediaUploadInput">＋ رفع ملفات من الهاتف</label><input id="mediaUploadInput" type="file" accept="image/*,video/*,audio/*" multiple hidden><button class="btn" id="clearImageUseBtn" type="button">إزالة خلفية المشهد</button></div><div id="mediaUsage" class="note"></div><div class="fields media-filters"><div class="field"><label for="mediaSearch">بحث في الملفات</label><input id="mediaSearch" type="search" placeholder="اسم الملف أو نوعه…"></div><div class="field"><label for="mediaTypeFilter">نوع الملف</label><select id="mediaTypeFilter"><option value="all">كل الأنواع</option><option value="image">صور</option><option value="video">فيديو</option><option value="audio">صوت</option><option value="file">أخرى</option></select></div><div class="field"><label for="mediaSort">الترتيب</label><select id="mediaSort"><option value="newest">الأحدث أولًا</option><option value="oldest">الأقدم أولًا</option><option value="largest">الأكبر حجمًا</option><option value="name">الاسم أبجديًا</option></select></div></div><div class="tool-actions"><button class="btn" id="cleanMediaBtn" type="button">تنظيف الملفات غير المرتبطة بالمشاريع</button></div><p class="note">لن يسمح التطبيق بحذف ملف مرتبط بمشروع محفوظ. التنظيف الجماعي يحذف فقط الملفات التي لا يشير إليها أي مشروع؛ راجع القائمة قبل التأكيد.</p><div id="mediaList" class="fields"></div>';
  document.querySelector('main.layout').insertAdjacentElement('beforeend',mediaPanel);
  const projectsPanelSafeHide=()=>panel.classList.add('hidden');
  const mediaButton=document.createElement('button');mediaButton.className='btn hidden';mediaButton.id='mediaBtn';mediaButton.textContent='▧ ملفاتي';$('randomBtn').insertAdjacentElement('beforebegin',mediaButton);
  mediaButton.onclick=async()=>{mediaPanel.classList.remove('hidden');projectsPanelSafeHide();$('editorWorkspace').classList.add('hidden');document.querySelector('main.layout').classList.add('workspace-library');document.querySelector('.preview').classList.add('hidden');await refreshMedia()};
  $('closeMediaBtn').onclick=()=>showToolPage('script');
  $('clearImageUseBtn').onclick=()=>{importedSceneImageObject=null;importedSceneImage=null;importedSceneMediaId=null;if(importedSceneVideo)importedSceneVideo.pause();importedSceneVideo=null;if(importedSceneVideoUrl)URL.revokeObjectURL(importedSceneVideoUrl);importedSceneVideoUrl=null;importedSceneVideoMediaId=null;drawFrame(0);$('status').textContent='تمت إزالة خلفية المشهد.'};
  async function refreshMedia(){
    const list=$('mediaList');list.replaceChildren();
    try{
      const allAssets=await window.ZereosStorage.local.listMedia();
      const usage=await window.ZereosStorage.local.usage();
      const projects=await window.ZereosStorage.local.listProjects();
      const references=new Map();
      const mark=(id,label)=>{if(!id)return;const names=references.get(id)||[];if(!names.includes(label))names.push(label);references.set(id,names)};
      projects.forEach(project=>{
        const label=String(project.name||'مشروع بدون اسم');
        mark(project.imageMediaId,label);mark(project.videoMediaId,label);mark(project.narrationMediaId,label);
        Object.values(project.sceneImageMediaIds||{}).forEach(id=>mark(id,label));
      });
      mark(importedSceneMediaId,'المشروع المفتوح حاليًا');
      mark(importedSceneVideoMediaId,'المشروع المفتوح حاليًا');
      mark(importedNarrationMediaId,'التعليق الصوتي الحالي');
      Object.values(sceneImageMediaIds).forEach(id=>mark(id,'صور مشاهد المشروع الحالي'));
      const totalBytes=allAssets.reduce((sum,item)=>sum+(Number(item.size)||item.blob?.size||0),0);
      $('mediaUsage').textContent=(usage&&usage.usage!=null?'المساحة المستخدمة في المتصفح: '+(usage.usage/1024/1024).toFixed(1)+' MB من '+(usage.quota/1024/1024).toFixed(0)+' MB تقريبًا. ':'')+'مكتبتك: '+allAssets.length+' ملف · '+(totalBytes/1024/1024).toFixed(2)+' MB · '+allAssets.filter(item=>references.has(item.id)).length+' ملف مرتبط بمشاريع محفوظة.';
      const query=String($('mediaSearch')?.value||'').trim().toLocaleLowerCase();
      const kind=$('mediaTypeFilter')?.value||'all',sort=$('mediaSort')?.value||'newest';
      const assets=allAssets.filter(asset=>(kind==='all'||(asset.kind||'file')===kind)&&(!query||(String(asset.name||'')+' '+String(asset.kind||'')+' '+String(asset.type||'')).toLocaleLowerCase().includes(query)));
      assets.sort((a,b)=>sort==='oldest'?(a.createdAt||0)-(b.createdAt||0):sort==='largest'?(b.size||b.blob?.size||0)-(a.size||a.blob?.size||0):sort==='name'?String(a.name||'').localeCompare(String(b.name||'')):((b.createdAt||0)-(a.createdAt||0)));
      if(!assets.length){const empty=document.createElement('p');empty.className='media-empty';empty.textContent=allAssets.length?'لا توجد ملفات تطابق البحث أو نوع الملف المحدد.':'مكتبة الوسائط فارغة. ارفع ملفات من هاتفك للبدء.';list.appendChild(empty);return}
      assets.forEach(asset=>{
        const card=document.createElement('div');card.className='tool-card';
        const name=document.createElement('strong');name.textContent=asset.name;
        const meta=document.createElement('p');meta.className='note';meta.textContent=(asset.kind||'ملف')+' · '+((Number(asset.size)||asset.blob?.size||0)/1024/1024).toFixed(2)+' MB';
        const linked=references.get(asset.id)||[];
        if(linked.length){const ref=document.createElement('p');ref.className='media-reference';ref.textContent='مرتبط بـ: '+linked.slice(0,3).join('، ')+(linked.length>3?' و'+(linked.length-3)+' مشاريع أخرى':'');card.append(name,meta,ref)}else card.append(name,meta);
        const actions=document.createElement('div');actions.className='tool-actions';
        if(asset.kind==='image'){const use=document.createElement('button');use.className='btn primary';use.textContent='استخدام كخلفية';use.onclick=()=>{const url=URL.createObjectURL(asset.blob),img=new Image();img.onload=()=>{if(importedSceneImage)URL.revokeObjectURL(importedSceneImage);if(importedSceneVideo){importedSceneVideo.pause();importedSceneVideo=null}if(importedSceneVideoUrl)URL.revokeObjectURL(importedSceneVideoUrl);importedSceneVideoUrl=null;importedSceneImage=url;importedSceneImageObject=img;importedSceneMediaId=asset.id;importedSceneVideoMediaId=null;drawFrame(0);scheduleAutoSave();$('status').textContent='تم إدراج الصورة كخلفية للمعاينة والتصدير.'};img.onerror=()=>{URL.revokeObjectURL(url);alert('تعذر فتح الصورة')};img.src=url};actions.appendChild(use)}
        if(asset.kind==='video'){const useVideo=document.createElement('button');useVideo.className='btn primary';useVideo.textContent='استخدام كخلفية فيديو';useVideo.onclick=async()=>{const url=URL.createObjectURL(asset.blob),video=document.createElement('video');video.muted=true;video.loop=true;video.playsInline=true;video.preload='auto';video.src=url;try{await new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;video.onerror=()=>reject(new Error('تعذر قراءة ملف الفيديو'));});if(importedSceneImage)URL.revokeObjectURL(importedSceneImage);if(importedSceneVideo)importedSceneVideo.pause();if(importedSceneVideoUrl)URL.revokeObjectURL(importedSceneVideoUrl);importedSceneImage=null;importedSceneImageObject=null;importedSceneMediaId=null;importedSceneVideo=video;importedSceneVideoUrl=url;importedSceneVideoMediaId=asset.id;drawFrame(0);scheduleAutoSave();$('status').textContent='تم اختيار الفيديو كخلفية متحركة للمعاينة والتصدير.'}catch(error){URL.revokeObjectURL(url);alert(error.message)}};actions.appendChild(useVideo)}
        if(asset.kind==='audio'){const useAudio=document.createElement('button');useAudio.className='btn primary';useAudio.type='button';useAudio.textContent='استخدام كتعليق صوتي';useAudio.onclick=()=>selectVoiceAssetForVideo(asset,useAudio);actions.appendChild(useAudio)}
        const download=document.createElement('button');download.className='btn';download.textContent='تنزيل';download.onclick=()=>{const url=URL.createObjectURL(asset.blob),a=document.createElement('a');a.href=url;a.download=asset.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000)};actions.appendChild(download);
        const del=document.createElement('button');del.className='btn';del.textContent=linked.length?'مرتبط بمشروع':'حذف';del.disabled=linked.length>0;del.title=linked.length?'أزل الملف من المشروع واحفظ التغييرات أولًا':'حذف هذا الملف نهائيًا من التخزين المحلي';del.onclick=async()=>{if(confirm('حذف الملف '+asset.name+' نهائيًا من المكتبة المحلية؟')){await window.ZereosStorage.local.deleteMedia(asset.id);await refreshMedia()}};actions.appendChild(del);
        card.append(actions);list.appendChild(card);
      });
    }catch(error){list.textContent='تعذر تحميل مكتبة الوسائط: '+error.message}
  }
  ['mediaSearch','mediaTypeFilter','mediaSort'].forEach(id=>$(id)?.addEventListener(id==='mediaSearch'?'input':'change',refreshMedia));
  $('cleanMediaBtn').onclick=async()=>{
    try{
      const projects=await window.ZereosStorage.local.listProjects(),assets=await window.ZereosStorage.local.listMedia(),used=new Set();
      projects.forEach(project=>{[project.imageMediaId,project.videoMediaId,project.narrationMediaId,...Object.values(project.sceneImageMediaIds||{})].filter(Boolean).forEach(id=>used.add(id))});
      [importedSceneMediaId,importedSceneVideoMediaId,importedNarrationMediaId,...Object.values(sceneImageMediaIds)].filter(Boolean).forEach(id=>used.add(id));
      const unused=assets.filter(asset=>!used.has(asset.id));
      if(!unused.length){alert('لا توجد ملفات غير مرتبطة بأي مشروع محفوظ.');return}
      const bytes=unused.reduce((sum,item)=>sum+(Number(item.size)||item.blob?.size||0),0);
      if(!confirm('سيتم حذف '+unused.length+' ملف غير مرتبط بأي مشروع، بإجمالي '+(bytes/1024/1024).toFixed(2)+' MB. قد تكون بينها ملفات رفعتها للاستخدام لاحقًا. هل تريد المتابعة؟'))return;
      for(const asset of unused)await window.ZereosStorage.local.deleteMedia(asset.id);
      $('status').textContent='تم تنظيف '+unused.length+' ملف وتحرير مساحة محلية تقديرية قدرها '+(bytes/1024/1024).toFixed(2)+' MB.';
      await refreshMedia();
    }catch(error){alert('تعذر تنظيف المكتبة: '+error.message)}
  };
  $('mediaUploadInput').onchange=async e=>{
    const files=Array.from(e.target.files||[]);if(!files.length)return;
    $('status').textContent='جارٍ حفظ الملفات على هذا الجهاز…';
    try{
      for(const file of files){
        const kind=file.type.startsWith('image/')?'image':file.type.startsWith('video/')?'video':file.type.startsWith('audio/')?'audio':'file';
        await window.ZereosStorage.local.saveMedia({name:file.name,type:file.type,kind,size:file.size,blob:file,projectId:currentProjectId});
      }
      $('status').textContent='تم حفظ '+files.length+' ملف/ملفات في مكتبة الوسائط المحلية.';
      await refreshMedia();
    }catch(error){alert('تعذر حفظ الملفات. قد تكون مساحة المتصفح غير كافية: '+error.message)}
    finally{e.target.value=''}
  };
  async function selectVoiceAssetForVideo(asset,button){const status=$('voiceLibraryStatus'),fileStatus=$('fileStatus'),mainStatus=$('status'),oldLabel=button?.textContent;try{if(!asset?.blob)throw new Error('ملف الصوت غير متاح في التخزين المحلي.');if(button){button.disabled=true;button.textContent='جارٍ تجهيز الصوت…'}if(status)status.textContent='جارٍ تجهيز '+asset.name+' لاستخدامه في الفيديو…';const ac=ensureAudio();const bytes=await asset.blob.arrayBuffer();let decoded;try{decoded=await ac.decodeAudioData(bytes.slice(0));}catch(firstError){decoded=await new Promise((resolve,reject)=>ac.decodeAudioData(bytes.slice(0),resolve,reject));}if(!decoded||!decoded.length)throw new Error('تم فتح الملف لكن لم يُقرأ منه صوت. جرّب إعادة توليده.');await ac.resume();narrationBuffer=decoded;narrationScriptSnapshot=texts().map(line=>String(line||'').trim()).join('\n');importedNarrationMediaId=asset.id;narrationLoadToken++;$('narrationFile').value='';fileStatus.textContent='تم اختيار '+asset.name+' ('+Math.ceil(decoded.duration)+' ثانية) وسيُضمّن في الفيديو.';if(status)status.textContent='تم اختيار '+asset.name+' للتصدير بنجاح.';mainStatus.textContent='تم تجهيز الملف الصوتي من مكتبة الأصوات.';scheduleAutoSave();if(button)button.textContent='تم الاختيار ✓';}catch(error){console.error('Selecting local narration failed',error);const message='تعذر تجهيز الملف الصوتي: '+(error?.message||String(error));if(status)status.textContent=message;fileStatus.textContent=message;mainStatus.textContent=message;if(button)button.textContent=oldLabel||'إعادة المحاولة';}finally{if(button){button.disabled=false;if(button.textContent==='جارٍ تجهيز الصوت…')button.textContent=oldLabel||'استخدام في الفيديو';}}}
  async function renderVoiceLibrary(){
    const list=$('voiceLibraryList');if(!list)return;
    list.replaceChildren();
    try{
      // The library is intentionally limited to audio files saved by the user or generated in ZEREOS.
      const assets=(await window.ZereosStorage.local.listMedia()).filter(a=>a.kind==='audio');
      const status=$('voiceLibraryStatus');
      if(status)status.textContent=assets.length+' ملفًا صوتيًا محفوظًا داخل مكتبة ZEREOS. لا تُعرض أصوات الجهاز أو النظام هنا.';
      const savedHeading=document.createElement('h4');savedHeading.className='smalltitle';savedHeading.textContent='الأصوات والتسجيلات المحفوظة';list.appendChild(savedHeading);
      if(!assets.length){const empty=document.createElement('p');empty.className='note';empty.textContent='المكتبة فارغة حاليًا. ولّد تعليقًا بالذكاء الاصطناعي أو أضف تسجيلًا صوتيًا.';list.appendChild(empty)}
      assets.forEach(asset=>{
        const card=document.createElement('div');card.className='tool-card';
        const name=document.createElement('strong');name.textContent=asset.name;
        const category=document.createElement('p');category.className='note';
        const profileNames={doc:'راوي وثائقي',mystery:'أداء غامض',news:'أداء إخباري',excited:'أداء حماسي',calm:'أداء هادئ',deep:'طبقة أخفض',bright:'طبقة أعلى',fast:'سريع',slow:'بطيء',warm:'دافئ',dramatic:'درامي',story:'حكائي',soft:'ناعم',bold:'قوي وواضح',neutral:'محايد',human:'تسجيل بشري',ai:'ذكاء اصطناعي',other:'غير مصنّف'};
        category.textContent=(asset.voiceCategory==='human'?'تسجيل بشري':asset.voiceCategory==='ai'?'ملف مولّد بالذكاء الاصطناعي':'ملف صوتي')+' · '+(profileNames[asset.voiceProfile]||'غير مصنّف')+' · '+((asset.size||asset.blob?.size||0)/1024/1024).toFixed(2)+' MB';
        const actions=document.createElement('div');actions.className='tool-actions';
        const preview=document.createElement('button');preview.className='btn';preview.type='button';preview.textContent='▶ استماع';
        preview.onclick=()=>{const url=URL.createObjectURL(asset.blob);const audio=new Audio(url);audio.onended=()=>URL.revokeObjectURL(url);audio.onerror=()=>{URL.revokeObjectURL(url);if($('voiceLibraryStatus'))$('voiceLibraryStatus').textContent='تعذر تشغيل الملف الصوتي.'};audio.play().catch(error=>{URL.revokeObjectURL(url);if($('voiceLibraryStatus'))$('voiceLibraryStatus').textContent='تعذر تشغيل الملف: '+error.message})};
        const use=document.createElement('button');use.className='btn primary';use.type='button';use.textContent='استخدام في الفيديو';
        use.onclick=()=>selectVoiceAssetForVideo(asset,use);
        actions.append(preview,use);card.append(name,category,actions);list.appendChild(card);
      });
    }catch(error){list.textContent='تعذر تحميل مكتبة الأصوات: '+error.message}
  }
    async function saveVoiceFiles(files,voiceCategory){
    if(!files.length)return;
    const status=$('voiceLibraryStatus');if(status)status.textContent='جارٍ حفظ الملفات الصوتية محليًا…';
    try{
      for(const file of files){
        if(!file.type.startsWith('audio/'))throw new Error('اختر ملفات صوتية فقط.');
        await window.ZereosStorage.local.saveMedia({name:file.name,type:file.type,kind:'audio',size:file.size,blob:file,projectId:currentProjectId,voiceCategory,voiceProfile:$('voiceProfileSelect')?.value||'other'});
      }
      if(status)status.textContent='تم حفظ '+files.length+' ملف صوتي محليًا.';
      await renderVoiceLibrary();await refreshMedia();
      return true;
    }catch(error){if(status)status.textContent='تعذر الحفظ: '+error.message;return false}
  }
  // Integrated public 3arab VoiceDesign generator (no API key; public Space quota/availability applies).
  const embeddedVoiceButton=$('embeddedVoiceGenerateBtn');
  const embeddedVoiceStatus=$('embeddedVoiceStatus');
  const embeddedVoicePreview=$('embeddedVoicePreview');
  const embeddedVoiceText=$('embeddedVoiceText');
  const embeddedVoiceGender=$('embeddedVoiceGender');
  const embeddedVoiceCaption=$('embeddedVoiceCaption');
  let gradioVoiceClientPromise=null, embeddedVoiceObjectUrl=null;
  $('useVideoWisdomForEmbeddedVoiceBtn')?.addEventListener('click',()=>{
    const sceneText=['scriptTitle','scriptBody1','scriptBody2','scriptCta'].map(id=>$(id)?.value?.trim()).filter(Boolean).join('\n\n');
    if(!sceneText){if(embeddedVoiceStatus)embeddedVoiceStatus.textContent='اكتب نص الحكمة في مشاهد الفيديو أولًا.';return}
    embeddedVoiceText.value=sceneText;
    if(embeddedVoiceStatus)embeddedVoiceStatus.textContent='تم نقل نص الحكمة ومشاهد الفيديو إلى حقل التعليق الصوتي. يمكنك توليده الآن.';
    embeddedVoiceText.focus();
  });
  async function get3arabVoiceClient(){
    if(!gradioVoiceClientPromise){
      gradioVoiceClientPromise=(async()=>{
        const mod=await import('https://cdn.jsdelivr.net/npm/@gradio/client/dist/index.min.js');
        if(!mod.Client)throw new Error('تعذر تحميل مكتبة الاتصال بمحرك الصوت.');
        return await mod.Client.connect('sherif1313/3arab-TTS-VoiceDesign-v2');
      })().catch(error=>{gradioVoiceClientPromise=null;throw error});
    }
    return gradioVoiceClientPromise;
  }
  embeddedVoiceButton?.addEventListener('click',async()=>{
    const textValue=embeddedVoiceText?.value?.trim();
    if(!textValue){if(embeddedVoiceStatus)embeddedVoiceStatus.textContent='اكتب نص التعليق أولًا.';return}
    if(embeddedVoiceButton.disabled)return;
    embeddedVoiceButton.disabled=true;
    const oldLabel=embeddedVoiceButton.textContent;
    embeddedVoiceButton.textContent='جارٍ الاتصال بمحرك الصوت…';
    if(embeddedVoiceStatus)embeddedVoiceStatus.textContent='جارٍ الاتصال بالمحرك العام؛ قد يستغرق تحميل النموذج أو الانتظار بعض الوقت.';
    try{
      const client=await get3arabVoiceClient();
      embeddedVoiceButton.textContent='جارٍ توليد الصوت…';
      const style=embeddedVoiceCaption?.value?.trim()||'راوي وثائقي عربي واضح وطبيعي';
      const gender=embeddedVoiceGender?.value||'ذكر';
      const caption=gender==='بدون'?'':style;
      const result=await client.predict('/gradio_inference',[
        textValue,caption,40,1,'','',1.0,'linear',-1.0,'independent',3.0,4.0,'',0.5,1.0,true,'','','','',''
      ]);
      const audioResult=result?.data?.[0];
      if(!audioResult)throw new Error('المحرك لم يُرجع ملفًا صوتيًا. جرّب مرة أخرى أو افتح المحرك الخارجي.');
      let audioUrl=typeof audioResult==='string'?audioResult:(audioResult.url||audioResult.path||audioResult.name||'');
      if(!audioUrl)throw new Error('استجابة المحرك لا تحتوي على رابط صوت مفهوم.');
      if(audioUrl.startsWith('/'))audioUrl='https://sherif1313-3arab-tts-voicedesign-v2.hf.space'+audioUrl;
      const response=await fetch(audioUrl);
      if(!response.ok)throw new Error('تعذر تنزيل الصوت من المحرك (HTTP '+response.status+').');
      const blob=await response.blob();
      const mime=blob.type&&blob.type.startsWith('audio/')?blob.type:(audioResult.mime_type||'audio/wav');
      const file=new File([blob],'ZEREOS_3arab_'+Date.now()+'.wav',{type:mime});
      if(embeddedVoiceObjectUrl)URL.revokeObjectURL(embeddedVoiceObjectUrl);
      embeddedVoiceObjectUrl=URL.createObjectURL(file);
      embeddedVoicePreview.src=embeddedVoiceObjectUrl;
      embeddedVoicePreview.classList.remove('hidden');
      embeddedVoiceButton.textContent='جارٍ حفظ الصوت بالمكتبة…';
      const saved=await saveVoiceFiles([file],'ai');
      if(!saved)throw new Error('تم توليد الصوت لكن تعذر حفظه في المكتبة المحلية.');
      if(embeddedVoiceStatus)embeddedVoiceStatus.textContent='اكتمل التوليد وحُفظ الملف في مكتبة الأصوات المحلية. يمكنك معاينته واختياره للفيديو.';
    }catch(error){
      if(embeddedVoiceStatus)embeddedVoiceStatus.textContent='تعذر التوليد داخل التطبيق: '+(error?.message||String(error))+' — يمكنك استخدام المحرك الخارجي أدناه.';
    }finally{
      embeddedVoiceButton.disabled=false;
      embeddedVoiceButton.textContent=oldLabel||'✧ توليد الصوت وحفظه بالمكتبة';
    }
  });
  $('humanVoiceUpload').addEventListener('change',e=>{saveVoiceFiles(Array.from(e.target.files||[]),'human');e.target.value=''});
  $('aiVoiceUpload').addEventListener('change',e=>{saveVoiceFiles(Array.from(e.target.files||[]),'ai');e.target.value=''});
  $('refreshVoiceLibraryBtn').addEventListener('click',()=>{renderVoiceLibrary()});

  const projectName=()=>{const value=window.ZereosStorage.local.activeProjectId();return value||('zereos-'+Date.now())};
  currentProjectId=await window.ZereosStorage.local.activeProjectId()||('project-'+Date.now());
  const snapshot=()=>({
    id:currentProjectId,name:document.title.includes('ZEREOS')?'مشروع ZEREOS':'مشروع فيديو',activeTemplate,
    sceneImageMediaIds:{...sceneImageMediaIds},
    editor:{scriptTitle:$('scriptTitle').value,scriptBody1:$('scriptBody1').value,scriptBody2:$('scriptBody2').value,scriptCta:$('scriptCta').value,bgStyle:$('bgStyle').value,fontFamily:$('fontFamily').value,fontSize:$('fontSize').value,sceneSeconds:$('sceneSeconds').value,imageMotion:$('imageMotion')?.value||'cinematic',textAnimation:$('textAnimation')?.value||'fadeUp',graphicFrame:$('graphicFrame')?.value||'ornate',sceneTransition:$('sceneTransition')?.value||'fade',exportProfile:$('exportProfile')?.value||'standard',glowIntensity:$('glowIntensity')?.value||'18',captionStyle:$('captionStyle')?.value||'clean',dust:$('dust').checked,seal:$('seal').checked,captions:$('captions').checked,music:$('music').value,volume:$('volume').value,narrationVolume:$('narrationVolume')?.value||'1'},
    imageMediaId:importedSceneMediaId||null,
    videoMediaId:importedSceneVideoMediaId||null,
    narrationMediaId:importedNarrationMediaId||null,
    createdAt:Date.now()
  });
  async function applyProject(p){
    if(!p||!p.editor)return;
    currentProjectId=p.id;window.ZereosStorage.local.setActiveProjectId(p.id);
    if(importedSceneImage)URL.revokeObjectURL(importedSceneImage);importedSceneImage=null;importedSceneImageObject=null;importedSceneMediaId=null;if(importedSceneVideo)importedSceneVideo.pause();importedSceneVideo=null;if(importedSceneVideoUrl)URL.revokeObjectURL(importedSceneVideoUrl);importedSceneVideoUrl=null;importedSceneVideoMediaId=null;importedNarrationMediaId=null;stopPreviewNarration();narrationBuffer=null;Object.keys(sceneImageUrls).forEach(key=>{try{URL.revokeObjectURL(sceneImageUrls[key])}catch(_){}});Object.keys(sceneImageUrls).forEach(key=>delete sceneImageUrls[key]);Object.keys(sceneImageObjects).forEach(key=>delete sceneImageObjects[key]);Object.keys(sceneImageMediaIds).forEach(key=>delete sceneImageMediaIds[key]);
    if(p.narrationMediaId){try{const audioAsset=await window.ZereosStorage.local.getMedia(p.narrationMediaId);if(audioAsset?.blob){const ac=ensureAudio();narrationBuffer=await ac.decodeAudioData(await audioAsset.blob.arrayBuffer());narrationScriptSnapshot=texts().map(line=>String(line||'').trim()).join('\n');importedNarrationMediaId=audioAsset.id;$('fileStatus').textContent='تم استعادة التعليق الصوتي: '+audioAsset.name}}catch(error){console.warn('تعذر استعادة التعليق الصوتي',error)}}
    if(p.imageMediaId){try{const asset=await window.ZereosStorage.local.getMedia(p.imageMediaId);if(asset?.blob){const url=URL.createObjectURL(asset.blob),img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=url});importedSceneImage=url;importedSceneImageObject=img;importedSceneMediaId=asset.id}}catch(error){console.warn('تعذر استعادة صورة المشروع',error)}}
    if(p.videoMediaId){try{const asset=await window.ZereosStorage.local.getMedia(p.videoMediaId);if(asset?.blob){const url=URL.createObjectURL(asset.blob),video=document.createElement('video');video.muted=true;video.loop=true;video.playsInline=true;video.preload='auto';video.src=url;await new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;video.onerror=reject});importedSceneVideo=video;importedSceneVideoUrl=url;importedSceneVideoMediaId=asset.id}}catch(error){console.warn('تعذر استعادة فيديو خلفية المشروع',error)}}
    for(const [index,id] of Object.entries(p.sceneImageMediaIds||{})){try{const asset=await window.ZereosStorage.local.getMedia(id);if(!asset?.blob)continue;const url=URL.createObjectURL(asset.blob),img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=url});sceneImageUrls[index]=url;sceneImageObjects[index]=img;sceneImageMediaIds[index]=asset.id;const state=$('sceneFileState'+index);if(state)state.textContent='تم استعادة الصورة: '+asset.name}catch(error){console.warn('تعذر استعادة صورة المشهد '+index,error)}}
    Object.entries(p.editor).forEach(([id,value])=>{const el=$(id);if(!el)return;if(el.type==='checkbox')el.checked=!!value;else el.value=value});
    if(p.activeTemplate&&videoTemplates[p.activeTemplate])setVideoTemplate(p.activeTemplate);updateSceneTextPreviews();update();drawFrame(0);$('status').textContent='تم فتح المشروع: '+(p.name||p.id);
  }
  async function refreshProjects(){
    const list=$('projectList');if(!list)return;
    try{
      const projects=await window.ZereosStorage.local.listProjects();
      list.replaceChildren();
      if(!projects.length){const p=document.createElement('p');p.className='note';p.textContent='لا توجد مشاريع محفوظة بعد. اضغط «حفظ المشروع الحالي». ';list.appendChild(p);return}
      projects.forEach(p=>{
        const row=document.createElement('div');row.className='tool-card';
        const title=document.createElement('strong');title.textContent=p.name||'مشروع بدون اسم';
        const meta=document.createElement('p');meta.className='note';meta.textContent='آخر حفظ: '+new Date(p.updatedAt).toLocaleString();
        const actions=document.createElement('div');actions.className='tool-actions';
        const open=document.createElement('button');open.className='btn primary';open.textContent='فتح';open.onclick=()=>{applyProject(p);panel.classList.add('hidden')};
        const rename=document.createElement('button');rename.className='btn';rename.textContent='إعادة تسمية';rename.onclick=async()=>{const name=prompt('اسم المشروع الجديد',p.name||'مشروعي');if(name&&name.trim()){await window.ZereosStorage.local.saveProject({...p,name:name.trim()});refreshProjects()}};
        const del=document.createElement('button');del.className='btn';del.textContent='حذف';del.onclick=async()=>{if(confirm('حذف المشروع المحفوظ «'+(p.name||p.id)+'»؟')){await window.ZereosStorage.local.deleteProject(p.id);refreshProjects()}};
        actions.append(open,rename,del);row.append(title,meta,actions);list.appendChild(row);
      });
    }catch(error){list.textContent='تعذر قراءة المشاريع من التخزين المحلي: '+(error.message||error)}
  }
  async function saveCurrent(askName=true){
    const old=await window.ZereosStorage.local.getProject(currentProjectId);
    const name=old?.name||(askName?(prompt('اسم المشروع','مشروع ZEREOS')||'مشروع ZEREOS'):'مشروع ZEREOS');
    const record={...snapshot(),name,createdAt:old?.createdAt||Date.now()};
    await window.ZereosStorage.local.saveProject(record);
    $('status').textContent='تم حفظ المشروع محليًا عبر IndexedDB.';
    await refreshProjects();
  }
  /* Save the active project after edits, without interrupting typing. */
  let autoSaveTimer=0, autoSaveBusy=false, autoSaveAgain=false;
  async function runAutoSave(){
    if(autoSaveBusy){autoSaveAgain=true;return}
    autoSaveBusy=true;
    try{
      const old=await window.ZereosStorage.local.getProject(currentProjectId);
      const record={...snapshot(),name:old?.name||'مشروع ZEREOS',createdAt:old?.createdAt||Date.now()};
      await window.ZereosStorage.local.saveProject(record);
      const label=$('saveState');
      if(label)label.textContent='حُفظت التعديلات تلقائيًا على هذا الجهاز.';
    }catch(error){
      const label=$('saveState');
      if(label)label.textContent='تعذر الحفظ التلقائي: '+(error.message||error);
    }finally{
      autoSaveBusy=false;
      if(autoSaveAgain){autoSaveAgain=false;scheduleAutoSave()}
    }
  }
  function scheduleAutoSave(){
    if(autoSaveTimer)clearTimeout(autoSaveTimer);
    autoSaveTimer=setTimeout(runAutoSave,1100);
  }
  window.addEventListener('zereos-template-change',scheduleAutoSave);
  window.addEventListener('zereos-project-change',scheduleAutoSave);
  ['scriptTitle','scriptBody1','scriptBody2','scriptCta','bgStyle','fontFamily','fontSize','sceneSeconds','imageMotion','textAnimation','graphicFrame','sceneTransition','exportProfile','glowIntensity','dust','seal','captions','captionStyle','music','volume','narrationVolume'].forEach(id=>{
    const el=$(id);if(el)el.addEventListener('input',scheduleAutoSave);
    if(el)el.addEventListener('change',scheduleAutoSave);
  });
  projectButton.onclick=async()=>{panel.classList.remove('hidden');mediaPanel.classList.add('hidden');$('editorWorkspace').classList.add('hidden');document.querySelector('main.layout').classList.add('workspace-library');document.querySelector('.preview').classList.add('hidden');await refreshProjects()};
  $('closeProjectsBtn').onclick=()=>showToolPage('script');
  window.ZereosSaveCurrentProject=()=>saveCurrent();
  $('newProjectBtn').onclick=async()=>{if(confirm('بدء مشروع جديد؟ احفظ مشروعك الحالي أولًا إذا احتجت إليه.')){if(autoSaveTimer)clearTimeout(autoSaveTimer);Object.keys(sceneImageUrls).forEach(key=>{try{URL.revokeObjectURL(sceneImageUrls[key])}catch(_){}});Object.keys(sceneImageUrls).forEach(key=>delete sceneImageUrls[key]);Object.keys(sceneImageObjects).forEach(key=>delete sceneImageObjects[key]);Object.keys(sceneImageMediaIds).forEach(key=>delete sceneImageMediaIds[key]);currentProjectId='project-'+Date.now();window.ZereosStorage.local.setActiveProjectId(currentProjectId);if(importedSceneImage)URL.revokeObjectURL(importedSceneImage);importedSceneImage=null;importedSceneImageObject=null;importedSceneMediaId=null;if(importedSceneVideo)importedSceneVideo.pause();importedSceneVideo=null;if(importedSceneVideoUrl)URL.revokeObjectURL(importedSceneVideoUrl);importedSceneVideoUrl=null;importedSceneVideoMediaId=null;importedNarrationMediaId=null;stopPreviewNarration();narrationBuffer=null;$('narrationFile').value='';$('fileStatus').textContent='اختر تسجيلًا صوتيًا لإضافته إلى المشروع الجديد.';['scriptTitle','scriptBody1','scriptBody2','scriptCta'].forEach(id=>$(id).value='');$('textAnimation').value='fadeUp';$('graphicFrame').value='ornate';$('sceneTransition').value='fade';$('exportProfile').value='standard';$('glowIntensity').value='18';setVideoTemplate('royal');update();drawFrame(0);$('status').textContent='بدأ مشروع جديد دون وسائط المشروع السابق.';scheduleAutoSave()}};
  async function blobToBase64(blob){const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';const chunk=0x8000;for(let i=0;i<bytes.length;i+=chunk)binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+chunk,bytes.length)));return btoa(binary)}
  function base64ToBlob(data,type){const binary=atob(data),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return new Blob([bytes],{type:type||'application/octet-stream'})}
  $('exportProjectBtn').onclick=async()=>{try{const record={...snapshot(),name:(await window.ZereosStorage.local.getProject(currentProjectId))?.name||'مشروع ZEREOS'};const mediaIds=new Set([record.imageMediaId,record.videoMediaId,record.narrationMediaId,...Object.values(record.sceneImageMediaIds||{})].filter(Boolean));const localMedia=await window.ZereosStorage.local.listMedia(currentProjectId);localMedia.forEach(item=>mediaIds.add(item.id));const assets=[];let totalBytes=0;for(const id of mediaIds){const asset=await window.ZereosStorage.local.getMedia(id);if(!asset?.blob)continue;totalBytes+=asset.size||asset.blob.size||0;if(totalBytes>25*1024*1024)throw new Error('حجم الوسائط المرتبطة يتجاوز 25 ميجابايت. نزّل المشروع دون وسائط أو صدّر الملفات الكبيرة منفصلة لتجنب استهلاك ذاكرة الهاتف.');assets.push({id:asset.id,name:asset.name,type:asset.type,kind:asset.kind,size:asset.size,base64:await blobToBase64(asset.blob)})}record.mediaAssets=assets;const blob=new Blob([JSON.stringify(record)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='zereos-project-'+Date.now()+'.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);$('status').textContent='تم تصدير المشروع مع '+assets.length+' ملف وسائط ('+(totalBytes/1024/1024).toFixed(1)+' ميجابايت).'}catch(error){$('status').textContent='تعذر تصدير المشروع: '+error.message}};
  $('importProjectFile').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;try{if(file.size>40*1024*1024)throw new Error('ملف المشروع أكبر من 40 ميجابايت. صدّر الملفات الكبيرة منفصلة لتجنب استهلاك ذاكرة الهاتف.');const p=JSON.parse(await file.text());if(!p||typeof p!=='object'||!p.editor||typeof p.editor!=='object'||Array.isArray(p.editor))throw new Error('ملف المشروع غير صالح');const mediaAssets=Array.isArray(p.mediaAssets)?p.mediaAssets:[];if(mediaAssets.length>100)throw new Error('المشروع يحتوي على أكثر من 100 ملف وسائط.');const estimatedBytes=mediaAssets.reduce((sum,asset)=>sum+(typeof asset?.base64==='string'?Math.floor(asset.base64.length*3/4):0),0);if(estimatedBytes>25*1024*1024)throw new Error('حجم الوسائط يتجاوز 25 ميجابايت. استورد مشروعًا أصغر أو قسّم الوسائط.');const oldId=p.id;p.id='project-'+Date.now();p.name=(p.name||'مشروع مستورد')+' (مستورد)';p.createdAt=Date.now();const idMap={};for(const asset of (Array.isArray(p.mediaAssets)?p.mediaAssets:[])){if(!asset.base64)continue;const saved=await window.ZereosStorage.local.saveMedia({name:asset.name||'وسيط مستورد',type:asset.type||'application/octet-stream',kind:asset.kind||'file',size:asset.size||0,blob:base64ToBlob(asset.base64,asset.type),projectId:p.id});idMap[asset.id]=saved.id}['imageMediaId','videoMediaId','narrationMediaId'].forEach(key=>{if(p[key]&&idMap[p[key]])p[key]=idMap[p[key]]});Object.entries(p.sceneImageMediaIds||{}).forEach(([index,id])=>{if(idMap[id])p.sceneImageMediaIds[index]=idMap[id];else delete p.sceneImageMediaIds[index]});delete p.mediaAssets;await window.ZereosStorage.local.saveProject(p);await applyProject(p);await refreshProjects();$('status').textContent='تم استيراد المشروع ووسائطه وحفظها على هذا الجهاز.'}catch(error){alert('تعذر استيراد المشروع: '+error.message)}finally{e.target.value=''}};
  try{const id=await window.ZereosStorage.local.activeProjectId();if(id){const p=await window.ZereosStorage.local.getProject(id);if(p)await applyProject(p)}}catch(error){console.warn('تعذر استعادة المشروع النشط',error)}
  window.ZereosRefreshVoiceLibrary=renderVoiceLibrary;
  await renderVoiceLibrary();
})().catch(error=>console.error('Project storage initialization failed',error));

