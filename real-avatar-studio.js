const $ = id => document.getElementById(id);
const source = $("source"), audio = $("audio"), generate = $("generate");
let sourceUrl = "", outputUrl = "", audioPreviewUrl = "", selectedAudio = null, neuralEngine = null, neuralEnginePromise = null;
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
function readWorkerUrl() { try { return localStorage.getItem("zereos_avatar_worker_url") || ""; } catch { return ""; } }
function saveWorkerUrl(url) { try { if (url) localStorage.setItem("zereos_avatar_worker_url", url); else localStorage.removeItem("zereos_avatar_worker_url"); } catch {} }
const store = { url: readWorkerUrl(), token: "" };
$("workerUrl").value = store.url;
$("workerToken").value = store.token;
function message(el, text, kind="") { el.textContent = text; el.className = "status" + (kind ? " " + kind : ""); }
function cleanUrl(value) {
  try {
    const url = new URL((value || "").trim());
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) return "";
    if (url.protocol !== "https:" && !loopback) return "";
    return url.origin + url.pathname.replace(/\/+$/, "");
  } catch { return ""; }
}
function setAudioPreview(blob) {
  if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
  audioPreviewUrl = URL.createObjectURL(blob);
  const player = $("audioPreview");
  player.src = audioPreviewUrl;
  player.style.display = "block";
}
function updateReady() { generate.disabled = !(source.files?.[0] && selectedAudio && cleanUrl($("workerUrl").value) && store.token); }
function previewSource(file) {
  if (sourceUrl) URL.revokeObjectURL(sourceUrl);
  sourceUrl = URL.createObjectURL(file);
  const box = $("preview"); box.replaceChildren();
  const el = document.createElement(file.type.startsWith("video/") ? "video" : "img");
  el.src = sourceUrl;
  if (el.tagName === "VIDEO") { el.controls = true; el.playsInline = true; }
  el.alt = "معاينة المصدر";
  box.appendChild(el);
}
source.addEventListener("change", () => {
  const file = source.files?.[0];
  if (file && file.size > MAX_UPLOAD_BYTES) {
    source.value = "";
    $("sourceName").textContent = "";
    message($("status"), "حجم الصورة أو الفيديو يتجاوز الحد 200 MB.", "bad");
    updateReady();
    return;
  }
  $("sourceName").textContent = file ? file.name + " • " + (file.size / 1048576).toFixed(1) + " MB" : "";
  if (file) previewSource(file); updateReady();
});
audio.addEventListener("change", () => {
  const file = audio.files?.[0];
  if (file && file.size > MAX_UPLOAD_BYTES) {
    audio.value = "";
    selectedAudio = null;
    $("audioName").textContent = "";
    message($("status"), "حجم ملف الصوت يتجاوز الحد 200 MB.", "bad");
    updateReady();
    return;
  }
  selectedAudio = file || null;
  $("audioName").textContent = file ? file.name + " • " + (file.size / 1048576).toFixed(1) + " MB" : "";
  if (file) setAudioPreview(file);
  updateReady();
});
async function getLocalTts() {
  if (neuralEngine) return neuralEngine;
  if (!neuralEnginePromise) {
    neuralEnginePromise = (async () => {
      $("ttsStatus").textContent = "جارٍ تحميل محرك الصوت العربي المحلي…";
      const { loadNabraTTS } = await import("./tts-engine.js?v=1");
      neuralEngine = await loadNabraTTS({
        onProgress: p => { $("ttsStatus").textContent = "جارٍ تجهيز الصوت: " + (p.file || "المحرك"); }
      });
      return neuralEngine;
    })().catch(error => { neuralEnginePromise = null; throw error; });
  }
  return neuralEnginePromise;
}
$("makeAudio").addEventListener("click", async () => {
  const text = $("ttsText").value.trim();
  if (!text) { $("ttsStatus").textContent = "اكتب النص أولًا."; return; }
  if (text.length > 1800) { $("ttsStatus").textContent = "قسّم النص إلى مقاطع أقصر من 1800 حرفًا."; return; }
  const button = $("makeAudio"); button.disabled = true;
  try {
    const engine = await getLocalTts();
    const styles = {documentary:{speed:.96}, mystery:{speed:.82}, egyptian:{speed:1.0}, calm:{speed:.84}, news:{speed:1.08}};
    const settings = styles[$("ttsStyle").value] || styles.documentary;
    $("ttsStatus").textContent = "يجري توليد الصوت من النص…";
    const result = await engine.generate(text, {speed:settings.speed});
    const blob = engine.toWav(result.audio);
    if (!blob || !blob.size) throw new Error("لم ينتج النموذج ملف صوت صالحًا.");
    selectedAudio = new File([blob], "zereos-narration.wav", {type:"audio/wav"});
    $("audioName").textContent = "صوت مولّد محليًا • " + (blob.size / 1048576).toFixed(2) + " MB";
    setAudioPreview(blob);
    $("ttsStatus").textContent = "تم توليد الصوت محليًا. استمع إليه ثم أنشئ فيديو الأفاتار.";
    updateReady();
  } catch (error) {
    $("ttsStatus").textContent = "فشل توليد الصوت: " + (error.message || String(error));
  } finally { button.disabled = false; }
});
$("workerUrl").addEventListener("change", () => { store.url = cleanUrl($("workerUrl").value); $("workerUrl").value = store.url; saveWorkerUrl(store.url); updateReady(); });
$("workerToken").addEventListener("input", () => { store.token = $("workerToken").value.trim(); updateReady(); });
async function checkWorker() {
  const url = cleanUrl($("workerUrl").value);
  if (!url) { message($("engineInfo"), "أدخل عنوان عامل GPU أولًا.", "bad"); return false; }
  message($("engineInfo"), "جارٍ فحص العامل…");
  try {
    const headers = store.token ? {"X-Worker-Token": store.token} : {};
    const response = await fetch(url + "/api/health", {headers, cache:"no-store"});
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "HTTP " + response.status);
    if (!data.ready || !data.gpu_available) {
      message($("engineInfo"), "العامل يردّ لكنه غير جاهز للتوليد. " + (data.detail || "") + (data.gpu_available ? "" : " لا توجد GPU متاحة."), "bad");
      return false;
    }
    message($("engineInfo"), "المحرك جاهز: " + (data.engine || "MuseTalk") + (data.gpu_name ? " • " + data.gpu_name : ""), "good");
    return true;
  } catch (error) {
    message($("engineInfo"), "تعذر الاتصال: " + error.message + " — تأكد من تشغيل العامل والسماح باتصال الواجهة عبر CORS.", "bad");
    return false;
  }
}
$("check").addEventListener("click", checkWorker);
generate.addEventListener("click", async () => {
  const url = cleanUrl($("workerUrl").value);
  if (!source.files?.[0] || !selectedAudio || !url) return;
  const ok = await checkWorker(); if (!ok) return;
  generate.disabled = true; generate.textContent = "جارٍ توليد الفيديو…";
  message($("status"), "يعمل المحرك على الفيديو. لا تغلق الصفحة؛ قد تستغرق المعالجة عدة دقائق.");
  $("output").replaceChildren();
  const form = new FormData();
  form.append("source", source.files[0]); form.append("audio", selectedAudio, selectedAudio.name || "narration.wav"); form.append("fps", $("fps").value);
  try {
    const headers = store.token ? {"X-Worker-Token": store.token} : {};
    const response = await fetch(url + "/api/avatar/generate", {method:"POST", headers, body:form});
    if (!response.ok) {
      let detail = "HTTP " + response.status;
      try { const data = await response.json(); detail = data.detail || data.error || detail; } catch {}
      throw new Error(detail);
    }
    const blob = await response.blob();
    if (!blob.size || (blob.type && !blob.type.includes("video"))) throw new Error("المحرك لم يرجع ملف فيديو صالحًا.");
    if (outputUrl) URL.revokeObjectURL(outputUrl);
    outputUrl = URL.createObjectURL(blob);
    const video = document.createElement("video"); video.controls = true; video.playsInline = true; video.src = outputUrl;
    const link = document.createElement("a"); link.className = "download"; link.href = outputUrl; link.download = "zereos-avatar.mp4"; link.textContent = "تنزيل فيديو MP4";
    $("output").append(video, link);
    message($("status"), "نجح المحرك وأعاد ملف MP4 بحجم " + (blob.size / 1048576).toFixed(1) + " MB.", "good");
  } catch (error) {
    message($("status"), "فشل التوليد ولم يتم إنشاء فيديو: " + error.message, "bad");
  } finally { generate.textContent = "إنشاء فيديو MP4 بالمحرك الحقيقي"; updateReady(); }
});
window.addEventListener("pagehide", () => {
  for (const url of [sourceUrl, outputUrl, audioPreviewUrl]) if (url) URL.revokeObjectURL(url);
});
updateReady();
if (store.url) checkWorker();
