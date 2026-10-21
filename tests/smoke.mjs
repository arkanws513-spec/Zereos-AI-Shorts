import fs from 'node:fs';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const html = fs.readFileSync('index.html', 'utf8');
const storage = fs.readFileSync('storage.js', 'utf8');

const requiredIds = [
  'appCover', 'startAppBtn', 'videoCanvas', 'playBtn', 'resetBtn',
  'exportBtn', 'narrationFile', 'neuralTtsStatus', 'generateNeuralTtsBtn',
  'fillTtsFromScenesBtn', 'voiceLibraryList', 'mediaList', 'projectsPanel',
  'exportSrtBtn'
];
const ids = new Set([...html.matchAll(/\bid=["']([^"']+)["']/g)].map(m => m[1]));
for (const id of requiredIds) assert(ids.has(id), `Missing required UI element: #${id}`);

const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
let checkedInlineScripts = 0;
for (const [, attrs, source] of scripts) {
  if (!source.trim()) continue;
  if (/\bsrc\s*=/.test(attrs)) continue;
  if (/\btype\s*=\s*["']module["']/.test(attrs)) {
    const result = spawnSync(process.execPath, ['--check', '--input-type=module'], {
      input: source, encoding: 'utf8'
    });
    assert.equal(result.status, 0, `Inline module syntax error:\n${result.stderr}`);
  } else {
    new vm.Script(source, { filename: 'index.html:inline-script' });
  }
  checkedInlineScripts++;
}
assert(checkedInlineScripts >= 2, 'Expected the app script and local TTS module to be checked');

new vm.Script(storage, { filename: 'storage.js' });
assert(html.includes('./storage.js'), 'index.html must load the local storage adapter');
assert(html.includes('./vendor/nabra-tts.bundle.js'), 'Local TTS bundle import is missing');
assert(html.includes('./vendor/ort/'), 'Local ONNX runtime path is missing');
assert(html.includes('WebM'), 'Export format guidance must mention WebM');
assert(!html.includes('يختار التطبيق MP4/AAC'), 'Do not promise MP4/AAC while the exporter only offers WebM');

for (const path of [
  'vendor/nabra-tts.bundle.js',
  'vendor/ort/ort-wasm-simd-threaded.jsep.mjs',
  'vendor/ort/ort-wasm-simd-threaded.jsep.wasm'
]) assert(fs.existsSync(path), `Required local TTS asset is missing: ${path}`);

assert(storage.includes('indexedDB.open(DB_NAME,DB_VERSION)'), 'IndexedDB initialization is missing');
assert(storage.includes('saveProject'), 'Project saving API is missing');
assert(storage.includes('saveMedia'), 'Media saving API is missing');

console.log(`ZEREOS static checks passed: ${checkedInlineScripts} inline scripts, ${requiredIds.length} UI selectors, storage and local TTS assets.`);
