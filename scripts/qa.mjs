import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const fail = (message) => { console.error('✗ ' + message); process.exitCode = 1; };
const pass = (message) => console.log('✓ ' + message);

function readRequired(file) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) {
    fail('Missing required file: ' + file);
    return '';
  }
  return fs.readFileSync(full, 'utf8');
}

const html = readRequired('index.html');
const appScript = readRequired('app.js');
const appCss = readRequired('app.css');
const source = html + '\n' + appScript + '\n' + appCss;
const storage = readRequired('storage.js');
const ttsEngine = readRequired('tts-engine.js');
const realAvatar = readRequired('real-avatar-studio.js');
const buildWorkflow = readRequired('.github/workflows/build-tts.yml');
const manifest = readRequired('manifest.webmanifest');
const serviceWorker = readRequired('service-worker.js');

if (html) {
  if (!/<html\b[^>]*lang=["']ar["']/i.test(html)) fail('index.html should declare Arabic language.');
  else pass('Arabic document language is declared.');

  if (!/<meta\s+name=["']viewport["']/i.test(html)) fail('Mobile viewport metadata is missing.');
  else pass('Mobile viewport metadata is present.');

  if (!/<script\b[^>]*src=["']\.\/storage\.js["']/i.test(html)) fail('index.html does not load ./storage.js.');
  else pass('Storage adapter is linked from the app shell.');
  if (!/<script\b[^>]*src=["']\.\/app\.js["']/i.test(html)) fail('index.html does not load ./app.js.');
  if (!/<link\b[^>]*href=["']\.\/app\.css["']/i.test(html)) fail('index.html does not load ./app.css.');
  else if (!process.exitCode) pass('Main app logic and styles are separated into version-controlled files.');

  const visibleMarkup = html.replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '');
  const ids = [...visibleMarkup.matchAll(/\bid=["']([^"']+)["']/gi)].map((match) => match[1]);
  const seen = new Set();
  const duplicates = new Set();
  for (const id of ids) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  if (duplicates.size) fail('Duplicate static HTML id(s): ' + [...duplicates].join(', '));
  else pass('No duplicate IDs in static HTML markup.');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zereos-qa-'));
  let inlineCount = 0;
  try {
    const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
    let match;
    while ((match = scriptPattern.exec(html))) {
      const attrs = match[1] || '';
      const source = match[2] || '';
      if (/\bsrc\s*=/.test(attrs) || !source.trim()) continue;
      const isModule = /\btype\s*=\s*["']module["']/i.test(attrs);
      const file = path.join(tempDir, `inline-${inlineCount++}.${isModule ? 'mjs' : 'js'}`);
      fs.writeFileSync(file, source, 'utf8');
      const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
      if (result.status !== 0) {
        fail(`Inline ${isModule ? 'module' : 'script'} syntax check failed for script #${inlineCount}:\n${result.stderr || result.stdout}`);
      }
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  if (inlineCount && !process.exitCode) pass(`JavaScript syntax validated for ${inlineCount} inline script(s).`);
}

if (storage) {
  for (const token of ['indexedDB.open', 'listProjects', 'saveProject', 'saveMedia', 'getMedia', 'estimate']) {
    if (!storage.includes(token)) fail('Storage adapter is missing expected capability: ' + token);
  }
  if (!process.exitCode) pass('Local project/media storage API contract checks passed.');
}

if (buildWorkflow) {
  for (const token of ['Oddadmix/nabra-tts', 'vendor/nabra-tts.bundle.js', 'vendor/ort']) {
    if (!buildWorkflow.includes(token)) fail('Local Arabic TTS workflow is missing expected build step: ' + token);
  }
  if (!process.exitCode) pass('Local Arabic TTS build workflow contract checks passed.');
}

if (ttsEngine && realAvatar && html) {
  if (!html.includes("import('./tts-engine.js?v=1')") || !realAvatar.includes('import("./tts-engine.js?v=1")')) {
    fail('The main editor and real-avatar studio must use the shared local TTS loader.');
  }
  if (html.includes("import('./vendor/nabra-tts.bundle.js") || realAvatar.includes('vendor/nabra-tts.bundle.js')) {
    fail('Duplicate direct TTS runtime loading found outside tts-engine.js.');
  }
  for (const token of ["dtype: 'fp16'", "wasmPaths: new URL('./vendor/ort/'", 'enginePromise']) {
    if (!ttsEngine.includes(token)) fail('Shared TTS loader is missing expected runtime configuration: ' + token);
  }
  if (!html.includes('href="#mainContent"') || !html.includes('id="mainContent"') || !html.includes('nav-section-label')) {
    fail('The main workspace must include a skip link and grouped navigation.');
  }
  if (html.includes('id="saveFromPageBtn"') || html.includes('id="saveProjectBtn"') || !html.includes("id='workspaceQuickSave'")) {
    fail('Project saving should use one canonical visible save action.');
  }
  if (!process.exitCode) pass('Shared TTS runtime, grouped navigation, keyboard skip link and single-save UX checks passed.');
}

if (manifest) {
  try {
    const data = JSON.parse(manifest);
    if (data.name !== 'ZEREOS AI Shorts' || data.display !== 'standalone' || data.dir !== 'rtl') {
      fail('Web app manifest is missing the expected app name, standalone display or RTL direction.');
    } else if (!process.exitCode) pass('Installable web app manifest is valid.');
  } catch (error) {
    fail('Web app manifest is not valid JSON: ' + error.message);
  }
}

if (serviceWorker) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, 'service-worker.js')], { encoding: 'utf8' });
  if (result.status !== 0) fail('Service worker JavaScript syntax check failed: ' + (result.stderr || result.stdout));
  else if (!process.exitCode) pass('Offline app-shell service worker syntax is valid.');
  if (!fs.existsSync(path.join(root, 'assets/zereos-icon.svg'))) fail('PWA icon is missing.');
  if (!html.includes('rel="manifest"') || !html.includes("serviceWorker.register('./service-worker.js'")) {
    fail('index.html must link the app manifest and register the service worker.');
  }
}

if (html) {
  const requiredIds = [
    'appCover', 'startAppBtn', 'videoCanvas', 'playBtn', 'resetBtn',
    'exportBtn', 'narrationFile', 'neuralTtsStatus', 'generateNeuralTtsBtn',
    'fillTtsFromScenesBtn', 'voiceLibraryList', 'mediaList', 'projectsPanel',
    'exportSrtBtn', 'exportWordSrtBtn', 'exportWordVttBtn',
    'liveVoiceRecorder', 'liveRecordingPrompt', 'recordVoiceBtn', 'stopVoiceRecordingBtn',
    'useVoiceRecordingBtn', 'liveVoicePreview', 'liveVoiceStatus',
    'audioTimelineEditor', 'narrationWaveform', 'narrationSeek', 'narrationTrimStart',
    'narrationTrimEnd', 'playNarrationSelectionBtn', 'resetNarrationTrimBtn',
    'musicFile', 'musicFadeIn', 'musicFadeOut', 'musicFileStatus',
    'subtitleTimingFile', 'subtitleTimingStatus', 'useTimedSubtitles', 'clearTimedSubtitlesBtn',
    'avatarPage', 'avatarEnabled', 'avatarImageFile', 'avatarScale', 'avatarPositionY',
    'avatarMouthX', 'avatarMouthY', 'avatarMouthIntensity', 'avatarApplyBtn', 'avatarResetBtn'
  ];
  for (const id of requiredIds) {
    if (!source.includes('id="' + id + '"') && !source.includes("id='" + id + "'")) {
      fail('Essential UI element is missing: #' + id);
    }
  }
  if (!process.exitCode) pass('Essential editor, voice, media and export controls are present.');
  for (const token of ['navigator.mediaDevices?.getUserMedia', 'new MediaRecorder(microphoneStream', 'ac.decodeAudioData(await blob.arrayBuffer())', 'voiceCategory:\'human\'', 'narrationBuffer=recordedVoiceBuffer', 'const activeProjectId=await window.ZereosStorage.local.activeProjectId()']) {
    if (!source.includes(token)) fail('Direct microphone recording workflow is incomplete: missing ' + token);
  }
  if (!process.exitCode) pass('Direct microphone recording, decoding and video narration handoff are covered.');

  if (!source.includes('function wordTimings(') || !source.includes('function exportWordSubtitles(') || !source.includes('lineTimingWeight(')) fail('Estimated word timing and word-level subtitle export are missing.');
  for (const feature of [
    'function drawNarrationWaveform()',
    'function updateNarrationEditor()',
    'function connectNarrationEditor()',
    'effectiveNarrationDuration()',
    'narrationSource.start(0,trimStart,effectiveNarrationDuration())',
    'musicBufferSource=ac.createBufferSource()',
    'musicGain.gain.linearRampToValueAtTime(0,ac.currentTime+duration/1000)',
    'function parseTimedSubtitleText(',
    'function connectTimedSubtitles()',
    'activeTimedCue=timedSubtitlesEnabled?timedSubtitleCues.find(',
    'timedSubtitleCues.map(cue=>({line:cue.text'
]) {
    if (!source.includes(feature)) fail('Audio editing/export workflow is incomplete: missing ' + feature);
  }
  if (!process.exitCode) pass('Waveform, trim range, preview seek, local music file and fade controls are wired.');
  const parserStart = appScript.indexOf('function parseTimedSubtitleText(');
  const parserEnd = appScript.indexOf('function connectTimedSubtitles()', parserStart);
  if (parserStart < 0 || parserEnd < 0) {
    fail('Timestamped subtitle parser could not be isolated for behavior tests.');
  } else {
    try {
      const parserSource = appScript.slice(parserStart, parserEnd);
      const parseTimedSubtitleText = new Function(parserSource + '; return parseTimedSubtitleText;')();
      const srtCues = parseTimedSubtitleText('1\n00:00:01,000 --> 00:00:02,500\nمرحبا بالعالم');
      const vttCues = parseTimedSubtitleText('WEBVTT\n\n00:00:03.000 --> 00:00:04.200\nSecond caption');
      if (srtCues.length !== 1 || srtCues[0].start !== 1000 || srtCues[0].end !== 2500 || srtCues[0].text !== 'مرحبا بالعالم') {
        fail('SRT timestamp parsing regression: unexpected parsed cue.');
      } else if (vttCues.length !== 1 || vttCues[0].start !== 3000 || vttCues[0].end !== 4200 || vttCues[0].text !== 'Second caption') {
        fail('VTT timestamp parsing regression: unexpected parsed cue.');
      } else if (!process.exitCode) pass('SRT and VTT timestamp parsing behavior tests passed.');
    } catch (error) {
      fail('Timestamped subtitle parser behavior test crashed: ' + error.message);
    }
  }

  if (!process.exitCode) pass('Estimated word timing and SRT/VTT word-level export are present.');
  for (const feature of ['function drawAvatar(elapsed)', 'function avatarAmplitude(elapsed)', 'function connectAvatarStudio()', "data-avatar-preset=\"animeWoman\"", "data-avatar-preset=\"hologram\""]) {
    if (!source.includes(feature)) fail('Talking-avatar studio is incomplete: missing ' + feature);
  }
  if (!process.exitCode) pass('Six-profile talking-avatar controls and renderer are present.');

  const drawTextStart = appScript.indexOf('function drawTextBlock(');
  const drawTextEnd = appScript.indexOf('let importedSceneImage=', drawTextStart);
  const drawTextSource = drawTextStart >= 0 && drawTextEnd > drawTextStart ? appScript.slice(drawTextStart, drawTextEnd) : '';
  const templateRoute = drawTextSource.indexOf("if(['royal','nebula','cyber','ocean','ivory'].includes(activeTemplate))");
  const animationMutation = drawTextSource.indexOf("if(anim==='wordByWord'");
  if (!source.includes('function selectTemplateCaptionPage(') || !source.includes('selectTemplateCaptionPage(pages,progress,anim)')) {
    fail('Template-specific caption pagination and page-local text animation are missing.');
  } else if (templateRoute < 0 || animationMutation < 0 || templateRoute > animationMutation) {
    fail('Template captions must paginate the complete scene text before applying page-local text animation.');
  } else if (!process.exitCode) pass('Template pagination preserves full text and animates each caption page independently.');
  if (source.includes('function fitTemplateLines(')) fail('Unused fitTemplateLines helper should be removed to avoid duplicate layout paths.');

  if (/speechSynthesis|SpeechSynthesisUtterance|deviceVoicePanel|readSceneBtn|readAllBtn|stopVoiceBtn/.test(source)) {
    fail('Obsolete device-voice playback UI or handlers must not return; use the generated/local audio library instead.');
  } else if (!process.exitCode) pass('Obsolete device-voice playback and its unused handlers are removed.');

  const exportGuidance = html.includes('صيغة MP4') && html.includes('يستخدم WebM');
  if (!exportGuidance) fail('Export guidance should explain that MP4 is attempted when supported and WebM is the fallback.');
  const mp4Candidate = source.indexOf("'video/mp4;codecs=avc1.42E01E,mp4a.40.2'");
  const webmFallback = source.indexOf("'video/webm;codecs=vp9,opus'");
  if (mp4Candidate < 0 || webmFallback < 0 || mp4Candidate > webmFallback) {
    fail('Exporter should try supported MP4 candidates before WebM fallback candidates.');
  }
  if (!source.includes("const isMp4=mime.toLowerCase().includes('mp4'),extension=isMp4?'mp4':'webm'")) {
    fail('Export file extension should match the recorder MIME type.');
  }

  for (const feature of [
    'id="templatesPage"',
    'id="sceneStudioPage"',
    'id="textAnimation"',
    'id="graphicFrame"',
    'id="glowIntensity"',
    'id="sceneTransition"',
    'id="exportProfile"',
    'id="sceneTimelineStrip"',
    'id="mediaSearch"',
    'id="mediaTypeFilter"',
    'id="mediaSort"',
    'id="cleanMediaBtn"',
    'async function refreshMedia()',
    'const references=new Map()',
    'del.disabled=linked.length>0',
    'التنظيف الجماعي يحذف فقط الملفات التي لا يشير إليها أي مشروع',
    'function exportThumbnail()',
    'sceneImageMediaIds:{...sceneImageMediaIds}',
    'textAnimation:$(',
    'graphicFrame:$(',
    "sceneTransition:$(",
    "exportProfile:$(",
    'function exportProfileSettings()',
    'function updateTimelineUI(',
    "playSingleScene(b.dataset.timelineScene)",
    "function findQuietBoundary(",
    "function drawTemplateComposition(",
    '.template-card[data-template="nebula"] .template-swatch:after',
    '.template-card[data-template="cyber"] .template-swatch:after',
    '.template-card[data-template="ember"] .template-swatch:after',
    '.template-card[data-template="ocean"] .template-swatch:after',
    '.template-card[data-template="crystal"] .template-swatch:after',
    "activeTemplate==='nebula'",
    "activeTemplate==='cyber'",
    "activeTemplate==='ocean'",
    "activeTemplate==='aurora'",
    "drawTemplateComposition(safeElapsed,scene,sceneElapsed,sceneLen)",
    "cachedTimelineKey",
    "const snapped=findQuietBoundary(cursor,total,channel,narrationBuffer.sampleRate,trimStart*1000)",
    "يحاول محاذاة حدودها مع فترات الهدوء في الصوت محليًا",
    "canvas.captureStream(profileSettings.fps)",
    "transition==='flash'",
    'Object.values(record.sceneImageMediaIds||{})',
    "window.addEventListener('zereos-template-change',scheduleAutoSave)"
  ]) {
    if (!source.includes(feature)) fail('Cinematic studio regression: missing expected feature or persistence hook: ' + feature);
  }
  if (!serviceWorker.includes("const CACHE_NAME = 'zereos-shell-v3'") ||
      !serviceWorker.includes("new URL('app.js', BASE_URL).href") ||
      !serviceWorker.includes("new URL('app.css', BASE_URL).href") ||
      !serviceWorker.includes("fetch(request, { cache: 'no-cache' })")) {
    fail('Service worker must refresh app-shell assets from the network before using cached copies.');
  }
  if (!process.exitCode) pass('Cinematic controls, scene-media persistence and app-shell update behavior are covered.');

  for (const asset of [
    'vendor/nabra-tts.bundle.js',
    'vendor/ort/ort-wasm-simd-threaded.jsep.mjs',
    'vendor/ort/ort-wasm-simd-threaded.jsep.wasm'
  ]) {
    const assetPath = path.join(root, asset);
    if (!fs.existsSync(assetPath)) fail('Required local TTS asset is missing: ' + asset);
    else if (fs.statSync(assetPath).size === 0) fail('Required local TTS asset is empty: ' + asset);
  }
  if (!process.exitCode) pass('Local TTS runtime assets are present and export-format messaging is consistent.');
}

if (process.exitCode) {
  console.error('ZEREOS QA failed.');
} else {
  console.log('ZEREOS QA passed.');
}
