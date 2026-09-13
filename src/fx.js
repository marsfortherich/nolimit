// Visual feedback. Everything here draws into a fixed overlay that the normal
// render pass never touches, so a full re-render cannot interrupt an animation
// in flight.

import { Settings, ms } from './settings.js';

const fxLayer = () => document.getElementById('fx');

export const fxWait = (t) => new Promise((r) => setTimeout(r, ms(t)));

function fxRect(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, top: r.top };
}

/** A number that rises off the thing that produced it and fades. */
export function fxFloat(el, text, kind = 'chips') {
  const layer = fxLayer();
  if (!el || !layer) return;
  const { x, top } = fxRect(el);
  const node = document.createElement('div');
  node.className = 'fx-float fx-' + kind;
  node.textContent = text;
  layer.append(node);
  node.style.left = x + 'px';
  node.style.top = top - 6 + 'px';
  if (Settings.reducedMotion) {
    setTimeout(() => node.remove(), 600);
    return;
  }
  const dur = ms(900);
  node.animate(
    [
      { transform: 'translate(-50%, 0) scale(.7)', opacity: 0 },
      { transform: 'translate(-50%, -14px) scale(1.15)', opacity: 1, offset: 0.18 },
      { transform: 'translate(-50%, -30px) scale(1)', opacity: 1, offset: 0.6 },
      { transform: 'translate(-50%, -52px) scale(.9)', opacity: 0 }
    ],
    { duration: Math.max(1, dur), easing: 'cubic-bezier(.2,.8,.3,1)' }
  ).onfinish = () => node.remove();
}

/** Briefly light up the element that just scored. */
export function fxFlash(el, kind = 'hit') {
  if (!el) return;
  const cls = 'fx-lit-' + kind;
  el.classList.remove(cls);
  void el.offsetWidth;              // restart the CSS animation
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), ms(650) || 300);
}

/** Physical jolt, strength 0..1. */
export function fxShake(power = 0.5) {
  if (!Settings.shake || Settings.reducedMotion) return;
  const app = document.getElementById('app');
  if (!app) return;
  const px = 3 + power * 16;
  const dur = ms(120 + power * 260);
  if (!dur) return;
  app.animate(
    [
      { transform: 'translate(0,0)' },
      { transform: `translate(${px}px, ${-px * 0.6}px)` },
      { transform: `translate(${-px * 0.8}px, ${px * 0.5}px)` },
      { transform: `translate(${px * 0.5}px, ${px * 0.3}px)` },
      { transform: `translate(${-px * 0.3}px, ${-px * 0.2}px)` },
      { transform: 'translate(0,0)' }
    ],
    { duration: dur, easing: 'ease-out' }
  );
}

/** Tween a number in place. Returns a promise that settles when it lands. */
export function fxCountUp(el, from, to, duration, format = (n) => String(Math.round(n))) {
  if (!el) return Promise.resolve();
  const dur = ms(duration);
  if (!dur || from === to) { el.textContent = format(to); return Promise.resolve(); }
  return new Promise((resolve) => {
    const t0 = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = format(from + (to - from) * eased);
      if (p < 1) requestAnimationFrame(tick);
      else { el.textContent = format(to); resolve(); }
    };
    requestAnimationFrame(tick);
  });
}

/** A quick scale pop, for a counter that just changed. */
export function fxPop(el, scale = 1.25) {
  if (!el || Settings.reducedMotion) return;
  const dur = ms(260);
  if (!dur) return;
  el.animate(
    [{ transform: 'scale(1)' }, { transform: `scale(${scale})`, offset: 0.35 }, { transform: 'scale(1)' }],
    { duration: dur, easing: 'cubic-bezier(.3,1.4,.4,1)' }
  );
}

/** Celebratory specks, used when a table falls. */
export function fxBurst(el, count = 18) {
  const layer = fxLayer();
  if (!el || !layer || Settings.reducedMotion) return;
  const { x, y } = fxRect(el);
  const colours = ['#d9b45b', '#f0d089', '#e0574a', '#4b8bd6', '#2ea36a'];
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'fx-spark';
    p.style.background = colours[i % colours.length];
    p.style.left = x + 'px';
    p.style.top = y + 'px';
    layer.append(p);
    const a = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const dist = 60 + Math.random() * 140;
    p.animate(
      [
        { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
        { transform: `translate(${Math.cos(a) * dist - 50}%, ${Math.sin(a) * dist + 60}%) scale(.3)`, opacity: 0 }
      ],
      { duration: ms(700 + Math.random() * 500), easing: 'cubic-bezier(.1,.7,.3,1)' }
    ).onfinish = () => p.remove();
  }
}

export function fxClear() {
  const layer = fxLayer();
  if (layer) layer.replaceChildren();
}
