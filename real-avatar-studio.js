const $ = id => document.getElementById(id);
const source = $("source"), audio = $("audio"), generate = $("generate");
let sourceUrl = "", outputUrl = "", selectedAudio = null, neuralEngine = null, neuralEnginePromise = null;
const store = { url: localStorage.getItem("zereos_avatar_worker_url") || "", token: localStorage.getItem("zereos_avatar_worker_token") || "" };
$("workerUrl").value = store.url;
$("workerToken").value = store.token;
function message(el, text, kind="") { el.textContent = text; el.className = "status" + (kind ? " " + kind : ""); }
function cleanUrl(url) { return (url || "").trim().replace(/\/+$/, ""); }
function updateReady() { generate.disabled = !(source.files?.[0] && selectedAudio && cleanUrl($("workerUrl").value)); }
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
  const file = source.files?.[0]; $("sourceName").textContent = file ? file.name + " • " + (file.size / 1048576).toFixed(1) + " MB" : "";
  if (file) previewSource(file); updateReady();
});
audio.addEventListener("change", () => {
  const file = audio.files?.[0]; $("audioName").textContent = file ? file.name + " • " + (file.size / 1048576).toFixed(1) + " MB" : "";
  updateReady();
});
$("workerUrl").addEventListener("change", () => { store.url = cleanUrl($("workerUrl").value); localStorage.setItem("zereos_avatar_worker_url", store.url); updateReady(); });
$("workerToken").addEventListener("change", () => { store.token = $("workerToken").value.trim(); localStorage.setItem("zereos_avatar_worker_token", store.token); });
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
updateReady();
if (store.url) checkWorker();
