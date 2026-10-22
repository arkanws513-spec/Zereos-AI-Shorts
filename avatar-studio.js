/* ZEREOS AI Shorts — free, client-side 3D presenter layer.
 * Engine: @met4citizen/talkinghead (MIT). Default sample model: MPFB (CC0).
 * No hosted inference, account, API key, or paid runtime is used.
 */
import { TalkingHead } from 'https://esm.sh/@met4citizen/talkinghead@1.8.0?bundle';

const MODEL_URL = 'https://raw.githubusercontent.com/met4citizen/TalkingHead/main/avatars/mpfb.glb';
const profileModels = Object.create(null);
const profileBodies = { elderMan: 'M', modernMan: 'M', modernWoman: 'F', hologram: 'F', animeMan: 'M', animeWoman: 'F' };
let head = null;
let loading = null;
let activeModelUrl = '';
let activeProfile = '';
let host = null;
let failed = null;

function ensureHost() {
  if (host) return host;
  host = document.createElement('div');
  host.id = 'zereos-3d-avatar-runtime';
  Object.assign(host.style, {
    position: 'fixed', left: '-10000px', top: '0', width: '480px', height: '720px',
    overflow: 'hidden', opacity: '0', pointerEvents: 'none', zIndex: '-1'
  });
  document.body.appendChild(host);
  return host;
}

function status(message) {
  const node = document.getElementById('avatarImageStatus');
  if (node) node.textContent = message;
  const state = document.getElementById('avatarStatus');
  if (state) state.textContent = message;
}

function setTransparentRenderer(instance) {
  try {
    if (instance.scene) instance.scene.background = null;
    if (instance.renderer) {
      instance.renderer.setClearColor(0x000000, 0);
      instance.renderer.setClearAlpha(0);
      instance.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      instance.renderer.setSize(480, 720, false);
      instance.renderer.domElement.style.background = 'transparent';
    }
  } catch (error) {
    console.warn('Avatar transparency setup:', error);
  }
}

async function ensureHead(profileId) {
  const modelUrl = profileModels[profileId] || MODEL_URL;
  if (head && activeModelUrl === modelUrl && activeProfile === profileId) return head;
  if (loading) await loading;
  if (head && activeModelUrl === modelUrl && activeProfile === profileId) return head;

  loading = (async () => {
    const mount = ensureHost();
    status('جارٍ تحميل شخصية ثلاثية الأبعاد متحركة لأول مرة… قد يستغرق ذلك وقتًا حسب سرعة الإنترنت والجهاز.');
    if (!head) {
      head = new TalkingHead(mount, {
        cameraView: 'upper',
        lipsyncLang: 'en',
        avatarMood: 'neutral',
        cameraRotateEnable: false,
        cameraPanEnable: false,
        cameraZoomEnable: false,
        mixerGainSpeech: 0,
        showStats: false
      });
    }
    await head.showAvatar({
      url: modelUrl,
      body: profileBodies[profileId] || 'F',
      avatarMood: profileId === 'elderMan' ? 'neutral' : 'happy',
      lipsyncLang: 'en',
      baseline: { eyeBlinkLeft: 0.04, eyeBlinkRight: 0.04 }
    });
    activeModelUrl = modelUrl;
    activeProfile = profileId;
    setTransparentRenderer(head);
    failed = null;
    status('الشخصية ثلاثية الأبعاد جاهزة. اختر معاينة الفيديو أو صدّره.');
    return head;
  })().catch(error => {
    failed = error;
    head = null;
    activeModelUrl = '';
    activeProfile = '';
    console.error('ZEREOS 3D avatar failed to load:', error);
    status('تعذر تحميل الشخصية ثلاثية الأبعاد. تحقق من الاتصال ثم أعد تفعيل الأفاتار.');
    throw error;
  }).finally(() => { loading = null; });
  return loading;
}

function setMouth(instance, amount) {
  if (!instance?.mtAvatar) return;
  const value = Math.max(0, Math.min(0.82, Number(amount) || 0));
  for (const key of ['jawOpen', 'mouthOpen', 'viseme_aa']) {
    const target = instance.mtAvatar[key];
    if (target) {
      target.realtime = value;
      target.needsUpdate = true;
    }
  }
}

function draw(ctx, width, height, profileId, elapsed, amplitude) {
  if (failed) return false;
  if (!head || activeProfile !== profileId) {
    ensureHead(profileId).catch(() => {});
    return false;
  }
  setMouth(head, amplitude);
  const canvas = head.renderer?.domElement;
  if (!canvas || !canvas.width || !canvas.height) return false;
  let x = 0, y = 0, w = width, h = height;
  if (profileId === 'modernMan') { x = width * 0.025; y = height * 0.015; w = width * 0.95; h = height * 0.79; }
  else if (profileId === 'modernWoman') { x = width * 0.035; y = height * 0.015; w = width * 0.93; h = height * 0.84; }
  else if (profileId === 'hologram') { x = width * 0.025; y = height * 0.015; w = width * 0.95; h = height * 0.88; }
  else if (profileId === 'animeMan' || profileId === 'animeWoman') { x = width * 0.04; y = height * 0.025; w = width * 0.92; h = height * 0.88; }
  ctx.save();
  if (profileId === 'hologram') ctx.filter = 'saturate(1.6) hue-rotate(125deg) contrast(1.12)';
  ctx.drawImage(canvas, x, y, w, h);
  ctx.filter = 'none';
  ctx.restore();
  return true;
}

async function loadCustomModel(file, profileId) {
  if (!file || !/\.glb$/i.test(file.name)) throw new Error('اختر ملف GLB ثلاثي الأبعاد.');
  const url = URL.createObjectURL(file);
  const old = profileModels[profileId];
  profileModels[profileId] = url;
  if (old && old.startsWith('blob:')) URL.revokeObjectURL(old);
  activeProfile = '';
  failed = null;
  await ensureHead(profileId);
  return true;
}

window.ZereosTalkingAvatar = {
  draw,
  ensureHead,
  loadCustomModel,
  get status() { return failed ? 'error' : head ? 'ready' : loading ? 'loading' : 'idle'; }
};

const modelInput = document.getElementById('avatarModelFile');
modelInput?.addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  const profileId = window.ZereosActiveAvatarId || 'modernMan';
  try {
    await loadCustomModel(file, profileId);
    const name = document.getElementById('avatarProfiles')?.querySelector('[aria-pressed="true"]')?.textContent || file.name;
    status('تم تحميل نموذج ثلاثي الأبعاد مخصص لهذه الشخصية: ' + file.name);
    if (typeof window.drawFrame === 'function') window.drawFrame(0);
  } catch (error) {
    console.error(error);
    status('تعذر تحميل ملف GLB: ' + (error?.message || String(error)));
  }
});
