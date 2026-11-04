'use strict';
(()=>{
 const $=id=>document.getElementById(id);
 const file=$('quranAudioFile'),url=$('quranAudioUrl'),permission=$('quranPermission');
 const button=$('quranAudioLoadBtn'),player=$('quranAudioPlayer'),status=$('quranAudioStatus');
 let objectUrl='';
 function updateButton(){button.disabled=!permission.checked||(!file.files?.[0]&&!url.value.trim())}
 function say(message){status.textContent=message}
 permission.addEventListener('change',updateButton);
 file.addEventListener('change',()=>{if(file.files?.[0])url.value='';updateButton()});
 url.addEventListener('input',()=>{if(url.value.trim())file.value='';updateButton()});
 button.addEventListener('click',()=>{
  if(!permission.checked){say('أكد أولًا أن لديك إذنًا باستخدام التسجيل.');return}
  const selected=file.files?.[0];
  let source='';
  if(selected){
   if(!selected.type.startsWith('audio/')){say('الملف المختار ليس ملفًا صوتيًا معروفًا.');return}
   if(objectUrl)URL.revokeObjectURL(objectUrl);
   objectUrl=URL.createObjectURL(selected);
   source=objectUrl;
  }else{
   const raw=url.value.trim();
   let parsed;
   try{parsed=new URL(raw)}catch(_){say('الرابط غير صالح.');return}
   if(parsed.protocol!=='https:'){say('لأمان الاتصال، استخدم رابط HTTPS مباشرًا.');return}
   source=parsed.href;
  }
  player.pause();player.src=source;player.load();
  say('تم تجهيز مصدر الصوت. اضغط تشغيل في مشغّل التلاوة. إذا لم يعمل الرابط، فقد يمنع مصدره التشغيل المباشر.');
  player.onerror=()=>say('تعذر تشغيل الملف. تحقق من الرابط أو جرّب ملفًا صوتيًا محليًا.');
  player.onloadedmetadata=()=>say('التلاوة جاهزة للاستماع. مدة التسجيل: '+Math.floor(player.duration/60)+' دقيقة تقريبًا.');
 });
 window.addEventListener('pagehide',()=>{if(objectUrl)URL.revokeObjectURL(objectUrl)});
 updateButton();
})();