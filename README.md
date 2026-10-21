# ZEREOS AI Shorts

**استوديو عربي لصناعة فيديوهات قصيرة بطابع سينمائي** — واجهة تعمل من المتصفح، مع معاينة رأسية 9:16، أدوات نصوص ومشاهد، مكتبة وسائط وأصوات محلية، وتوليد صوت عربي محلي عند توفر ملفات المحرك.

Live app: https://arkanws513-spec.github.io/Zereos-AI-Shorts/

## What is included

- Arabic RTL interface designed for desktop and mobile, with an installable web-app manifest and lightweight offline shell.
- Vertical 9:16 scene preview and video export tools.
- Project save/restore and media library using browser IndexedDB.
- Project JSON export/import, with associated media included up to the app's built-in size limits.
- Local Arabic TTS build pipeline using Nabra TTS and ONNX Runtime Web assets.
- Audio import and local voice-library workflow.
- Captions/subtitle export and scene timing tools; subtitle timing is an estimate based on scene duration and narration length, not word-level alignment.
- Video export currently uses WebM through the browser's MediaRecorder support; MP4 export is not promised.

## Run locally

Because the app uses browser modules and local assets, serve the repository through a local HTTP server rather than opening `index.html` as a `file://` URL.

With Python installed:

```bash
python -m http.server 8080
```

Then open http://localhost:8080.

The local TTS engine is built by GitHub Actions. To rebuild it, open **Actions → Build local Arabic TTS assets → Run workflow**. The workflow commits generated runtime assets to `main` when they change.

## Quality checks

A dependency-free static QA workflow runs on pushes and pull requests to `main`. It checks essential app metadata and controls, static HTML IDs, inline JavaScript syntax, the storage adapter's expected API, the local TTS assets/build workflow, the PWA manifest, and service-worker syntax.

You can run the same checks locally with Node.js 22 or newer:

```bash
node scripts/qa.mjs
```

A passing static check is not a substitute for testing audio generation and video export in a real browser and on a phone.

## Important storage note

Projects and media are stored locally in the current browser profile on the current device. They do **not** automatically sync across devices. Export project backups regularly before clearing browser data or changing browsers.

The app does not require a paid inference API key for its built-in local TTS workflow. The lightweight app shell can be available offline after the first visit, but voice generation still needs its model/runtime assets; those large files are intentionally not precached to avoid consuming phone storage. The first local voice generation may need an internet connection and the model can use substantial memory on older phones.

## Development principles

- Preserve the existing ZEREOS visual identity and evolve it incrementally.
- Prefer local/browser capabilities and open-source dependencies where practical.
- Do not make paid model APIs a requirement for core editing or export.
- Verify generated audio, export duration, subtitles, and mobile behavior before calling a release production-ready.
