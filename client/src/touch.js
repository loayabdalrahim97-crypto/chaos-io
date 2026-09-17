// Mobile controls (DOM overlay, pointer events):
//  - left side: floating joystick that appears wherever your thumb lands
//  - right side: ability buttons — tap = auto-aim at the nearest enemy,
//    hold & drag = aim manually (release to cast)
import { iconStyle } from './gameData.js';

export function isTouchDevice() {
  return (typeof window !== 'undefined') && (('ontouchstart' in window) || navigator.maxTouchPoints > 0)
    && window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
}

const JOY_R = 58;
const AIM_R = 110; // drag distance that means "full range"

export class TouchControls {
  constructor(scene) {
    this.scene = scene;
    this.move = { x: 0, y: 0 };
    this.aim = null; // { id, dx, dy }
    this.loadoutKey = '';
    this.buttons = new Map();

    document.body.classList.add('touch');
    const root = document.createElement('div');
    root.id = 'touchUI';
    root.innerHTML = `
      <div id="joyZone"><div id="joyBase"><div id="joyKnob"></div></div></div>
      <div id="actionPad"></div>`;
    document.getElementById('hud').appendChild(root);
    this.root = root;
    this.joyZone = root.querySelector('#joyZone');
    this.joyBase = root.querySelector('#joyBase');
    this.joyKnob = root.querySelector('#joyKnob');
    this.pad = root.querySelector('#actionPad');

    // ---- joystick ----
    this.joy = null;
    const resetJoy = () => {
      this.joy = null; this.move = { x: 0, y: 0 };
      this.joyBase.classList.remove('active');
      this.joyBase.style.left = ''; this.joyBase.style.top = '';
      this.joyKnob.style.transform = 'translate(-50%, -50%)';
    };
    this.joyZone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.joy) return;
      const r = this.joyZone.getBoundingClientRect();
      this.joy = { id: e.pointerId, bx: e.clientX, by: e.clientY };
      this.joyZone.setPointerCapture(e.pointerId);
      this.joyBase.classList.add('active');
      this.joyBase.style.left = `${e.clientX - r.left}px`;
      this.joyBase.style.top = `${e.clientY - r.top}px`;
    });
    this.joyZone.addEventListener('pointermove', (e) => {
      if (!this.joy || e.pointerId !== this.joy.id) return;
      e.preventDefault();
      let dx = e.clientX - this.joy.bx, dy = e.clientY - this.joy.by;
      const len = Math.hypot(dx, dy);
      if (len > JOY_R) { dx = dx / len * JOY_R; dy = dy / len * JOY_R; }
      this.joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      this.move = len < 8 ? { x: 0, y: 0 } : { x: dx / JOY_R, y: dy / JOY_R };
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => this.joyZone.addEventListener(ev, (e) => { if (this.joy && e.pointerId === this.joy.id) resetJoy(); }));

    // no page scroll / pinch zoom while playing
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('touchmove', (e) => { if (e.target.closest && e.target.closest('#touchUI')) e.preventDefault(); }, { passive: false });
  }

  buildButtons(slots) {
    const key = slots.map((x) => x[0] + ':' + x[3]).join(',');
    if (key === this.loadoutKey) return;
    this.loadoutKey = key;
    this.pad.innerHTML = '';
    this.buttons.clear();
    this.aim = null;
    slots.forEach(([id, , def, cls]) => {
      const b = document.createElement('div');
      b.className = `tbtn ${cls}`;
      b.innerHTML = `<div class="ico" style="${iconStyle(def.icon, cls === 'basic' ? 50 : 40)}">${def.icon && def.icon.emoji ? def.icon.emoji : ''}</div><div class="cd"></div>`;
      this.pad.appendChild(b);
      const cdEl = b.querySelector('.cd');
      this.buttons.set(id, { el: b, cdEl, lastCd: -1, cls });
      let start = null;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (start) return;
        start = { pid: e.pointerId, x: e.clientX, y: e.clientY };
        b.setPointerCapture(e.pointerId);
        b.classList.add('held');
        this.aim = { id, dx: 0, dy: 0 };
      });
      b.addEventListener('pointermove', (e) => {
        if (!start || e.pointerId !== start.pid) return;
        e.preventDefault();
        this.aim = { id, dx: e.clientX - start.x, dy: e.clientY - start.y };
      });
      const end = (e, cancel) => {
        if (!start || e.pointerId !== start.pid) return;
        const dx = e.clientX - start.x, dy = e.clientY - start.y;
        start = null;
        b.classList.remove('held');
        this.aim = null;
        if (!cancel) this.scene.touchCast(id, dx, dy, AIM_R);
      };
      b.addEventListener('pointerup', (e) => end(e, false));
      b.addEventListener('pointercancel', (e) => end(e, true));
    });
  }

  update(me, slots) {
    if (!me) return;
    this.buildButtons(slots);
    const now = Date.now();
    this.buttons.forEach((btn, id) => {
      const cd = btn.cls === 'bonus' || btn.cls === 'curse' ? 0 : (me.cooldowns.get(id) || 0) - now;
      const secs = cd > 0 ? Math.ceil(cd / 1000) : 0;
      if (secs !== btn.lastCd) {
        btn.lastCd = secs;
        btn.cdEl.textContent = secs ? String(secs) : '';
        btn.el.classList.toggle('cooling', secs > 0);
      }
    });
    const dom = this.buttons.get('domain');
    if (dom) { const st = this.scene.room.state; dom.el.classList.toggle('locked', !!st.activeDomainPlayer && st.activeDomainPlayer !== me.id); }
    this.root.style.display = me.alive || me.ghost ? '' : 'none';
  }

  get aimRadius() { return AIM_R; }
}
