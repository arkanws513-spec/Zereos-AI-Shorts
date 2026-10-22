# ZEREOS AI Shorts

**استوديو عربي لصناعة فيديوهات قصيرة بطابع سينمائي** — واجهة تعمل من المتصفح، مع معاينة رأسية 9:16، أدوات نصوص ومشاهد، مكتبة وسائط وأصوات محلية، وتوليد صوت عربي محلي عند توفر ملفات المحرك.

Live app: https://arkanws513-spec.github.io/Zereos-AI-Shorts/

## What is included

- Arabic RTL interface designed for desktop and mobile, with an installable web-app manifest and lightweight offline shell.
- Vertical 9:16 scene preview and video export tools.
- Project save/restore and media library using browser IndexedDB.
- Project JSON export/import, with associated media included up to the app's built-in size limits.
- Per-scene images, selected cinematic templates, text animation, frame style, glow, and caption style are saved with the project and restored when reopened.
- Local Arabic TTS build pipeline using Nabra TTS and ONNX Runtime Web assets.
- Audio import and local voice-library workflow.
- Captions/subtitle export and scene timing tools; subtitle timing is an estimate based on scene duration and narration length, not word-level alignment.
- Video export selects a browser-supported MP4 recording format first when available, then falls back to WebM. The actual format depends on the browser/device; verify the downloaded file before publishing.

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


## جودة التصدير والانتقالات

- ملفات التصدير تتيح ثلاثة ملفات إعداد: خفيف (24 إطارًا/ثانية ومعدل بيانات أقل)، قياسي، ومرتفع الجودة. يظل اختيار MP4 أو WebM تابعًا لدعم المتصفح الفعلي.
- انتقالات المشاهد تشمل التلاشي الداكن، الومضة الضوئية، والقطع المباشر، وتُحفظ مع إعدادات المشروع.
- توقيت الكلمات في الترجمة المتحركة ما زال تقديريًا اعتمادًا على طول الكلمات وعلامات الترقيم؛ لا يُقدَّم على أنه محاذاة صوتية دقيقة. المحاذاة الحقيقية تحتاج إلى محرك تعرف/محاذاة صوتية مناسب واختبار ملفات فعلية.
- مكتبة الوسائط المحلية الحالية تعرض الاستخدام التقريبي للتخزين وتدعم تنزيل الملفات أو حذفها يدويًا؛ الملفات محفوظة على الجهاز وليست نسخة سحابية.


## تنسيق النصوص داخل القوالب

- الذهب الملكي وأعماق المحيط يعرضان سطرين في كل لقطة نصية، بينما السديم والمخطوطة يعرضان حتى ثلاثة أسطر؛ ويكمل النص في صفحات متتابعة داخل المشهد.
- السايبربانك يعرض نصوص المشاهد الأربعة معًا على شاشة واحدة ويحاول ملاءمتها لحجم الشاشة.
- تأثيرا الكتابة التدريجية والظهور كلمة بكلمة يعملان على الصفحة الحالية بدل إعادة تقسيم النص أثناء ظهوره.
- تمت إزالة قارئ أصوات النظام القديم؛ إنشاء الصوت المحلي ومكتبة التسجيلات واستيراد التعليق الصوتي تظل المسارات المعتمدة.

## إدارة مكتبة الوسائط

- يمكن البحث باسم الملف أو نوعه، والتصفية حسب الصور أو الفيديو أو الصوت، والترتيب بالأحدث أو الأقدم أو الحجم أو الاسم.
- تعرض المكتبة إجمالي أحجام الملفات، وتوضح الملفات المرتبطة بمشاريع محفوظة.
- زر الحذف الفردي يتوقف للملفات المشار إليها من مشروع محفوظ، لتجنب إفساد مشروع عند حذف أصل يعتمد عليه.
- أداة التنظيف تعرض عدد الملفات وحجمها قبل الحذف، ولا تزيل إلا الملفات التي لا تشير إليها المشاريع المحفوظة أو حالة المشروع الحالي. قد تشمل هذه الملفات عناصر رفعتها للمكتبة لاستخدامها لاحقًا، لذلك تظهر رسالة تأكيد قبل التنظيف.
- كل هذا التخزين محلي داخل متصفح الجهاز؛ مسح بيانات الموقع أو حذف بيانات المتصفح قد يزيل الملفات. لا توجد مزامنة سحابية مفعلة حاليًا.


## تسجيل الصوت الشخصي مباشرة

- يمكن تسجيل التعليق من الميكروفون داخل المتصفح بعد منح إذن الوصول، مع إظهار نص المشاهد الأربعة أثناء القراءة.
- استمع إلى التسجيل قبل اعتماده، ثم يجهّز التطبيق الصوت للمعاينة والتصدير ويحفظ نسخة في مكتبة الأصوات المحلية عندما يكون التخزين متاحًا.
- يعتمد دعم التسجيل وترميز الصوت على المتصفح والجهاز؛ يتطلب الميكروفون عادةً HTTPS أو localhost. يجب تجربة التسجيل والتصدير فعليًا على الهاتف المستهدف قبل الاعتماد الإنتاجي.
