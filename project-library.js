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

