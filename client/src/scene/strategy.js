// Strategic layer rendering: AI armies, companions, Domains (whole-map transformation), rounds, Final War HUD.
// The client only renders server state (state.units, activeDomain*, round/stage) + short event messages.
import Phaser from 'phaser';
import {
  SP, SCALE, UNIT_UI, COMPANIONS, DOMAIN_UI, SLOT_COLORS, ELEMENT_COLORS, AR, HEROES, faceUrl, domainDef, ROLE_AR,
} from '../gameData.js';
import { playSfx } from '../audio.js';
import { clampNum } from './fx.js';

const TYPE_NAMES = ['basic', 'elite', 'commander', 'comp1', 'comp2', 'skeleton'];
const DIR_COL = { down: 0, up: 1, left: 2, right: 3 };
const DIR_VEC = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };
const sheetKey = (path) => 'us_' + path.replace(/[^a-z0-9]/gi, '_');
const hexCss = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0').slice(-6);
const mix = (a, b, t) => {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255, br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
};

function allSheets() {
  const s = new Set(Object.values(UNIT_UI).map((u) => u.sheet));
  Object.values(COMPANIONS).forEach((pair) => pair.forEach((c) => s.add(c.sheet)));
  return [...s];
}

export const strategyMixin = {
  preloadStrategy() {
    allSheets().forEach((path) => this.load.spritesheet(sheetKey(path), `${SP}/${path}`, { frameWidth: 16, frameHeight: 16 }));
  },

  setupStrategy() {
    allSheets().forEach((path) => {
      const key = sheetKey(path);
      Object.entries(DIR_COL).forEach(([dir, col]) => {
        if (!this.anims.exists(`${key}-walk-${dir}`)) this.anims.create({ key: `${key}-walk-${dir}`, frames: this.anims.generateFrameNumbers(key, { frames: [col, 4 + col, 8 + col, 12 + col] }), frameRate: 9, repeat: -1 });
      });
    });
    this.unitViews = new Map();
    this.domainParticles = [];
    this.domainFx = null;
    this.portalViews = null;
    this._armyCountAt = 0;
    this.hud.roundLbl = document.getElementById('roundLbl');
    this.hud.armyLine = document.getElementById('armyLine');
    this.hud.domainBar = document.getElementById('domainBar');
    this.hud.domainLbl = document.getElementById('domainLbl');
    this.hud.domainFill = document.getElementById('domainFill');
    this.hud.domainOverlay = document.getElementById('domainFx');
    this.hud.targetBox = document.getElementById('targetBox');
    this.hud.tbCards = document.getElementById('tbCards');
    this.hud.tbSub = document.getElementById('tbSub');
    this.hud.reGrowth = document.getElementById('reGrowth');
    this.hud.reNext = document.getElementById('reNext');
    this.hud.tbCards.addEventListener('pointerdown', (e) => {
      const card = e.target.closest('[data-tid]');
      if (!card || card.classList.contains('full')) return;
      e.preventDefault();
      this.room.send('target', { id: card.dataset.tid });
      playSfx('upgrade');
    });
  },

  // ---------------------------------------------------------------- messages
  setupStrategyMessages() {
    const r = this.room;
    r.onMessage('ushot', (m) => this.spawnUnitShot(m));
    r.onMessage('udie', (m) => {
      const v = this.unitViews.get(m.u);
      const x = v ? v.x : m.x, y = v ? v.y : m.y;
      if (m.fade) { this.playFx(18, x, y - 10, 1.8, 0xb0c0ff); return; }
      this.playFx(18, x, y - 10, m.t === 2 ? 3.4 : 2.2, 0xdddddd);
      this.burst(x, y - 12, 0xff6b6b, { count: m.t === 2 ? 18 : 8, speedMax: 180, scale: 1.1, gravity: 300 });
      if (m.t === 2) this.shockwave(x, y, 70, 0xffd166, 350);
    });
    r.onMessage('ureinforce', (m) => {
      this.playFx(m.rise ? 17 : 5, m.x, m.y - 14, m.rise ? 2.6 : 2, m.rise ? 0x9be25a : 0x7dd8ff);
      if (m.rise) this.burst(m.x, m.y, 0x9be25a, { count: 12, speedMax: 120, gravity: -120 });
    });
    r.onMessage('usummon', (m) => {
      const hero = (this.room.state.players.get(m.o) || {}).hero;
      const def = (COMPANIONS[hero] || COMPANIONS.shadow)[m.slot - 1];
      const col = def ? def.color : 0xffffff;
      this.castCircle(m.x, m.y, col, 70);
      this.playFx(3, m.x, m.y - 20, 4, col);
      this.burst(m.x, m.y - 20, col, { count: 26, speedMax: 240 });
      if (m.o === this.myId && def) this.floatText(m.x, m.y - 70, `${def.nameAr}!`, hexCss(col), 18);
      playSfx('cast_defensive');
    });
    r.onMessage('ublink', (m) => {
      this.playFx(14, m.x1, m.y1 - 14, 2.2, 0xb58cff); this.playFx(7, m.x2, m.y2 - 14, 2.6, 0xb58cff);
      const v = this.unitViews.get(m.u); if (v) { v.x = m.x2; v.y = m.y2; }
    });
    r.onMessage('uheal', (m) => {
      const v = this.unitViews.get(m.u);
      if (v) this.beam(v.x, v.y - 20, m.x, m.y - 20, 0x7dffb0, 3, 300);
      this.burst(m.x, m.y - 20, 0x7dffb0, { count: 8, speedMax: 60, gravity: -120, life: 600 });
    });
    r.onMessage('urally', (m) => {
      const v = this.unitViews.get(m.u);
      if (v) { this.shockwave(v.x, v.y, 230, 0xffd166, 500); this.floatText(v.x, v.y - 60, '⚜️', '#ffd166', 20); }
    });
    r.onMessage('armyTier', (m) => {
      const mine = m.id === this.myId;
      const v = this.views.get(m.id);
      if (v) { this.shockwave(v.x, v.y, 120, 0x7dffb0, 500); this.playFx(5, v.x, v.y - 30, 4, 0x7dffb0); }
      if (!m.unlocked) { if (mine) this.floatText(v ? v.x : 0, v ? v.y - 100 : 0, '📈 جيشك كبر!', '#7dffb0', 18); return; }
      const nm = UNIT_UI[m.unlocked].nameAr;
      if (mine) { this.announce(`${UNIT_UI[m.unlocked].icon} فتحت ${nm === 'قائد' ? 'القادة' : 'جنود النخبة'}!`, 0x7dffb0); playSfx('upgrade'); }
      else this.pushFeed(`${UNIT_UI[m.unlocked].icon} جيش ${m.name} صار فيه ${nm}`);
    });
    r.onMessage('armyPower', (m) => {
      const v = this.views.get(this.myId);
      const why = { kill: 'قتل', assist: 'مساعدة', champKill: 'قتل البطل', boss: 'الغول', roundWin: 'فوز بالجولة', survive: 'نجاة', unit: '' }[m.reason] || '';
      if (v && m.reason !== 'unit') this.floatText(v.x + 26, v.y - 110, `+${m.gain} 🛡️ ${why}`, '#7dffb0', 15);
    });
    r.onMessage('domain', (m) => this.onDomainStart(m, true));
    r.onMessage('domainEnd', () => this.onDomainEnd());
    r.onMessage('portal', (m) => {
      this.playFx(17, m.x1, m.y1 - 14, 3, 0xb58cff); this.playFx(17, m.x2, m.y2 - 14, 3, 0xb58cff);
      this.beam(m.x1, m.y1 - 14, m.x2, m.y2 - 14, 0x8a5aff, 3, 350);
      const v = this.views.get(m.id); if (v) { v.x = m.x2; v.y = m.y2; }
    });
    r.onMessage('targetSelect', () => { this.announce('🎯 اختر أهدافك!', 0xff6b3d); playSfx('boss_warning'); });
  },

  // ---------------------------------------------------------------- unit rendering
  unitLook(u, owner) {
    const type = TYPE_NAMES[u.t] || 'basic';
    if (type === 'comp1' || type === 'comp2') {
      const c = (COMPANIONS[owner && owner.hero] || COMPANIONS.shadow)[type === 'comp1' ? 0 : 1];
      return { type, sheet: c.sheet, scale: c.role === 'guardian' ? SCALE * 1.15 : SCALE * 0.95, comp: c, color: c.color };
    }
    const ui = UNIT_UI[type] || UNIT_UI.basic;
    return { type, sheet: ui.sheet, scale: ui.scale, color: 0xffffff };
  },

  createUnitView(u, owner) {
    const look = this.unitLook(u, owner);
    const key = sheetKey(look.sheet);
    const shadow = this.add.ellipse(u.x, u.y + 4, 22, 8, 0x000000, 0.3);
    const sprite = this.add.sprite(u.x, u.y + 6, key, 0).setOrigin(0.5, 1).setScale(look.scale);
    if (look.type === 'skeleton') sprite.setTint(0xb8f0a0);
    const el = owner ? (AR.HERO_ARMY[owner.hero] || {}).element : null;
    const v = { sprite, shadow, key, look, x: u.x, y: u.y, lx: u.x, ly: u.y, dir: 'down', movingUntil: 0, a: u.a, lungeAt: 0, element: el };
    this.unitViews.set(u.id, v);
    return v;
  },

  destroyUnitView(id, v) { v.sprite.destroy(); v.shadow.destroy(); this.unitViews.delete(id); },

  syncUnits(state, me, now, dt) {
    const g = this.gfxGround, gb = this.gfxBars;
    const seen = this._seenUnits || (this._seenUnits = new Set());
    seen.clear();
    const cam = this.cameras.main.worldView;
    const myTeam = me ? me.team : 0;
    const limited = this.visionLimited(state, me);
    state.units.forEach((u, id) => {
      seen.add(id);
      const owner = state.players.get(u.o);
      let v = this.unitViews.get(id);
      if (!v) v = this.createUnitView(u, owner);
      if (u.x !== v.lx || u.y !== v.ly) {
        const mx = u.x - v.lx, my = u.y - v.ly;
        if (Math.abs(mx) + Math.abs(my) > 1) { v.dir = Math.abs(mx) > Math.abs(my) ? (mx > 0 ? 'right' : 'left') : (my > 0 ? 'down' : 'up'); v.movingUntil = now + 140; }
        v.lx = u.x; v.ly = u.y;
      }
      const jump = Math.hypot(u.x - v.x, u.y - v.y);
      if (jump > 220) { v.x = u.x; v.y = u.y; } else { const k = Math.min(1, dt * 12); v.x += (u.x - v.x) * k; v.y += (u.y - v.y) * k; }

      const onScreen = v.x > cam.x - 80 && v.x < cam.right + 80 && v.y > cam.y - 80 && v.y < cam.bottom + 100;
      const mine = u.o === this.myId;
      const ally = !mine && myTeam && owner && owner.team === myTeam;
      let alpha = u.lg ? 0.62 : 1;
      if (limited && !mine && !ally && me && me.alive && Math.hypot(u.x - me.x, u.y - me.y) > 260) alpha = 0;
      if (!onScreen || alpha === 0) { v.sprite.setVisible(false); v.shadow.setVisible(false); return; }
      v.sprite.setVisible(true); v.shadow.setVisible(true);

      if (u.a !== v.a) { v.a = u.a; v.lungeAt = now; }
      const moving = now < v.movingUntil;
      const col = DIR_COL[v.dir];
      if (moving) v.sprite.play(`${v.key}-walk-${v.dir}`, true); else { v.sprite.anims.stop(); v.sprite.setFrame(col); }
      const lunge = now - v.lungeAt < 130 ? Math.sin((now - v.lungeAt) / 130 * Math.PI) * 7 : 0;
      const [fx, fy] = DIR_VEC[v.dir];
      v.sprite.setPosition(v.x + fx * lunge, v.y + 6 + fy * lunge).setDepth(v.y).setAlpha(alpha);
      v.shadow.setPosition(v.x, v.y + 4).setDepth(v.y - 1).setAlpha(alpha * 0.8);
      const fxs = u.fx;
      if (fxs) {
        if (fxs.includes('stun')) v.sprite.setTint(0xdddddd);
        else if (fxs.includes('chill')) v.sprite.setTint(0x9fe8ff);
        else if (fxs.includes('burn')) v.sprite.setTint(0xffb080);
        else if (fxs.includes('poison')) v.sprite.setTint(0xc8f0a0);
        else if (fxs.includes('shock')) v.sprite.setTint(0xfff6a0);
        else if (fxs.includes('weak')) v.sprite.setTint(0xc8a8ff);
        else v.sprite.clearTint();
        v.tinted = true;
      } else if (v.tinted || u.lg) { if (u.lg) v.sprite.setTint(0x9aa8d8); else if (v.look.type === 'skeleton') v.sprite.setTint(0xb8f0a0); else v.sprite.clearTint(); v.tinted = !!u.lg; }

      // owner ring + bars
      const ringCol = mine ? 0x6dff8a : ally ? 0x4cc9ff : SLOT_COLORS[(owner && owner.slot) || 0];
      const big = v.look.type === 'commander' || v.look.comp;
      const rw = big ? 36 : 24;
      g.lineStyle(big ? 3 : 2, ringCol, 0.75 * alpha); g.strokeEllipse(v.x, v.y + 4, rw, rw * 0.42);
      if (lunge > 5 && !v.look.comp && v.look.type !== 'elite') {
        gb.lineStyle(3, v.element ? ELEMENT_COLORS[v.element] || 0xffffff : 0xffffff, 0.8);
        gb.beginPath(); gb.arc(v.x + fx * 16, v.y - 12 + fy * 12, 14, Math.atan2(fy, fx) - 0.9, Math.atan2(fy, fx) + 0.9); gb.strokePath();
      }
      const top = v.y + 6 - 16 * v.look.scale;
      if (u.hp < u.mhp) {
        const bw = big ? 30 : 20;
        gb.fillStyle(0x000000, 0.6); gb.fillRect(v.x - bw / 2 - 1, top - 6, bw + 2, 4);
        gb.fillStyle(mine ? 0x6dff8a : ally ? 0x4cc9ff : ringCol, 1); gb.fillRect(v.x - bw / 2, top - 5, bw * clampNum(u.hp / u.mhp, 0, 1), 2);
      }
      if (v.look.type === 'commander') {
        gb.fillStyle(ringCol, 0.95); gb.fillTriangle(v.x - 5, top - 9, v.x + 5, top - 9, v.x, top - 17);
        gb.lineStyle(1, 0x000000, 0.8); gb.strokeTriangle(v.x - 5, top - 9, v.x + 5, top - 9, v.x, top - 17);
      } else if (v.look.comp) {
        gb.fillStyle(v.look.color, 0.95); gb.fillCircle(v.x, top - 10, 4); gb.lineStyle(1, 0x000000, 0.8); gb.strokeCircle(v.x, top - 10, 4);
      }
    });
    this.unitViews.forEach((v, id) => {
      if (seen.has(id)) return;
      if (state.phase === 'playing') this.playFx(18, v.x, v.y - 8, 1.6, 0xcccccc);
      this.destroyUnitView(id, v);
    });
  },

  spawnUnitShot(m) {
    const u = this.room.state.units.get(m.u);
    const owner = u ? this.room.state.players.get(u.o) : null;
    const v = this.unitViews.get(m.u);
    if (v && Math.abs(m.dx) + Math.abs(m.dy) > 0) { v.dir = Math.abs(m.dx) > Math.abs(m.dy) ? (m.dx > 0 ? 'right' : 'left') : (m.dy > 0 ? 'down' : 'up'); v.lungeAt = performance.now(); }
    const cam = this.cameras.main.worldView;
    if (m.x < cam.x - 300 || m.x > cam.right + 300 || m.y < cam.y - 300 || m.y > cam.bottom + 300) return;
    const el = owner ? (AR.HERO_ARMY[owner.hero] || {}).element : null;
    const color = (el && ELEMENT_COLORS[el]) || 0xffffff;
    const comp = u && u.t >= 3 && u.t <= 4;
    const tex = comp ? 'spark' : 'kunai';
    const ang = Math.atan2(m.dy, m.dx);
    const img = this.add.image(m.x, m.y, tex).setScale(comp ? 3.2 : 2.6).setDepth(4000).setRotation(ang).setTint(comp ? color : mix(0xffffff, color, 0.5));
    const glow = comp ? this.add.image(m.x, m.y, 'glow').setTint(color).setBlendMode(Phaser.BlendModes.ADD).setScale(0.9).setAlpha(0.8).setDepth(3999) : null;
    this.projectiles.push({
      pid: m.p, id: 'ushot', img, glow, x: m.x, y: m.y, dir: new Phaser.Math.Vector2(m.dx, m.dy), speed: m.s, range: m.r, travelled: 0,
      style: { trail: comp ? color : 0, glowScale: 0.9 }, startAt: 0, casterId: u ? u.o : '', returning: false,
    });
  },

  // ---------------------------------------------------------------- Domain: the whole map transforms
  visionLimited(state, me) {
    if (state.eventId === 'darkness') return true;
    const ui = DOMAIN_UI[state.activeDomainType];
    if (!ui || !ui.dark || !me) return false;
    const owner = state.players.get(state.activeDomainPlayer);
    if (!owner || owner.id === me.id) return false;
    return !(me.team && owner.team === me.team);
  },

  onDomainStart(m, fanfare) {
    if (this.domainFx) this.onDomainEnd(true);
    const ui = DOMAIN_UI[m.type];
    if (!ui) return;
    const now = performance.now();
    const d = { type: m.type, ui, ownerId: m.id, start: now, until: now + m.ms, decals: [], gfx: null, nextBolt: 0, preview: !!m.preview };
    this.domainFx = d;
    if (!this.domainTint) this.domainTint = this.add.rectangle(0, 0, this.W, this.H, ui.tint, 0).setOrigin(0, 0).setDepth(-940);
    this.domainTint.setFillStyle(ui.tint, 1).setAlpha(0).setVisible(true);
    this.tweens.killTweensOf(this.domainTint);
    this.tweens.add({ targets: this.domainTint, alpha: ui.alpha, duration: fanfare ? 700 : 10 });
    const objTint = mix(0xffffff, ui.tint, ui.dark || ui.alpha > 0.4 ? 0.45 : 0.3);
    this.objectViews.forEach((ov) => ov.img.setTint(objTint));
    this.bushViews.forEach((bv) => bv.imgs.forEach((im) => im.setTint(objTint)));
    this.buildDomainDecals(d);
    this.applyDomainGrade(d, fanfare);
    const ov = this.hud.domainOverlay;
    const c = ui.color, rr = (c >> 16) & 255, gg = (c >> 8) & 255, bb = c & 255;
    ov.style.background = `radial-gradient(ellipse at center, rgba(${rr},${gg},${bb},0) 55%, rgba(${rr},${gg},${bb},0.32) 100%)`;
    ov.style.boxShadow = `inset 0 0 90px rgba(${rr},${gg},${bb},0.55)`;
    ov.classList.add('show');
    if (!fanfare) return;
    const v = this.views.get(m.id);
    const x = v ? v.x : m.x, y = v ? v.y : m.y;
    this.cameras.main.flash(500, rr, gg, bb);
    this.bigRing(x, y, 1100, c, 1100);
    this.bigRing(x, y, 520, 0xffffff, 700);
    this.castCircle(x, y, c, 200);
    this.shake(0, 0, 450, 0.012, true);
    this.punchZoom(0.12);
    this.announce(`${ui.icon} ${ui.nameAr}`, c);
    this.showBanner(m.id === this.myId ? `${ui.icon} فعّلت نطاقك! ${ui.desc}` : `${ui.icon} ${m.name} حوّل الساحة إلى ${ui.nameAr} — ${ui.desc}`, 4200);
    playSfx('world_event');
  },

  // camera colour grade: the whole world (map, props, fighters) shifts into the domain's mood
  applyDomainGrade(d, fanfare) {
    const cam = this.cameras.main;
    if (this.game.renderer.type !== Phaser.WEBGL || !cam.postFX) return;
    if (!this.domainGrade) this.domainGrade = cam.postFX.addColorMatrix();
    const cm = this.domainGrade;
    cm.active = true;
    cm.reset();
    const grade = {
      inferno: () => { cm.sepia(); cm.saturate(0.5, true); cm.hue(-12, true); return 0.55; },
      glacier: () => { cm.saturate(-0.5); cm.brightness(1.12, true); return 0.7; },
      void: () => { cm.night(0.3); cm.hue(55, true); return 0.6; },
      storm: () => { cm.night(0.2); cm.saturate(-0.35, true); return 0.7; },
      tide: () => { cm.saturate(-0.25); cm.brightness(0.95, true); return 0.6; },
      blossom: () => { cm.saturate(0.35); cm.brightness(1.06, true); return 0.6; },
      sanctum: () => { cm.brightness(1.18); cm.sepia(true); return 0.4; },
      necropolis: () => { cm.saturate(-0.65); cm.brightness(0.78, true); return 0.8; },
      moonhunt: () => { cm.night(0.45); return 0.7; },
      sandstorm: () => { cm.sepia(); cm.brightness(0.92, true); return 0.7; },
    }[d.type];
    const target = grade ? grade() : 0;
    this.tweens.killTweensOf(cm);
    cm.alpha = fanfare ? 0 : target;
    if (fanfare) this.tweens.add({ targets: cm, alpha: target, duration: 700 });
  },
  clearDomainGrade() {
    const cm = this.domainGrade;
    if (!cm) return;
    this.tweens.killTweensOf(cm);
    this.tweens.add({ targets: cm, alpha: 0, duration: 600, onComplete: () => { if (!this.domainFx) cm.active = false; } });
  },

  bigRing(x, y, r, color, dur) {
    const g = this.add.graphics().setDepth(4950);
    const o = { k: 0 };
    this.tweens.add({ targets: o, k: 1, duration: dur, ease: 'Cubic.out', onUpdate: () => {
      const rr = r * o.k, a = 1 - o.k;
      g.clear(); g.lineStyle(14, color, 0.35 * a); g.strokeEllipse(x, y, rr * 2, rr * 1.3); g.lineStyle(4, color, a); g.strokeEllipse(x, y, rr * 2, rr * 1.3);
    }, onComplete: () => g.destroy() });
  },

  onDomainEnd(silent) {
    const d = this.domainFx;
    if (!d) return;
    this.domainFx = null;
    if (this.domainTint) { this.tweens.killTweensOf(this.domainTint); this.tweens.add({ targets: this.domainTint, alpha: 0, duration: 600, onComplete: () => this.domainTint.setVisible(false) }); }
    d.decals.forEach((o) => { this.tweens.killTweensOf(o); this.tweens.add({ targets: o, alpha: 0, duration: 500, onComplete: () => o.destroy() }); });
    if (d.gfx) this.tweens.add({ targets: d.gfx, alpha: 0, duration: 500, onComplete: () => d.gfx.destroy() });
    this.clearDomainGrade();
    this.objectViews.forEach((ov) => ov.img.clearTint());
    this.bushViews.forEach((bv) => bv.imgs.forEach((im) => im.clearTint()));
    this.hud.domainOverlay.classList.remove('show');
    if (!silent) { this.showBanner('🌍 الساحة رجعت طبيعية', 1800); this.cameras.main.flash(200, 255, 255, 255); }
  },

  buildDomainDecals(d) {
    const rng = Math.random;
    const W = this.W, H = this.H;
    const gfx = this.add.graphics().setDepth(-930);
    d.gfx = gfx;
    const glowAt = (x, y, tint, sx, sy, a1, a2, dur) => {
      const im = this.add.image(x, y, 'glow').setTint(tint).setBlendMode(Phaser.BlendModes.ADD).setScale(sx, sy).setAlpha(a1).setDepth(-925);
      this.tweens.add({ targets: im, alpha: a2, duration: dur, yoyo: true, repeat: -1, delay: rng() * dur });
      d.decals.push(im);
      return im;
    };
    const ponds = this.map.ponds;
    switch (d.type) {
      case 'inferno':
        for (let i = 0; i < 34; i++) {
          let x = 60 + rng() * (W - 120), y = 60 + rng() * (H - 120);
          gfx.lineStyle(4, 0xff5a00, 0.55);
          gfx.beginPath(); gfx.moveTo(x, y);
          for (let k = 0; k < 5; k++) { x += (rng() - 0.5) * 90; y += (rng() - 0.5) * 60; gfx.lineTo(x, y); }
          gfx.strokePath();
        }
        for (let i = 0; i < 28; i++) glowAt(60 + rng() * (W - 120), 60 + rng() * (H - 120), 0xff5a1f, 2 + rng() * 2, 1 + rng(), 0.15, 0.5, 700 + rng() * 600);
        ponds.forEach((p) => { gfx.fillStyle(0xff4a00, 0.7); gfx.fillRect(p.x * 48 + 4, p.y * 48 + 4, p.w * 48 - 8, p.h * 48 - 8); gfx.lineStyle(3, 0xffd166, 0.8); gfx.strokeRect(p.x * 48 + 4, p.y * 48 + 4, p.w * 48 - 8, p.h * 48 - 8); });
        break;
      case 'glacier':
        for (let i = 0; i < 40; i++) { const x = rng() * W, y = rng() * H, r = 40 + rng() * 110; gfx.fillStyle(0xffffff, 0.14 + rng() * 0.12); gfx.fillEllipse(x, y, r * 2, r); gfx.lineStyle(2, 0xdff8ff, 0.35); gfx.strokeEllipse(x, y, r * 2, r); }
        ponds.forEach((p) => { gfx.fillStyle(0xeaffff, 0.8); gfx.fillRect(p.x * 48 + 4, p.y * 48 + 4, p.w * 48 - 8, p.h * 48 - 8); });
        break;
      case 'void':
        for (let i = 0; i < 160; i++) { gfx.fillStyle(rng() < 0.3 ? 0xd8b8ff : 0xffffff, 0.3 + rng() * 0.6); gfx.fillCircle(rng() * W, rng() * H, 1 + rng() * 2); }
        for (let i = 0; i < 20; i++) { let x = rng() * W, y = rng() * H; gfx.lineStyle(3, 0x8a3aff, 0.45); gfx.beginPath(); gfx.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (rng() - 0.5) * 120; y += (rng() - 0.5) * 80; gfx.lineTo(x, y); } gfx.strokePath(); }
        break;
      case 'storm':
        for (let i = 0; i < 26; i++) { const x = rng() * W, y = rng() * H; gfx.fillStyle(0x3a4a70, 0.25); gfx.fillEllipse(x, y, 80 + rng() * 120, 30 + rng() * 40); }
        break;
      case 'tide':
        for (let i = 0; i < 60; i++) { const x = rng() * W, y = rng() * H; gfx.lineStyle(2, 0xbfe8ff, 0.35); gfx.strokeEllipse(x, y, 40 + rng() * 60, 12 + rng() * 14); }
        ponds.forEach((p) => { gfx.fillStyle(0x2a8aff, 0.35); gfx.fillEllipse((p.x + p.w / 2) * 48, (p.y + p.h / 2) * 48, p.w * 48 + 260, p.h * 48 + 200); });
        break;
      case 'blossom':
        for (let i = 0; i < 30; i++) glowAt(rng() * W, rng() * H, 0xff9ad8, 1.5 + rng() * 2, 1 + rng(), 0.12, 0.35, 1200 + rng() * 800);
        for (let i = 0; i < 90; i++) { gfx.fillStyle(rng() < 0.5 ? 0xffc0e8 : 0xff8ad0, 0.6); gfx.fillEllipse(rng() * W, rng() * H, 8, 5); }
        break;
      case 'sanctum':
        for (let i = 0; i < 18; i++) glowAt(80 + rng() * (W - 160), 80 + rng() * (H - 160), 0xffe08a, 1.4, 7, 0.1, 0.35, 900 + rng() * 700);
        for (let i = 0; i < 12; i++) { const x = rng() * W, y = rng() * H; gfx.lineStyle(2, 0xffe08a, 0.4); gfx.strokeCircle(x, y, 50 + rng() * 60); gfx.strokeCircle(x, y, 20 + rng() * 20); }
        break;
      case 'necropolis':
        for (let i = 0; i < 16; i++) {
          const x = 80 + rng() * (W - 160), y = 80 + rng() * (H - 160);
          const im = this.add.image(x, y, 'village', 'pillar').setOrigin(0.5, 1).setScale(SCALE * 0.8).setTint(0x7a8a70).setDepth(y).setAlpha(0.85);
          d.decals.push(im);
        }
        for (let i = 0; i < 24; i++) glowAt(rng() * W, rng() * H, 0x6aff4a, 3 + rng() * 3, 1.5, 0.05, 0.18, 1500 + rng() * 900);
        break;
      case 'moonhunt':
        for (let i = 0; i < 120; i++) { gfx.fillStyle(0xdfe6ff, 0.2 + rng() * 0.5); gfx.fillCircle(rng() * W, rng() * H, 1 + rng() * 1.5); }
        break;
      case 'sandstorm':
        for (let i = 0; i < 40; i++) { const x = rng() * W, y = rng() * H; gfx.fillStyle(0xe8c080, 0.25); gfx.fillEllipse(x, y, 140 + rng() * 160, 20 + rng() * 20); }
        break;
      default: break;
    }
    // bake the static decals into one texture so they cost a single quad per frame
    const rt = this.add.renderTexture(0, 0, W, H).setOrigin(0, 0).setDepth(-930);
    rt.draw(gfx);
    gfx.destroy();
    d.gfx = rt;
  },

  drawDomain(state, me, now, dt) {
    if (state.activeDomainType && !this.domainFx) {
      const ms = Math.max(200, state.activeDomainEndTime - Date.now());
      this.onDomainStart({ id: state.activeDomainPlayer, type: state.activeDomainType, ms }, false);
    } else if (!state.activeDomainType && this.domainFx && !this.domainFx.preview) this.onDomainEnd();
    const d = this.domainFx;
    this.updateDomainParticles(d, now, dt);
    if (!d) return;
    const gf = this.gfxFx;
    // portals (void)
    if (state.portals) {
      const pts = state.portals.split(';').map((s) => s.split(':').map(Number));
      for (let i = 0; i + 1 < pts.length; i += 2) {
        const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
        const col = [0xb58cff, 0xff6bd8, 0x5bf0ff][(i / 2) % 3];
        gf.lineStyle(2, col, 0.18); gf.lineBetween(ax, ay, bx, by);
        [[ax, ay], [bx, by]].forEach(([x, y]) => {
          this.gfxGround.fillStyle(0x0a0014, 0.85); this.gfxGround.fillEllipse(x, y, 64, 30);
          for (let k = 0; k < 4; k++) { const a = now / 180 + k * 1.57; gf.lineStyle(3, col, 0.9); gf.beginPath(); gf.arc(x, y - 4, 26 - k * 4, a, a + 1.6); gf.strokePath(); }
        });
      }
    }
    if (d.type === 'storm' && now > d.nextBolt) {
      d.nextBolt = now + 280 + Math.random() * 500;
      const cam = this.cameras.main.worldView;
      const x = cam.x + Math.random() * cam.width, y = cam.y + Math.random() * cam.height;
      this.drawBolt(x + (Math.random() - 0.5) * 60, y - 260, x, y, 0xfff27a, true);
      if (Math.random() < 0.3) this.cameras.main.flash(90, 200, 210, 255);
    }
    if (d.type === 'inferno' && Math.random() < 0.12 * this.fxMul) {
      const cam = this.cameras.main.worldView;
      this.playFx(20, cam.x + Math.random() * cam.width, cam.y + Math.random() * cam.height, 2.4, null, 4800);
    }
  },

  updateDomainParticles(d, now, dt) {
    const list = this.domainParticles;
    const max = this.touch ? 45 : 90;
    if (d && list.length < max) {
      const cam = this.cameras.main.worldView;
      const n = this.touch ? 2 : 3;
      for (let i = 0; i < n && list.length < max; i++) {
        const x = cam.x + Math.random() * cam.width, y = cam.y + Math.random() * cam.height;
        const P = { fx: d.ui.fx, life: 1200, born: now };
        let img;
        switch (d.ui.fx) {
          case 'ember': img = this.add.image(x, y, 'spark').setTint(Math.random() < 0.5 ? 0xff7a3c : 0xffd166).setScale(0.5 + Math.random() * 0.6).setBlendMode(Phaser.BlendModes.ADD); P.vx = (Math.random() - 0.5) * 40; P.vy = -40 - Math.random() * 60; P.life = 1400; break;
          case 'snow': img = this.add.image(x, y, 'spark').setTint(0xffffff).setScale(0.35 + Math.random() * 0.5); P.vx = -20 - Math.random() * 20; P.vy = 50 + Math.random() * 40; P.life = 2400; break;
          case 'rain': img = this.add.image(x, y, 'pixel').setTint(0x9fc8ff).setScale(0.7, 7).setRotation(0.18); P.vx = -110; P.vy = 700; P.life = 450; break;
          case 'bubble': img = this.add.image(x, y, 'spark').setTint(0xbfe8ff).setScale(0.4 + Math.random() * 0.6).setAlpha(0.6); P.vx = (Math.random() - 0.5) * 20; P.vy = -30 - Math.random() * 30; P.life = 1800; break;
          case 'petal': img = this.add.image(x, y, 'pixel').setTint(Math.random() < 0.5 ? 0xffb0e0 : 0xff80c8).setScale(2.6, 1.6); P.vx = 30 + Math.random() * 30; P.vy = 30 + Math.random() * 30; P.spin = 3; P.life = 2600; break;
          case 'holy': img = this.add.image(x, y, 'glow').setTint(0xffe08a).setScale(0.25).setBlendMode(Phaser.BlendModes.ADD); P.vx = 0; P.vy = -50; P.life = 1500; break;
          case 'mist': img = this.add.image(x, y, 'glow').setTint(0x7aff5a).setScale(2 + Math.random() * 2).setAlpha(0.12); P.vx = 15; P.vy = -5; P.life = 2600; P.fade = 0.12; break;
          case 'void': img = this.add.image(x, y, 'spark').setTint(Math.random() < 0.5 ? 0xb58cff : 0x5bf0ff).setScale(0.4 + Math.random() * 0.4).setBlendMode(Phaser.BlendModes.ADD); P.vx = (Math.random() - 0.5) * 30; P.vy = (Math.random() - 0.5) * 30; P.life = 1600; break;
          case 'moon': img = this.add.image(x, y, 'spark').setTint(0xdfffb0).setScale(0.35).setBlendMode(Phaser.BlendModes.ADD); P.vx = (Math.random() - 0.5) * 30; P.vy = (Math.random() - 0.5) * 20; P.life = 2000; break;
          case 'sand': img = this.add.image(x, y, 'pixel').setTint(0xe8c080).setScale(3, 0.8).setAlpha(0.7); P.vx = 520 + Math.random() * 200; P.vy = 40; P.life = 650; break;
          default: return;
        }
        img.setDepth(7000);
        P.img = img; P.a0 = P.fade || img.alpha;
        list.push(P);
      }
    }
    for (let i = list.length - 1; i >= 0; i--) {
      const P = list[i];
      const t = (now - P.born) / P.life;
      if (t >= 1 || (!d && t > 0.2)) { P.img.destroy(); list.splice(i, 1); continue; }
      P.img.x += P.vx * dt; P.img.y += P.vy * dt;
      if (P.spin) P.img.rotation += P.spin * dt;
      P.img.setAlpha(P.a0 * Math.min(1, t * 5) * (1 - t));
    }
  },

  // ---------------------------------------------------------------- HUD: round, army, domain, targets
  updateStrategyHud(state, me, now) {
    const h = this.hud;
    const R = AR.MATCH.rounds;
    let lbl = '';
    if (state.stage === 'round') lbl = `الجولة ${state.round}/${R}`;
    else if (state.stage === 'final') lbl = '⚔ الحرب الأخيرة';
    else if (state.stage === 'growth') lbl = `📈 نمو الجيش · ${state.round}/${R}`;
    else if (state.stage === 'targets') lbl = '🎯 اختيار الأهداف';
    else if (state.stage === 'ended') lbl = '🏆 انتهت المباراة';
    if (lbl !== this._lastRoundLbl) { this._lastRoundLbl = lbl; h.roundLbl.textContent = lbl; h.roundLbl.classList.toggle('final', state.stage === 'final'); }
    if (state.phase === 'intermission' && state.stageEndsAt) {
      const secs = Math.max(0, Math.ceil((state.stageEndsAt - Date.now()) / 1000));
      const tt = `0:${String(secs).padStart(2, '0')}`;
      if (tt !== this._lastT) { this._lastT = tt; h.timer.textContent = tt; }
    }

    if (me && now > this._armyCountAt) {
      this._armyCountAt = now + 250;
      const c = [0, 0, 0, 0, 0, 0];
      state.units.forEach((u) => { if (u.o === this.myId) c[u.t]++; });
      const comp = c[3] + c[4];
      const line = `🛡️ <b>${me.power}</b> · 🗡️${c[0] + c[5]} 🏹${c[1]} ⚜️${c[2]}${comp ? ` 🐾${comp}` : ''}`;
      if (line !== this._lastArmyLine) { this._lastArmyLine = line; h.armyLine.innerHTML = line; }
    }

    // active domain indicator
    const dOwner = state.activeDomainPlayer ? state.players.get(state.activeDomainPlayer) : null;
    const ui = DOMAIN_UI[state.activeDomainType];
    if (dOwner && ui) {
      const left = Math.max(0, state.activeDomainEndTime - Date.now());
      const txt = `${ui.icon} ${ui.nameAr} — ${dOwner.id === this.myId ? 'نطاقك' : dOwner.name} · ${Math.ceil(left / 1000)}s`;
      if (!h.domainBar.classList.contains('show')) { h.domainBar.classList.add('show'); h.domainBar.style.borderColor = hexCss(ui.color); h.domainFill.style.background = hexCss(ui.color); h.domainLbl.style.color = hexCss(ui.color); }
      if (txt !== this._lastDomTxt) { this._lastDomTxt = txt; h.domainLbl.textContent = txt; }
      h.domainFill.style.width = `${clampNum(left / AR.DOMAIN.duration, 0, 1) * 100}%`;
    } else if (h.domainBar.classList.contains('show')) h.domainBar.classList.remove('show');

    // Final War target selection
    const selecting = state.stage === 'targets' && me;
    if (selecting) {
      if (this.hud.roundEnd.classList.contains('show')) this.hud.roundEnd.classList.remove('show');
      const secs = Math.max(0, Math.ceil((state.stageEndsAt - Date.now()) / 1000));
      const mine = me.targets ? me.targets.split(',') : [];
      const attackers = (id) => { let n = 0; state.players.forEach((p) => { if (p.targets && p.targets.split(',').includes(id)) n++; }); return n; };
      const cards = [];
      state.players.forEach((p) => {
        if (p.id === this.myId || p.kind || (me.team && p.team === me.team)) return;
        const n = attackers(p.id);
        const sel = mine.includes(p.id);
        const full = !sel && (n >= AR.MATCH.maxAttackersPerTarget || mine.length >= AR.MATCH.maxTargetsPerPlayer);
        cards.push(`<div class="tcard${sel ? ' sel' : ''}${full ? ' full' : ''}" data-tid="${p.id}"><img class="px" src="${faceUrl(p.hero)}"/><b>${p.name}${p.isBot ? ' 🤖' : ''}</b><span>🛡️ ${p.power} · ⚔ ${p.kills}</span><span class="att">🎯 ${n}/${AR.MATCH.maxAttackersPerTarget}${sel ? ' · هدفك' : n >= AR.MATCH.maxAttackersPerTarget ? ' · مكتمل' : ''}</span></div>`);
      });
      const html = cards.join('');
      if (html !== this._lastTb) { this._lastTb = html; h.tbCards.innerHTML = html; }
      const sub = `اختر لحد ${AR.MATCH.maxTargetsPerPlayer} أعداء — جيشك رح يطاردهم بالحرب الأخيرة · كل لاعب بيستهدفه ${AR.MATCH.maxAttackersPerTarget} بالأكثر · ${secs}s`;
      if (sub !== this._lastTbSub) { this._lastTbSub = sub; h.tbSub.textContent = sub; }
    }
    if (!!selecting !== !!this._tbOn) { this._tbOn = !!selecting; h.targetBox.classList.toggle('show', !!selecting); }
  },

  growthHtml(m) {
    const g = (m.growth || []).find((x) => x.id === this.myId);
    if (!g || m.final) return '';
    const names = { basic: '🗡️ جندي', elite: '🏹 نخبة', commander: '⚜️ قائد' };
    const gained = Object.keys(names).map((k) => (g.comp[k] > g.prev[k] ? `+${g.comp[k] - g.prev[k]} ${names[k]}` : '')).filter(Boolean);
    const unlocked = (g.unlocked || []).map((k) => `<div class="up">🔓 فتحت: ${names[k]}</div>`).join('');
    return `<h3>📈 ARMY GROWTH · نمو الجيش</h3><div class="g">
      <div>قوة الجيش: <b>${g.before}</b> → <b style="color:#7dffb0">${g.after}</b> <span class="up">(+${g.gain})</span></div>
      <div>${gained.length ? 'وحدات جديدة: ' + gained.join(' · ') : 'ما في وحدات جديدة — اكسب قتلات ومساعدات'}</div>
      ${g.tierUp ? '<div class="up">⬆️ مستوى جيش جديد!</div>' : ''}${unlocked}
      <div>جيشك الحالي: ${names.basic} ${g.comp.basic} · ${names.elite} ${g.comp.elite} · ${names.commander} ${g.comp.commander}</div></div>`;
  },
};

export { domainDef, ROLE_AR };
