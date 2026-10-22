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
const storage = readRequired('storage.js');
const workflow = readRequired('.github/workflows/build-tts.yml');
const manifest = readRequired('manifest.webmanifest');
const serviceWorker = readRequired('service-worker.js');

if (html) {
  if (!/<html\b[^>]*lang=["']ar["']/i.test(html)) fail('index.html should declare Arabic language.');
  else pass('Arabic document language is declared.');

  if (!/<meta\s+name=["']viewport["']/i.test(html)) fail('Mobile viewport metadata is missing.');
  else pass('Mobile viewport metadata is present.');

  if (!/<script\b[^>]*src=["']\.\/storage\.js["']/i.test(html)) fail('index.html does not load ./storage.js.');
  else pass('Storage adapter is linked from the app shell.');

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

if (workflow) {
  for (const token of ['Oddadmix/nabra-tts', 'vendor/nabra-tts.bundle.js', 'vendor/ort']) {
    if (!workflow.includes(token)) fail('Local Arabic TTS workflow is missing expected build step: ' + token);
  }
  if (!process.exitCode) pass('Local Arabic TTS build workflow contract checks passed.');
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
    'exportSrtBtn', 'exportWordSrtBtn', 'exportWordVttBtn'
  ];
  for (const id of requiredIds) {
    if (!html.includes('id="' + id + '"') && !html.includes("id='" + id + "'")) {
      fail('Essential UI element is missing: #' + id);
    }
  }
  if (!process.exitCode) pass('Essential editor, voice, media and export controls are present.');

  if (!html.includes('function wordTimings(') || !html.includes('function exportWordSubtitles(') || !html.includes('lineTimingWeight(')) fail('Estimated word timing and word-level subtitle export are missing.');
  if (!process.exitCode) pass('Estimated word timing and SRT/VTT word-level export are present.');

  const exportGuidance = html.includes('صيغة MP4') && html.includes('يستخدم WebM');
  if (!exportGuidance) fail('Export guidance should explain that MP4 is attempted when supported and WebM is the fallback.');
  const mp4Candidate = html.indexOf("'video/mp4;codecs=avc1.42E01E,mp4a.40.2'");
  const webmFallback = html.indexOf("'video/webm;codecs=vp9,opus'");
  if (mp4Candidate < 0 || webmFallback < 0 || mp4Candidate > webmFallback) {
    fail('Exporter should try supported MP4 candidates before WebM fallback candidates.');
  }
  if (!html.includes("const isMp4=mime.toLowerCase().includes('mp4'),extension=isMp4?'mp4':'webm'")) {
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
    'التنظيف الجماعي يحذف فقط الملفات التي لا يشير إليها أي مشروع'
    'function exportThumbnail()',
    'sceneImageMediaIds:{...sceneImageMediaIds}',
    'textAnimation:$(',
    'graphicFrame:$(',
    "sceneTransition:$(",
    "exportProfile:$(",
    'function exportProfileSettings()',
    'function updateTimelineUI(',
    "playSingleScene(b.dataset.timelineScene)",
    "canvas.captureStream(profileSettings.fps)",
    "transition==='flash'",
    'Object.values(record.sceneImageMediaIds||{})',
    "window.addEventListener('zereos-template-change',scheduleAutoSave)"
  ]) {
    if (!html.includes(feature)) fail('Cinematic studio regression: missing expected feature or persistence hook: ' + feature);
  }
  if (!serviceWorker.includes("const CACHE_NAME = 'zereos-shell-v2'") ||
      !serviceWorker.includes("fetch(request, { cache: 'no-cache' })")) {
    fail('Service worker must refresh app-shell assets from the network before using cached copies.');
  }
  if (!process.exitCode) pass('Cinematic controls, scene-media persistence and app-shell update behavior are covered.');

  for (const asset of [
    'vendor/nabra-tts.bundle.js',
    'vendor/ort/ort-wasm-simd-threaded.jsep.mjs',
    'vendor/ort/ort-wasm-simd-threaded.jsep.wasm'
  ]) {
    if (!fs.existsSync(path.join(root, asset))) fail('Required local TTS asset is missing: ' + asset);
  }
  if (!process.exitCode) pass('Local TTS runtime assets are present and export-format messaging is consistent.');
}

if (process.exitCode) {
  console.error('ZEREOS QA failed.');
} else {
  console.log('ZEREOS QA passed.');
}
