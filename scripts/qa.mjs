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

if (html) {
  const requiredIds = [
    'appCover', 'startAppBtn', 'videoCanvas', 'playBtn', 'resetBtn',
    'exportBtn', 'narrationFile', 'neuralTtsStatus', 'generateNeuralTtsBtn',
    'fillTtsFromScenesBtn', 'voiceLibraryList', 'mediaList', 'projectsPanel',
    'exportSrtBtn'
  ];
  for (const id of requiredIds) {
    if (!new RegExp('\\\\bid=["\\\\\\\\']' + id + '["\\\\\\\\']').test(html)) {
      fail('Essential UI element is missing: #' + id);
    }
  }
  if (!process.exitCode) pass('Essential editor, voice, media and export controls are present.');

  const exportGuidance = html.includes('بصيغة WebM');
  if (!exportGuidance) fail('Export guidance should accurately state that the current exporter uses WebM.');
  if (html.includes('يختار التطبيق MP4/AAC')) fail('The UI must not promise MP4/AAC when the current exporter does not provide it.');

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
