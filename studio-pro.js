/* ZEREOS Studio Pro — keyboard navigation that delegates to existing controls. */
(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const isTyping = target => {
    if (!target) return false;
    const tag = String(target.tagName || '').toUpperCase();
    return ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(tag) ||
      target.isContentEditable || Boolean(target.closest?.('[contenteditable="true"]'));
  };
  const showSceneFrame = step => {
    try {
      if (typeof sceneTimeline !== 'function' || typeof drawFrame !== 'function') return;
      const timeline = sceneTimeline();
      if (!timeline.length) return;
      const current = typeof currentScene === 'number' ? currentScene : 0;
      const next = Math.max(0, Math.min(timeline.length - 1, current + step));
      if (typeof playing !== 'undefined' && playing) {
        byId('playBtn')?.click();
      }
      if (typeof currentScene !== 'undefined') currentScene = next;
      if (typeof updateTimelineUI === 'function') updateTimelineUI(next);
      drawFrame(timeline[next].start);
      const status = byId('status');
      if (status) status.textContent = 'المشهد ' + (next + 1) + ' من ' + timeline.length + ' — اضغط Space لمعاينة الفيديو.';
    } catch (error) {
      console.warn('Studio keyboard navigation:', error);
    }
  };
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.altKey) return;
    const typing = isTyping(event.target);
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      const save = byId('workspaceQuickSave');
      if (save && !save.disabled) save.click();
      return;
    }
    if (typing || event.ctrlKey || event.metaKey) return;
    if (event.code === 'Space') {
      event.preventDefault();
      byId('playBtn')?.click();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      showSceneFrame(-1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      showSceneFrame(1);
    }
  });
  const timeline = byId('sceneTimelineStrip');
  if (timeline) {
    timeline.setAttribute('aria-describedby', 'studioKeyboardHelp');
    const hint = document.createElement('p');
    hint.id = 'studioKeyboardHelp';
    hint.className = 'note studio-keyboard-help';
    hint.textContent = 'اختصارات: Space للتشغيل والإيقاف · ← / → للتنقل بين المشاهد · Ctrl+S للحفظ';
    timeline.insertAdjacentElement('afterend', hint);
  }
})();
