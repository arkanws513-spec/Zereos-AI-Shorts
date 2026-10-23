/* Shared browser-local Arabic TTS loader.
 * Keep one pinned runtime entry and one engine instance per page.
 * The model is downloaded from the upstream model host on first use and cached by the browser.
 */
const RUNTIME_URL = './vendor/nabra-tts.bundle.js?v=nabra-16b5281';
let runtimePromise = null;
let enginePromise = null;

export async function loadNabraTTS(options = {}) {
  if (!runtimePromise) {
    runtimePromise = import(RUNTIME_URL).then(mod => {
      if (!mod?.NabraTTS || typeof mod.NabraTTS.load !== 'function') {
        throw new Error('لم يتم العثور على محرك Nabra TTS داخل الحزمة المحلية.');
      }
      return mod.NabraTTS;
    }).catch(error => {
      runtimePromise = null;
      throw new Error('تعذر تحميل ملفات محرك الصوت المحلي: ' + (error?.message || String(error)));
    });
  }

  if (!enginePromise) {
    enginePromise = (async () => {
      const NabraTTS = await runtimePromise;
      return NabraTTS.load({
        dtype: 'fp16',
        device: 'auto',
        cache: true,
        wasmPaths: new URL('./vendor/ort/', import.meta.url).href,
        ...options
      });
    })().catch(error => {
      enginePromise = null;
      throw error;
    });
  }
  return enginePromise;
}
