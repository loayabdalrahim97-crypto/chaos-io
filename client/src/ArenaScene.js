import Phaser from 'phaser';
import {
  SP, GD, HEROES, faceUrl, ABILITIES, LEGENDS, MYTHICS, BASIC, PASSIVES, STATUS, COMBOS, WORLD_EVENTS,
  OBJECT_FRAMES, GROUND, SCALE, iconStyle, defOf,
} from './gameData.js';
import { playSfx } from './audio.js';
import { TouchControls, isTouchDevice } from './touch.js';

// Physical key codes (not e.key) so bindings work on any keyboard language/layout.
const CODE_TO_ACTION = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  Digit1: 'slot0', Digit2: 'slot1', Digit3: 'slot2', KeyQ: 'legend', Digit4: 'legend', KeyE: 'mythic', KeyR: 'mythic', Digit5: 'mythic', Space: 'basic',
};
const DIR_COL = { down: 0, up: 1, left: 2, right: 3 };
const DIR_VEC = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };
const FX_USED = [1, 3, 4, 5, 6, 7, 8, 9, 12, 13, 14, 15, 16, 17, 18, 19, 20];
const PROJECTILE = {
  strike:        { tex: 'shuriken', scale: 2.6, spin: true, glow: 0xffffff, glowScale: 0.7 },
  fireball:      { tex: 'fireball', scale: 4.2, trail: 0xff7a3c, glow: 0xff7a3c, glowScale: 1.6 },
  ice_shard:     { tex: 'icespike', scale: 4, trail: 0x8ae8ff, glow: 0x8ae8ff, glowScale: 1.3 },
  hunter_mark:   { tex: 'arrow', scale: 4, trail: 0xff5e7a, glow: 0xff5e7a, glowScale: 1.1 },
  poison_dagger: { tex: 'sai', scale: 4.5, trail: 0x9be25a, glow: 0x9be25a, glowScale: 1.2, spin: true },
  vine_pull:     { tex: 'spark', scale: 3, tint: 0x7ccf4a, trail: 0x7ccf4a, glow: 0x7ccf4a, glowScale: 1.2, vine: true },
  boomerang:     { tex: 'axe', scale: 5, spin: true, trail: 0xffc36b, glow: 0xffc36b, glowScale: 1.4, boomerang: true, pierce: true },
  fate_arrow:    { tex: 'arrow', scale: 9, trail: 0xffe27a, tint: 0xffe27a, glow: 0xffe27a, glowScale: 3, delay: 300, pierce: true },
};
const BIG_OBJECTS = new Set(['cluster', 'tree', 'tree2', 'pine', 'house', 'hut', 'ruin', 'kiln']);
const clampNum = (v, a, b) => Math.max(a, Math.min(b, v));

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => { t += 0x6d2b79f5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
}

export default class ArenaScene extends Phaser.Scene {
  constructor() { super('arena'); }

  init(data) {
    this.room = data.room;
    this.map = data.map;
    this.myId = this.room.sessionId;
  }

  preload() {
    this.load.setCORS('anonymous');
    const txt = this.add.text(this.scale.width / 2, this.scale.height / 2, 'جارٍ تحميل الساحة... 0%', { fontFamily: 'Tahoma', fontSize: '20px', color: '#ffd166' }).setOrigin(0.5);
    this.load.on('progress', (v) => txt.setText(`جارٍ تحميل الساحة... ${Math.round(v * 100)}%`));
    this.load.on('complete', () => txt.destroy());
    Object.entries(HEROES).forEach(([id, h]) => this.load.spritesheet('hero_' + id, `${SP}/characters/${h.sheet}.png`, { frameWidth: 16, frameHeight: 16 }));
    this.load.spritesheet('dog', `${SP}/characters/dog.png`, { frameWidth: 16, frameHeight: 16 });
    FX_USED.forEach((n) => this.load.spritesheet('fx' + n, `${SP}/fx/${n}.png`, { frameWidth: 32, frameHeight: 32 }));
    this.load.image('tiles', `${SP}/background-elements/tileset.png`);
    this.load.image('village', `${GD}/tileset_village_abandoned.png`);
    this.load.image('floor', `${GD}/tileset_floor.png`);
    this.load.image('shuriken', `${SP}/hud/shuriken.png`);
    this.load.image('fireball', `${SP}/items/fireball.png`);
    this.load.image('icespike', `${SP}/items/ice-spike.png`);
    this.load.image('arrow', `${SP}/items/arrow.png`);
    this.load.image('heart', `${SP}/items/heart.png`);
    this.load.image('axe', `${SP}/weapons/axe.png`);
    this.load.image('sai', `${SP}/weapons/sai.png`);
  }

  create() {
    this.W = this.map.w; this.H = this.map.h;
    this.setupTextures();
    this.buildGround();
    this.buildObjects();

    this.gfxGround = this.add.graphics().setDepth(-900);   // trap marks, scorch, telegraphs, zones
    this.gfxZone = this.add.graphics().setDepth(6000);
    this.gfxBars = this.add.graphics().setDepth(6500);
    this.gfxFx = this.add.graphics().setDepth(5000);
    this.gfxAim = this.add.graphics().setDepth(5900);
    this.views = new Map();
    this.projectiles = [];
    this.telegraphs = [];
    this.groundMarks = [];
    this.waves = [];
    this.auras = [];
    this.zones = [];
    this.myTraps = [];
    this.pickupViews = new Map();
    this.lastPickups = null;
    this.keys = {};
    this.aimWorld = { x: this.W / 2, y: this.H / 2 };
    this.lastSent = { mx: 9, my: 9, t: 0 };
    this.lastPhase = null;
    this.punch = 0;
    this.lastChampion = '';

    this.hud = getHudRefs();
    this.hud.root.classList.add('active');
    this.touch = isTouchDevice() ? new TouchControls(this) : null;
    this.fxMul = this.touch ? 0.75 : 1;
    this.buildScreenFx();
    const controls = this.touch
      ? '🕹️ اسحب بإصبعك يسار الشاشة للمشي<br/>👆 اضغط زر القدرة = تصويب تلقائي على أقرب عدو<br/>✋ اضغط واسحب الزر = تصويب يدوي، واترك لتطلق'
      : 'WASD حركة · الماوس تصويب · Space/كليك شوريكن · 1 2 3 قدرات · Q أسطورية · E قدرة البطل الخارقة';
    this.hud.helpPanel.innerHTML = '<b>👑 البطل الأقوى</b><br/>أكثر لاعب قتلات بصير البطل: أكبر وأقوى وصحته أعلى. اللي بيقتله بيكسب قدرة خارقة (إيقاف الزمن، تحريف الواقع...)<br/><br/>'
      + '<b>🔗 الكومبوهات</b><br/>' + Object.values(COMBOS).map((c) => `<div class="cb"><span style="color:${c.color}">${c.nameAr}</span><br/>${c.recipe} → ${c.effect}</div>`).join('')
      + `<br/><b>🎮 التحكم</b><br/>${controls}<br/>🌿 العشب الطويل يخفيك · 💧 الماء يبطئك · 📦 اكسر الصناديق للشفاء`;
    this.hud.helpBtn.addEventListener('click', () => this.hud.helpPanel.classList.toggle('show'));

    this.setupInput();
    this.setupMessages();
    if (location.hostname === 'localhost') window.__arena = this; // local debugging only

    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.W, this.H);
    this.applyZoom();
    this.scale.on('resize', () => this.applyZoom());
    cam.centerOn(this.W / 2, this.H / 2);
  }

  applyZoom() {
    const s = this.scale;
    this.baseZoom = clampNum(Math.min(s.width, s.height) / 760, 0.55, 1);
    this.cameras.main.setZoom(this.baseZoom * (1 + this.punch));
  }

  punchZoom(k) { this.punch = Math.max(this.punch, k); }

  buildScreenFx() {
    const root = this.hud.root;
    const mk = (id, html) => { let el = document.getElementById(id); if (!el) { el = document.createElement('div'); el.id = id; el.className = 'panel'; el.innerHTML = html; root.appendChild(el); } return el; };
    this.hud.timeStopFx = mk('timeStopFx', '<div class="clock">⏸️</div><div class="lbl"></div>');
    this.hud.champArrow = mk('champArrow', '<span class="ar">➤</span><span class="cr">👑</span>');
  }

  // ---------------------------------------------------------------- textures, anims
  setupTextures() {
    const addFrames = (key, frames) => { const t = this.textures.get(key); Object.entries(frames).forEach(([n, [x, y, w, h]]) => t.add(n, 0, x, y, w, h)); };
    const objs = {};
    Object.entries(OBJECT_FRAMES).forEach(([k, f]) => { (objs[f.tex] = objs[f.tex] || {})[k] = [f.x, f.y, f.w, f.h]; });
    addFrames('village', objs.village);
    addFrames('tiles', objs.tiles);
    const floor = {};
    GROUND.grass.forEach(([, c, r], i) => { floor['g' + i] = [c * 16, r * 16, 16, 16]; });
    Object.entries(GROUND.dirt).forEach(([k, [c, r]]) => { floor['d_' + k] = [c * 16, r * 16, 16, 16]; });
    addFrames('floor', floor);
    const pond = {};
    Object.entries(GROUND.pond).forEach(([k, [c, r]]) => { pond['p_' + k] = [c * 16, r * 16, 16, 16]; });
    pond.lily = [23 * 16, 8 * 16, 16, 16];
    addFrames('tiles', pond);

    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xffffff, 1); g.fillCircle(4, 4, 4); g.generateTexture('spark', 8, 8);
    g.clear(); g.fillStyle(0xffffff, 1); g.fillRect(0, 0, 3, 3); g.generateTexture('pixel', 3, 3);
    g.destroy();
    // soft radial glow (for projectiles, auras, the champion)
    if (!this.textures.exists('glow')) {
      const ct = this.textures.createCanvas('glow', 64, 64);
      const ctx = ct.getContext();
      const grd = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.35, 'rgba(255,255,255,0.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grd; ctx.fillRect(0, 0, 64, 64);
      ct.refresh();
    }
    this.textures.get('glow').setFilter(Phaser.Textures.FilterMode.LINEAR);

    Object.keys(HEROES).forEach((id) => {
      Object.entries(DIR_COL).forEach(([dir, col]) => {
        this.anims.create({ key: `${id}-walk-${dir}`, frames: this.anims.generateFrameNumbers('hero_' + id, { frames: [col, 4 + col, 8 + col, 12 + col] }), frameRate: 9, repeat: -1 });
      });
    });
    this.anims.create({ key: 'dog-walk', frames: this.anims.generateFrameNumbers('dog', { frames: [0, 1] }), frameRate: 8, repeat: -1 });
    FX_USED.forEach((n) => {
      this.anims.create({ key: 'fx' + n, frames: this.anims.generateFrameNumbers('fx' + n), frameRate: 16, repeat: 0 });
    });
  }

  buildGround() {
    const { cols, rows } = this.map;
    const rt = this.add.renderTexture(0, 0, cols * 16, rows * 16).setOrigin(0, 0).setScale(SCALE).setDepth(-1000);
    const stamp = this.make.image({ key: 'floor', add: false }).setOrigin(0, 0);
    const rng = mulberry32(1337);
    const isIn = (list, c, r, pad = 0) => list.some((a) => c >= a.x - pad && c < a.x + a.w + pad && r >= a.y - pad && r < a.y + a.h + pad);
    rt.beginDraw();
    const draw = (tex, frame, x, y) => { stamp.setTexture(tex, frame); rt.batchDraw(stamp, x, y); };
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const v = rng();
        draw('floor', v < 0.72 ? 'g0' : 'g' + (1 + Math.floor(rng() * (GROUND.grass.length - 1))), c * 16, r * 16);
      }
    }
    const nine = (rect, tex, prefix) => {
      for (let r = rect.y; r < rect.y + rect.h; r++) {
        for (let c = rect.x; c < rect.x + rect.w; c++) {
          const top = r === rect.y, bot = r === rect.y + rect.h - 1, left = c === rect.x, right = c === rect.x + rect.w - 1;
          const k = top ? (left ? 'tl' : right ? 'tr' : 't') : bot ? (left ? 'bl' : right ? 'br' : 'b') : (left ? 'l' : right ? 'r' : 'c');
          draw(tex, prefix + k, c * 16, r * 16);
        }
      }
    };
    // dirt: draw each rect as a full 9-slice, then re-fill overlaps with the center tile so roads join cleanly
    this.map.dirt.forEach((d) => nine(d, 'floor', 'd_'));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const inside = this.map.dirt.filter((d) => c >= d.x && c < d.x + d.w && r >= d.y && r < d.y + d.h);
        if (inside.length > 1) draw('floor', 'd_c', c * 16, r * 16);
        else if (inside.length === 1) {
          const d = inside[0];
          const edge = r === d.y || r === d.y + d.h - 1 || c === d.x || c === d.x + d.w - 1;
          if (edge) {
            const n = (cc, rr) => this.map.dirt.some((o) => o !== d && cc >= o.x && cc < o.x + o.w && rr >= o.y && rr < o.y + o.h);
            if (n(c, r - 1) || n(c, r + 1) || n(c - 1, r) || n(c + 1, r)) draw('floor', 'd_c', c * 16, r * 16);
          }
        }
      }
    }
    this.map.ponds.forEach((p) => nine(p, 'tiles', 'p_'));
    this.map.ponds.forEach((p) => { if (p.w > 3) draw('tiles', 'lily', (p.x + 1 + Math.floor(rng() * (p.w - 2))) * 16, (p.y + 1) * 16); });
    for (let i = 0; i < 160; i++) {
      const c = Math.floor(rng() * cols), r = Math.floor(rng() * rows);
      if (isIn(this.map.dirt, c, r) || isIn(this.map.ponds, c, r, 1)) continue;
      const kind = rng() < 0.45 ? 'flower' : rng() < 0.6 ? 'grass' : 'fern';
      draw('tiles', kind, c * 16 + Math.floor(rng() * 6), r * 16 + Math.floor(rng() * 6));
    }
    rt.endDraw();
    stamp.destroy();

    this.map.ponds.forEach((p) => {
      for (let i = 0; i < p.w * 2; i++) {
        const s = this.add.rectangle((p.x + 0.6 + Math.random() * (p.w - 1.2)) * 48, (p.y + 0.6 + Math.random() * (p.h - 1.2)) * 48, 12, 3, 0xffffff, 0.5).setDepth(-950);
        this.tweens.add({ targets: s, alpha: { from: 0, to: 0.55 }, x: s.x + 14, duration: 1200 + Math.random() * 900, yoyo: true, repeat: -1, delay: Math.random() * 1500 });
      }
    });
  }

  buildObjects() {
    this.objectViews = this.map.objects.map((o) => {
      const f = OBJECT_FRAMES[o.kind];
      const img = this.add.image(o.x, o.y, f.tex, o.kind).setOrigin(0.5, 1).setScale(SCALE).setDepth(o.y);
      if (o.kind === 'tree' || o.kind === 'tree2' || o.kind === 'pine' || o.kind === 'cluster') {
        this.tweens.add({ targets: img, scaleX: SCALE * 1.02, duration: 1800 + Math.random() * 800, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      }
      return { o, img, big: BIG_OBJECTS.has(o.kind), w: f.w * SCALE, h: f.h * SCALE };
    });
    this.bushViews = this.map.bushes.map((b) => {
      const imgs = [-22, 22].map((dx, i) => {
        const im = this.add.image(b.x + dx, b.y + 26 - i * 6, 'village', 'bush').setOrigin(0.5, 1).setScale(SCALE * 0.9).setDepth(b.y + 30);
        this.tweens.add({ targets: im, angle: { from: -2, to: 2 }, duration: 1400 + i * 300, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
        return im;
      });
      return { b, imgs };
    });
    this.propViews = new Map();
    this.map.props.forEach((p) => {
      const img = this.add.image(p.x, p.y, 'tiles', p.kind).setOrigin(0.5, 1).setScale(SCALE).setDepth(p.y);
      this.propViews.set(p.id, img);
    });
  }

  // ---------------------------------------------------------------- input
  setupInput() {
    this.input.keyboard.on('keydown', (e) => this.onKey(e, true));
    this.input.keyboard.on('keyup', (e) => this.onKey(e, false));
    this.input.on('pointerdown', (p) => {
      if (p.wasTouch || this.touch) return; // touch devices use the DOM controls (touch.js)
      if (p.leftButtonDown()) this.cast('strike');
    });
    this.hud.hotbar.addEventListener('pointerdown', (e) => {
      const slot = e.target.closest('.slot');
      if (slot) { e.preventDefault(); e.stopPropagation(); this.cast(slot.dataset.cast); }
    });
  }

  onKey(e, down) {
    const a = CODE_TO_ACTION[e.code];
    if (!a) return;
    if (a === 'up' || a === 'down' || a === 'left' || a === 'right') { this.keys[a] = down; return; }
    if (a === 'basic') e.preventDefault();
    if (!down || e.repeat) return;
    const me = this.room.state.players.get(this.myId);
    if (!me) return;
    if (a === 'basic') this.cast('strike');
    else if (a === 'legend') this.cast(me.legend);
    else if (a === 'mythic') this.cast(me.mythic);
    else this.cast(me.abilities[Number(a.slice(4))]);
  }

  nearestEnemy(me, maxD = 700) {
    let best = null, bd = maxD;
    this.room.state.players.forEach((p) => {
      if (p.id === this.myId || !p.alive || (p.hidden && Math.hypot(p.x - me.x, p.y - me.y) > 150)) return;
      const d = Math.hypot(p.x - me.x, p.y - me.y);
      if (d < bd) { bd = d; best = p; }
    });
    return best;
  }

  updateAim() {
    if (this.touch) return;
    const p = this.input.activePointer;
    if (!p) return;
    const w = this.cameras.main.getWorldPoint(p.x, p.y);
    this.aimWorld = { x: w.x, y: w.y };
  }

  cast(abilityId, tx, ty) {
    if (!abilityId) return;
    const me = this.room.state.players.get(this.myId);
    if (!me || !me.alive) return;
    if (tx === undefined) {
      if (this.touch) { const t = this.touchTarget(me, abilityId, 0, 0, 110); tx = t.x; ty = t.y; }
      else { this.updateAim(); tx = this.aimWorld.x; ty = this.aimWorld.y; }
    }
    this.room.send('cast', { abilityId, tx, ty });
  }

  // tap = auto-aim at nearest enemy (or straight ahead); drag = manual direction + distance
  touchTarget(me, id, dx, dy, aimR) {
    const def = defOf(id) || {};
    const range = def.range || (def.radius && def.self ? def.radius : 600);
    const len = Math.hypot(dx, dy);
    if (len < 18) {
      const e = this.nearestEnemy(me, range + 80);
      if (e) return { x: e.x, y: e.y, auto: true };
      const v = this.views.get(this.myId);
      const [fx, fy] = DIR_VEC[v ? v.dir : 'down'];
      const d = Math.min(range, 320);
      return { x: me.x + fx * d, y: me.y + fy * d };
    }
    const k = clampNum(len / aimR, 0.2, 1) * range;
    return { x: me.x + dx / len * k, y: me.y + dy / len * k };
  }

  touchCast(id, dx, dy, aimR) {
    const me = this.room.state.players.get(this.myId);
    if (!me || !me.alive) return;
    const t = this.touchTarget(me, id, dx, dy, aimR);
    this.cast(id, t.x, t.y);
  }

  drawAim(me) {
    const g = this.gfxAim;
    g.clear();
    if (!this.touch || !this.touch.aim || !me || !me.alive) return;
    const { id, dx, dy } = this.touch.aim;
    const def = defOf(id);
    if (!def) return;
    const v = this.views.get(this.myId);
    const x = v ? v.x : me.x, y = v ? v.y : me.y;
    const color = def.color || 0xffffff;
    if (def.self && !def.range) {
      const r = def.radius || 70;
      g.fillStyle(color, 0.12); g.fillCircle(x, y, r);
      g.lineStyle(3, color, 0.8); g.strokeCircle(x, y, r);
      return;
    }
    const t = this.touchTarget(me, id, dx, dy, this.touch.aimRadius);
    if (def.range) { g.lineStyle(2, 0xffffff, 0.15); g.strokeCircle(x, y, def.range); }
    g.lineStyle(6, color, 0.25); g.lineBetween(x, y - 10, t.x, t.y);
    g.lineStyle(2, 0xffffff, 0.9); g.lineBetween(x, y - 10, t.x, t.y);
    const r = def.radius && def.radius > 20 ? def.radius : 26;
    g.fillStyle(color, 0.18); g.fillCircle(t.x, t.y, r);
    g.lineStyle(3, color, 0.95); g.strokeCircle(t.x, t.y, r);
  }

  // ---------------------------------------------------------------- network messages
  setupMessages() {
    const r = this.room;
    r.onMessage('cast', (m) => this.onCast(m));
    r.onMessage('impact', (m) => this.onImpact(m));
    r.onMessage('combo', (m) => {
      const c = COMBOS[m.id]; if (!c) return;
      const col = Phaser.Display.Color.HexStringToColor(c.color).color;
      this.floatText(m.x, m.y - 70, c.nameAr, c.color, 26);
      this.playFx(3, m.x, m.y - 10, 4.5, col);
      this.shockwave(m.x, m.y, 110, col, 420);
      this.burst(m.x, m.y - 10, col, { count: 18, speedMax: 280, scale: 1.3 });
      this.shake(m.x, m.y, 120, 0.006);
      playSfx('upgrade');
    });
    r.onMessage('crit', (m) => this.floatText(m.x + 20, m.y - 56, 'حرجة!', '#ffd166', 18));
    r.onMessage('bolts', (m) => this.onBolts(m));
    r.onMessage('chain', (m) => {
      const pts = m.points || [];
      for (let i = 1; i < pts.length; i++) {
        this.time.delayedCall((i - 1) * 60, () => {
          this.drawBolt(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y, 0x9fd8ff, true);
          this.playFx(19, pts[i].x, pts[i].y, 3.6, 0x9fd8ff);
          this.burst(pts[i].x, pts[i].y, 0xdff4ff, { count: 12, speedMax: 240 });
        });
      }
      playSfx('impact');
    });
    r.onMessage('hop', (m) => {
      const v = this.views.get(m.casterId);
      if (v) { this.playFx(18, v.x, v.y - 20, 3.5, 0x9d7bff); v.x = m.x; v.y = m.y; }
      this.playFx(7, m.tx, m.ty - 20, 4.5, 0xb9a6ff); this.playFx(18, m.x, m.y - 20, 3, 0x9d7bff);
      this.shockwave(m.tx, m.ty, 90, 0x9d7bff, 300);
      this.shake(m.tx, m.ty, 110, 0.006);
    });
    r.onMessage('propBreak', (m) => {
      this.playFx(18, m.x, m.y - 20, 3.2, 0xc28e5c);
      this.burst(m.x, m.y - 20, 0xa8683a, { count: 20, speedMax: 260, scale: 1.4, gravity: 500, tex: 'pixel' });
      playSfx('impact');
    });
    r.onMessage('trapPlaced', (m) => this.myTraps.push(m));
    r.onMessage('killfeed', (m) => { this.pushFeed(`⚔ ${m.killer} قتل ${m.victim}`); playSfx('killfeed'); });
    r.onMessage('steal', (m) => {
      const p = PASSIVES[m.passiveId];
      if (m.playerId === this.myId) this.toast(`${p ? p.icon : '✨'} سرقت <b>${p ? p.nameAr : m.passiveId}</b> من ${m.fromName}!`, 3200);
      else this.pushFeed(`🗡 ${m.playerName} سرق ${p ? p.icon + ' ' + p.nameAr : ''} من ${m.fromName}`);
    });
    r.onMessage('death', (m) => {
      const v = this.views.get(m.victimId);
      const x = v ? v.x : m.x, y = v ? v.y : m.y;
      this.playFx(18, x, y - 20, 5, 0xdddddd);
      this.shockwave(x, y, 100, 0xff4d4d, 450);
      this.burst(x, y - 20, 0xff4d4d, { count: 34, speedMax: 320, scale: 1.6, gravity: 300 });
      if (m.victimId === this.myId) { playSfx('death'); this.toast('💀 تم إقصاؤك — شاهد باقي الجولة', 3500); }
      else if (!m.killerName) this.pushFeed(`☠ ${this.nameOf(m.victimId)} سقط خارج المنطقة الآمنة`);
    });
    r.onMessage('champion', (m) => {
      const v = this.views.get(m.id);
      if (v) {
        this.playFx(3, v.x, v.y - 30, 6, 0xffd166);
        this.shockwave(v.x, v.y, 180, 0xffd166, 700);
        this.burst(v.x, v.y - 30, 0xffd166, { count: 40, speedMax: 340, scale: 1.5 });
      }
      if (m.id === this.myId) { this.toast('👑 <b>أنت البطل الأقوى!</b> أكبر وأقوى — بس الكل رح يطاردك', 3800); this.punchZoom(0.12); }
      else this.showBanner(`👑 ${m.name} صار البطل الأقوى (${m.kills} قتلات) — اقتله واكسب قدرة خارقة!`, 3500);
      playSfx('boss_warning');
    });
    r.onMessage('mythic', (m) => {
      const def = MYTHICS[m.mythicId];
      const v = this.views.get(m.playerId);
      if (v) {
        this.castCircle(v.x, v.y, def ? def.color : 0xffffff, 150);
        this.playFx(4, v.x, v.y - 30, 7, def ? def.color : 0xffffff);
        this.burst(v.x, v.y - 30, def ? def.color : 0xffffff, { count: 50, speedMax: 380, scale: 1.6 });
      }
      this.cameras.main.flash(250, 255, 240, 200);
      if (m.playerId === this.myId) {
        this.toast(`<div style="${def ? iconStyle(def.icon, 36) : ''}"></div><div>⚡ قتلت البطل <b>${m.victimName}</b> وكسبت <b>${def ? def.nameAr : m.mythicId}</b>!<br/>${this.touch ? 'استخدمها من الزر البنفسجي' : 'اضغط E لاستخدامها'}</div>`, 5000);
        this.punchZoom(0.15);
      } else this.showBanner(`⚡ ${m.playerName} أسقط البطل وكسب ${def ? def.nameAr : ''}!`, 3500);
      playSfx('victory');
    });
    r.onMessage('timeStop', (m) => {
      this.timeStop = { id: m.id, name: m.name, until: performance.now() + m.ms };
      const v = this.views.get(m.id);
      if (v) { this.shockwave(v.x, v.y, 900, 0xffe27a, 800); this.castCircle(v.x, v.y, 0xffe27a, 180); }
      this.cameras.main.flash(180, 255, 255, 255);
      this.shake(v ? v.x : 0, v ? v.y : 0, 250, 0.01, true);
      this.punchZoom(0.1);
      playSfx('world_event');
    });
    r.onMessage('rewind', (m) => this.onRewind(m));
    r.onMessage('swap', (m) => this.onSwap(m));
    r.onMessage('zone', (m) => {
      const now = performance.now();
      this.zones.push({ ...m, start: now, until: now + m.ms });
      const color = m.type === 'bubble' ? 0x8fd0ff : 0xff5bd8;
      this.shockwave(m.x, m.y, m.r, color, 500);
      this.playFx(m.type === 'bubble' ? 3 : 17, m.x, m.y - 20, 6, color);
      playSfx('cast_control');
    });
    r.onMessage('flip', (m) => {
      let best = null, bd = 120;
      this.projectiles.forEach((p) => { const d = Math.hypot(p.x - m.x, p.y - m.y); if (d < bd) { bd = d; best = p; } });
      if (best) { best.dir.set(m.dx, m.dy); best.travelled = 0; best.img.setRotation(Math.atan2(m.dy, m.dx)); best.flipped = true; }
      this.playFx(17, m.x, m.y, 3, 0xff5bd8);
      this.floatText(m.x, m.y - 30, '🔄', '#ff5bd8', 22);
    });
    r.onMessage('snap', (m) => {
      this.cameras.main.flash(350, 255, 255, 255);
      this.shake(m.x, m.y, 400, 0.014, true);
      this.punchZoom(0.14);
      (m.points || []).forEach((p, i) => this.time.delayedCall(i * 40, () => {
        this.playFx(18, p.x, p.y - 20, 4, 0x999999);
        this.burst(p.x, p.y - 24, 0xc9b28f, { count: 26, speedMin: 20, speedMax: 120, scale: 1.2, gravity: -90, life: 1100, tex: 'pixel' });
        this.burst(p.x, p.y - 24, 0xffffff, { count: 10, speedMax: 200, scale: 1.2 });
      }));
      this.showBanner('🫰 طقة القدر! الكل خسر ثلث صحته', 2600);
      playSfx('impact');
    });
    r.onMessage('worldEvent', (m) => { this.showBanner(WORLD_EVENTS[m.id] || m.id, 2800); playSfx('world_event'); });
    r.onMessage('finalDuel', (m) => this.showBanner(`🗡 المبارزة الأخيرة: ${m.a} ضد ${m.b}`, 3200));
    r.onMessage('matchStart', () => { this.myTraps = []; this.zones = []; this.showBanner('⚔ ابدأ القتال!', 2000); });
    r.onMessage('roundEnd', (m) => this.showRoundEnd(m));
    r.onMessage('map', () => {});
  }

  nameOf(id) { const p = this.room.state.players.get(id); return p ? p.name : '???'; }

  onCast(m) {
    const def = defOf(m.abilityId);
    if (!def) return;
    const now = performance.now();
    const v = this.views.get(m.casterId);
    if (v) {
      v.castUntil = now + 260;
      const dx = m.tx - m.x, dy = m.ty - m.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) v.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    }
    const color = def.color || 0xffffff;
    const id = m.abilityId;
    const mine = m.casterId === this.myId;
    const big = !!(LEGENDS[id] || MYTHICS[id]);
    if (big) {
      this.castCircle(m.x, m.y, color, MYTHICS[id] ? 130 : 95);
      this.floatText(m.x, m.y - 90, def.nameAr, '#' + color.toString(16).padStart(6, '0'), MYTHICS[id] ? 24 : 19);
      if (mine) this.punchZoom(MYTHICS[id] ? 0.08 : 0.05);
    }
    if (PROJECTILE[id]) {
      const cfg = PROJECTILE[id];
      const dir = new Phaser.Math.Vector2(m.tx - m.x, m.ty - m.y);
      if (dir.lengthSq() === 0) dir.set(1, 0);
      dir.normalize();
      const img = this.add.image(m.x, m.y - 10, cfg.tex).setScale(cfg.scale).setDepth(4000).setRotation(Math.atan2(dir.y, dir.x));
      if (cfg.tint) img.setTint(cfg.tint);
      const glow = cfg.glow ? this.add.image(m.x, m.y - 10, 'glow').setTint(cfg.glow).setBlendMode(Phaser.BlendModes.ADD).setScale(cfg.glowScale).setAlpha(0.8).setDepth(3999) : null;
      if (cfg.delay) { img.setVisible(false); if (glow) glow.setVisible(false); this.telegraphLine = { casterId: m.casterId, dir, until: now + cfg.delay, color }; }
      this.projectiles.push({ id, img, glow, x: m.x, y: m.y - 10, dir, speed: def.speed || 700, range: def.range || 700, travelled: 0, cfg, startAt: now + (cfg.delay || 0), casterId: m.casterId, returning: false });
      if (v && id !== 'strike') this.playFx(8, m.x + dir.x * 26, m.y - 14 + dir.y * 26, 1.6, color);
      playSfx(id === 'strike' ? 'cast_mobility' : 'cast_offensive');
      return;
    }
    switch (id) {
      case 'lightning': case 'earth_prison': case 'ice_age':
        this.telegraphs.push({ x: m.tx, y: m.ty, r: def.radius, color, start: now, dur: def.telegraph });
        playSfx('cast_control'); break;
      case 'ground_slam':
        this.telegraphs.push({ x: m.tx, y: m.ty, r: def.radius, color, start: now, dur: def.telegraph });
        if (v) { v.jump = 0; this.tweens.add({ targets: v, jump: 1, duration: def.telegraph }); }
        playSfx('cast_area'); break;
      case 'meteor_storm':
        this.telegraphs.push({ x: m.tx, y: m.ty, r: 170 + def.radius, color, start: now, dur: def.telegraph + 1600 });
        playSfx('cast_area'); break;
      case 'black_hole':
        this.auras.push({ kind: 'vortex', x: m.tx, y: m.ty, start: now, dur: def.telegraph, color, r: def.pullRadius });
        playSfx('cast_control'); break;
      case 'thunderstorm':
        this.auras.push({ kind: 'storm', followId: m.casterId, start: now, dur: def.telegraph, color, r: def.radius });
        playSfx('cast_area'); break;
      case 'gust': case 'tsunami': {
        const dir = new Phaser.Math.Vector2(m.tx - m.x, m.ty - m.y);
        if (dir.lengthSq() === 0) dir.set(1, 0);
        dir.normalize();
        this.waves.push({ id, ox: m.x, oy: m.y, dir, speed: def.speed, width: def.width, length: def.length, color, start: now + (def.telegraph || 0), lastSpawn: 0 });
        playSfx('cast_area'); break;
      }
      case 'dash':
        this.playFx(18, m.x, m.y - 16, 2.6, 0xb9a6ff);
        this.ghostTrail(v, m.x, m.y, m.tx, m.ty, 0x9d7bff, 5);
        if (v) { v.x = m.tx; v.y = m.ty; }
        playSfx('cast_mobility'); break;
      case 'space_portal':
        this.ghostTrail(v, m.x, m.y, m.tx, m.ty, 0x9d7bff, 3);
        if (v) { v.x = m.tx; v.y = m.ty; }
        playSfx('cast_mobility'); break;
      case 'shield':
        this.auras.push({ kind: 'bubble', followId: m.casterId, start: now, dur: 2200, color: 0xffd166 });
        this.playFx(4, m.x, m.y - 22, 3, 0xffd166);
        playSfx('cast_defensive'); break;
      case 'kings_fortress':
        this.auras.push({ kind: 'bubble', followId: m.casterId, start: now, dur: 3000, color: 0xffd166, big: true });
        this.playFx(3, m.x, m.y - 20, 6, 0xffd166);
        this.shockwave(m.x, m.y, 140, 0xffd166, 500);
        playSfx('cast_defensive'); break;
      case 'heal_spring':
        this.auras.push({ kind: 'heal', followId: m.casterId, start: now, dur: 2000, color: 0x7dffb0 });
        this.playFx(5, m.x, m.y - 20, 3.5, 0x7dffb0);
        playSfx('cast_defensive'); break;
      case 'berserk':
        this.auras.push({ kind: 'rage', followId: m.casterId, start: now, dur: 5000, color: 0xff4040 });
        this.playFx(12, m.x, m.y - 24, 4, 0xff4040);
        this.shockwave(m.x, m.y, 90, 0xff4040, 350);
        this.floatText(m.x, m.y - 70, '😡 غضب!', '#ff5050', 20);
        playSfx('cast_offensive'); break;
      case 'time_rewind':
        this.playFx(13, m.x, m.y - 20, 4, 0x7fe0ff);
        playSfx('cast_mobility'); break;
      case 'destiny_snap':
        this.auras.push({ kind: 'snap', followId: m.casterId, start: now, dur: 900, color: 0xffffff });
        this.showBanner(`🫰 ${this.nameOf(m.casterId)} رح يطقّ أصابعه...`, 1000);
        playSfx('boss_warning'); break;
      case 'reality_warp':
        playSfx('cast_control'); break;
      case 'trap': case 'dragon_breath': case 'shadow_strike':
        playSfx(id === 'dragon_breath' ? 'cast_area' : 'cast_mobility'); break;
      default: break;
    }
  }

  onImpact(m) {
    const t = m.type;
    const removeNear = (id) => {
      let best = -1, bd = 90;
      this.projectiles.forEach((p, i) => { if ((id === null || p.id === id) && !p.cfg.pierce) { const d = Math.hypot(p.x - m.x, p.y - m.y); if (d < bd) { bd = d; best = i; } } });
      if (best >= 0) { this.killProjectile(this.projectiles[best]); this.projectiles.splice(best, 1); }
    };
    if (t === 'poof') { removeNear(null); this.playFx(18, m.x, m.y, 1.8, 0xcccccc); return; }
    if (PROJECTILE[t]) {
      removeNear(t);
      const color = defOf(t).color;
      const heavy = t === 'fate_arrow';
      this.playFx(8, m.x, m.y, heavy ? 6 : t === 'strike' ? 2 : 3.2, color);
      this.burst(m.x, m.y, color, { count: heavy ? 30 : 12, speedMax: heavy ? 320 : 200, scale: heavy ? 1.6 : 1 });
      if (t === 'fireball') { this.playFx(12, m.x, m.y - 10, 3.2, null); this.shockwave(m.x, m.y, 70, 0xff7a3c, 300); }
      if (t === 'poison_dagger') this.burst(m.x, m.y, 0x9be25a, { count: 10, speedMax: 90, gravity: -80, life: 800 });
      if (t === 'vine_pull') { this.playFx(16, m.x, m.y, 3, 0x7ccf4a); }
      if (t !== 'strike') this.shake(m.x, m.y, heavy ? 200 : 70, heavy ? 0.012 : 0.003);
      return;
    }
    switch (t) {
      case 'lightning':
        this.drawBolt(m.x, m.y - 520, m.x, m.y, 0xfff27a, true);
        this.playFx(19, m.x, m.y - 20, 6, 0xfff27a);
        this.shockwave(m.x, m.y, 90, 0xfff27a, 300);
        this.burst(m.x, m.y, 0xfff27a, { count: 22, speedMax: 300 });
        this.shake(m.x, m.y, 140, 0.008); playSfx('impact'); break;
      case 'earth':
        this.playFx(18, m.x, m.y - 10, 10, 0xa0703f);
        this.shockwave(m.x, m.y, m.radius, 0xc28e5c, 450);
        this.burst(m.x, m.y, 0x8a5a2b, { count: 40, speedMax: 360, scale: 1.6, gravity: 600, tex: 'pixel' });
        this.groundMarks.push({ x: m.x, y: m.y, r: m.radius, color: 0x4f7a2a, start: performance.now(), dur: 2400, vines: true });
        this.shake(m.x, m.y, 200, 0.011); playSfx('impact'); break;
      case 'slam':
        this.playFx(18, m.x, m.y - 10, 9, 0xc9a06a);
        this.shockwave(m.x, m.y, m.radius || 160, 0xffe0a0, 380);
        this.shockwave(m.x, m.y, (m.radius || 160) * 0.6, 0xc9a06a, 300);
        this.burst(m.x, m.y, 0x8a5a2b, { count: 36, speedMax: 340, scale: 1.5, gravity: 700, tex: 'pixel' });
        this.groundMarks.push({ x: m.x, y: m.y, r: (m.radius || 160) * 0.7, color: 0x3a2814, start: performance.now(), dur: 2500 });
        this.shake(m.x, m.y, 220, 0.013); playSfx('impact'); break;
      case 'meteor': {
        const rock = this.add.image(m.x + 140, m.y - 520, 'fireball').setScale(9).setDepth(5500).setRotation(Math.atan2(520, -140));
        const glow = this.add.image(m.x + 140, m.y - 520, 'glow').setTint(0xff7a3c).setBlendMode(Phaser.BlendModes.ADD).setScale(3).setDepth(5499);
        this.tweens.add({ targets: [rock, glow], x: m.x, y: m.y, duration: 130, onComplete: () => { rock.destroy(); glow.destroy(); } });
        this.time.delayedCall(130, () => {
          this.playFx(12, m.x, m.y - 30, 7.5, null);
          this.shockwave(m.x, m.y, m.radius || 85, 0xff6a3d, 380);
          this.burst(m.x, m.y, 0xff6a3d, { count: 34, speedMax: 380, scale: 1.8 });
          this.groundMarks.push({ x: m.x, y: m.y, r: (m.radius || 85) * 0.9, color: 0x2a1a10, start: performance.now(), dur: 5000 });
          this.shake(m.x, m.y, 230, 0.015); playSfx('impact');
        });
        break;
      }
      case 'ice':
        this.playFx(14, m.x, m.y - 20, 13, 0x9fe8ff);
        this.shockwave(m.x, m.y, m.radius, 0xcff6ff, 500);
        this.burst(m.x, m.y, 0xcff6ff, { count: 50, speedMax: 440, scale: 1.4 });
        this.groundMarks.push({ x: m.x, y: m.y, r: m.radius, color: 0x9fe8ff, start: performance.now(), dur: 2800, alpha: 0.32 });
        this.shake(m.x, m.y, 190, 0.01); playSfx('impact'); break;
      case 'splash':
        this.playFx(15, m.x, m.y - 20, 7, null);
        this.shockwave(m.x, m.y, m.radius || 140, 0x4cb6ff, 380);
        this.burst(m.x, m.y, 0x4cb6ff, { count: 30, speedMax: 320, gravity: 400 });
        playSfx('cast_mobility'); break;
      case 'blackhole':
        this.playFx(1, m.x, m.y - 10, 13, 0xb388ff);
        this.shockwave(m.x, m.y, 300, 0xb388ff, 600);
        this.burst(m.x, m.y, 0xb388ff, { count: 50, speedMax: 440, scale: 1.6 });
        this.shake(m.x, m.y, 260, 0.015); playSfx('impact'); break;
      case 'breath': {
        const base = Math.atan2(m.dy, m.dx);
        for (let i = 0; i < 9; i++) {
          const a = base + (Math.random() - 0.5) * 1.2, d = 60 + Math.random() * (m.radius - 60);
          this.playFx(20, m.x + Math.cos(a) * d, m.y - 16 + Math.sin(a) * d, 4.5 + Math.random() * 3, null);
        }
        const e = this.add.particles(m.x, m.y - 16, 'spark', { angle: { min: Phaser.Math.RadToDeg(base) - 36, max: Phaser.Math.RadToDeg(base) + 36 }, speed: { min: 340, max: 720 }, lifespan: 520, scale: { start: 2.2, end: 0 }, tint: [0xffd166, 0xff7a3c, 0xff3d1f], blendMode: 'ADD', emitting: false }).setDepth(5000);
        e.explode(Math.round(60 * this.fxMul)); this.time.delayedCall(650, () => e.destroy());
        this.shake(m.x, m.y, 100, 0.005);
        playSfx('cast_area'); break;
      }
      case 'warp':
        this.shockwave(m.x, m.y, m.radius || 480, 0xff6bf0, 700);
        this.playFx(17, m.x, m.y - 20, 10, 0xff6bf0);
        for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; this.playFx(17, m.x + Math.cos(a) * 200, m.y + Math.sin(a) * 120, 4, 0xff9bf5); }
        this.burst(m.x, m.y - 20, 0xff6bf0, { count: 50, speedMax: 480, scale: 1.6 });
        this.cameras.main.flash(120, 255, 150, 240);
        this.shake(m.x, m.y, 220, 0.012); playSfx('impact'); break;
      case 'portal':
        this.playFx(14, m.x, m.y - 20, 8, 0x9d7bff);
        this.auras.push({ kind: 'portal', x: m.x, y: m.y, start: performance.now(), dur: 900, color: 0x9d7bff, r: m.radius || 140 });
        this.shockwave(m.x, m.y, m.radius || 140, 0xc9b5ff, 420);
        this.burst(m.x, m.y - 20, 0x9d7bff, { count: 36, speedMax: 360, scale: 1.5 });
        this.shake(m.x, m.y, 180, 0.01); playSfx('impact'); break;
      case 'heal':
        this.playFx(5, m.x, m.y, 4, 0x7dffb0);
        this.burst(m.x, m.y, 0x7dffb0, { count: 16, speedMax: 140 });
        break;
      case 'trap':
        this.playFx(16, m.x, m.y - 10, 4.5, 0x9ccc65);
        this.groundMarks.push({ x: m.x, y: m.y, r: 50, color: 0x4f7a2a, start: performance.now(), dur: 1600, vines: true });
        this.myTraps = this.myTraps.filter((k) => Math.hypot(k.x - m.x, k.y - m.y) > 5);
        playSfx('impact'); break;
      default: break;
    }
  }

  onBolts(m) {
    this.playFx(19, m.x, m.y - 30, 7, 0xfff27a);
    m.points.forEach((p, i) => this.time.delayedCall(i * 70, () => {
      this.drawBolt(p.x + (Math.random() - 0.5) * 60, p.y - 560, p.x, p.y - 10, 0xfff27a, true);
      this.playFx(19, p.x, p.y - 20, 5, 0xfff27a);
      this.shockwave(p.x, p.y, 70, 0xfff27a, 260);
      this.burst(p.x, p.y, 0xfff9b0, { count: 14, speedMax: 260 });
    }));
    this.cameras.main.flash(140, 255, 250, 200);
    this.shake(m.x, m.y, 200, 0.01);
    playSfx('impact');
  }

  onRewind(m) {
    const v = this.views.get(m.id);
    const path = m.path || [];
    if (v && path.length) {
      const key = v.sprite.texture.key, frame = v.sprite.frame.name;
      path.forEach((pt, i) => this.time.delayedCall(i * 22, () => {
        const ghost = this.add.image(pt.x, pt.y + 8, key, frame).setOrigin(0.5, 1).setScale(v.sprite.scaleX).setTintFill(0x7fe0ff).setAlpha(0.55).setDepth(pt.y);
        this.tweens.add({ targets: ghost, alpha: 0, duration: 520, onComplete: () => ghost.destroy() });
      }));
      const end = path[path.length - 1];
      const g = this.add.graphics().setDepth(4900);
      g.lineStyle(4, 0x7fe0ff, 0.8); g.beginPath(); g.moveTo(path[0].x, path[0].y); path.forEach((p) => g.lineTo(p.x, p.y)); g.strokePath();
      this.tweens.add({ targets: g, alpha: 0, duration: 700, onComplete: () => g.destroy() });
      v.x = end.x; v.y = end.y;
      this.castCircle(end.x, end.y, 0x7fe0ff, 90);
      this.playFx(13, end.x, end.y - 20, 4.5, 0x7fe0ff);
      this.floatText(end.x, end.y - 80, '⏪ رجوع بالزمن', '#7fe0ff', 18);
    }
    if (m.id === this.myId) this.cameras.main.flash(160, 120, 220, 255);
    playSfx('cast_mobility');
  }

  onSwap(m) {
    const a = this.views.get(m.aId), b = this.views.get(m.bId);
    const g = this.add.graphics().setDepth(5400);
    [[14, 0xd07bff, 0.35], [5, 0xd07bff, 1], [2, 0xffffff, 1]].forEach(([w, c, al]) => { g.lineStyle(w, c, al); g.lineBetween(m.ax, m.ay - 20, m.bx, m.by - 20); });
    this.tweens.add({ targets: g, alpha: 0, duration: 450, onComplete: () => g.destroy() });
    [[m.ax, m.ay], [m.bx, m.by]].forEach(([x, y]) => { this.playFx(5, x, y - 20, 5, 0xd07bff); this.shockwave(x, y, 80, 0xd07bff, 320); });
    if (a) { a.x = m.ax; a.y = m.ay; }
    if (b) { b.x = m.bx; b.y = m.by; }
    this.floatText((m.ax + m.bx) / 2, (m.ay + m.by) / 2 - 60, '🌀 تبديل!', '#d07bff', 22);
    if (m.aId === this.myId || m.bId === this.myId) { this.cameras.main.flash(160, 210, 120, 255); this.punchZoom(0.08); }
    playSfx('cast_control');
  }

  // ---------------------------------------------------------------- fx helpers
  playFx(n, x, y, scale = 2, tint = null) {
    const s = this.add.sprite(x, y, 'fx' + n).setScale(scale).setDepth(5200);
    if (tint !== null && tint !== undefined) s.setTint(tint);
    s.play('fx' + n);
    s.once('animationcomplete', () => s.destroy());
    return s;
  }

  burst(x, y, color, o = {}) {
    const count = Math.max(1, Math.round((o.count ?? 12) * (o.count > 1 ? this.fxMul : 1)));
    const life = o.life ?? 560;
    const e = this.add.particles(x, y, o.tex || 'spark', {
      lifespan: life, speed: { min: o.speedMin ?? 40, max: o.speedMax ?? 200 }, scale: { start: o.scale ?? 1, end: 0 },
      alpha: { start: 1, end: 0 }, tint: color, gravityY: o.gravity || 0, blendMode: o.tex === 'pixel' ? 'NORMAL' : 'ADD', emitting: false,
    }).setDepth(5100);
    e.explode(count);
    this.time.delayedCall(life + 80, () => e.destroy());
  }

  // expanding ring on the ground
  shockwave(x, y, r, color, dur = 400) {
    const g = this.add.graphics().setDepth(4950).setPosition(x, y);
    g.lineStyle(10, color, 0.35); g.strokeEllipse(0, 0, 2, 1.3);
    g.lineStyle(4, color, 1); g.strokeEllipse(0, 0, 2, 1.3);
    g.fillStyle(color, 0.12); g.fillEllipse(0, 0, 2, 1.3);
    g.setScale(0.1);
    this.tweens.add({ targets: g, scaleX: r, scaleY: r, alpha: { from: 1, to: 0 }, duration: dur, ease: 'Cubic.out', onComplete: () => g.destroy() });
  }

  // rotating magic circle under a caster (legendary / mythic casts)
  castCircle(x, y, color, size = 100) {
    const g = this.add.graphics().setDepth(-880).setPosition(x, y);
    g.lineStyle(4, color, 0.95); g.strokeCircle(0, 0, size);
    g.lineStyle(2, color, 0.8); g.strokeCircle(0, 0, size * 0.78);
    for (let i = 0; i < 6; i++) {
      const a1 = i / 6 * Math.PI * 2, a2 = (i + 2) / 6 * Math.PI * 2;
      g.lineBetween(Math.cos(a1) * size * 0.78, Math.sin(a1) * size * 0.78, Math.cos(a2) * size * 0.78, Math.sin(a2) * size * 0.78);
    }
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; g.fillStyle(color, 1); g.fillCircle(Math.cos(a) * size * 0.89, Math.sin(a) * size * 0.89, 3); }
    g.fillStyle(color, 0.12); g.fillCircle(0, 0, size);
    g.setScale(0.3, 0.18);
    this.tweens.add({ targets: g, scaleX: 1, scaleY: 0.6, duration: 220, ease: 'Back.out' });
    this.tweens.add({ targets: g, alpha: { from: 1, to: 0 }, delay: 500, duration: 600, onComplete: () => g.destroy() });
    const glow = this.add.image(x, y - 30, 'glow').setTint(color).setBlendMode(Phaser.BlendModes.ADD).setScale(size / 40, size / 30).setAlpha(0.55).setDepth(5050);
    this.tweens.add({ targets: glow, alpha: 0, scaleY: size / 14, duration: 650, onComplete: () => glow.destroy() });
  }

  ghostTrail(v, x1, y1, x2, y2, color, n) {
    if (!v) return;
    for (let i = 1; i <= n; i++) {
      const gx = x1 + (x2 - x1) * i / (n + 1), gy = y1 + (y2 - y1) * i / (n + 1);
      const ghost = this.add.image(gx, gy + 8, v.sprite.texture.key, v.sprite.frame.name).setOrigin(0.5, 1).setScale(v.sprite.scaleX).setTintFill(color).setAlpha(0.5).setDepth(gy);
      this.tweens.add({ targets: ghost, alpha: 0, duration: 420, delay: i * 30, onComplete: () => ghost.destroy() });
    }
  }

  // camera shake scaled by distance to my hero
  shake(x, y, ms, k, global = false) {
    const me = this.room.state.players.get(this.myId);
    const d = global || !me ? 0 : Math.hypot(me.x - x, me.y - y);
    const f = clampNum(1 - d / 700, 0, 1);
    if (f > 0) this.cameras.main.shake(ms, k * f);
  }

  drawBolt(x1, y1, x2, y2, color, thick = false) {
    const g = this.add.graphics().setDepth(5300);
    const segs = 10;
    const pts = [[x1, y1]];
    const jit = Math.min(50, Math.hypot(x2 - x1, y2 - y1) / 8);
    for (let i = 1; i < segs; i++) {
      const nx = -(y2 - y1), ny = x2 - x1, nl = Math.hypot(nx, ny) || 1;
      const off = (Math.random() - 0.5) * jit * 2;
      pts.push([x1 + (x2 - x1) * i / segs + nx / nl * off, y1 + (y2 - y1) * i / segs + ny / nl * off]);
    }
    pts.push([x2, y2]);
    const widths = thick ? [[18, color, 0.3], [7, color, 1], [3, 0xffffff, 1]] : [[10, color, 0.35], [4, color, 1], [2, 0xffffff, 1]];
    widths.forEach(([w, c, a]) => {
      g.lineStyle(w, c, a); g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); pts.forEach(([px, py]) => g.lineTo(px, py)); g.strokePath();
    });
    this.tweens.add({ targets: g, alpha: 0, duration: 300, onComplete: () => g.destroy() });
  }

  floatText(x, y, text, color = '#ffffff', size = 16) {
    const t = this.add.text(x, y, text, { fontFamily: 'Tahoma, Segoe UI', fontSize: size + 'px', fontStyle: 'bold', color, stroke: '#000000', strokeThickness: 5 }).setOrigin(0.5).setDepth(7000).setScale(0.6);
    this.tweens.add({ targets: t, scale: 1, duration: 140, ease: 'Back.out' });
    this.tweens.add({ targets: t, y: y - 50, alpha: { from: 1, to: 0 }, delay: 250, duration: 1000, ease: 'Cubic.out', onComplete: () => t.destroy() });
  }

  killProjectile(p) { p.img.destroy(); if (p.glow) p.glow.destroy(); }

  // ---------------------------------------------------------------- HUD helpers
  pushFeed(text) {
    const el = document.createElement('div');
    el.className = 'k';
    el.textContent = text;
    this.hud.killfeed.prepend(el);
    while (this.hud.killfeed.children.length > (this.touch ? 3 : 6)) this.hud.killfeed.lastChild.remove();
    setTimeout(() => el.remove(), 6500);
  }
  showBanner(text, ms) {
    this.hud.banner.textContent = text;
    this.hud.banner.classList.add('show');
    clearTimeout(this._bannerT);
    this._bannerT = setTimeout(() => this.hud.banner.classList.remove('show'), ms);
  }
  toast(html, ms) {
    this.hud.toast.innerHTML = html;
    this.hud.toast.classList.add('show');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => this.hud.toast.classList.remove('show'), ms);
  }
  showRoundEnd(m) {
    const me = this.room.state.players.get(this.myId);
    playSfx(m.winnerName && me && me.name === m.winnerName ? 'victory' : 'defeat');
    this.hud.reTitle.textContent = m.winnerName ? `🏆 الفائز: ${m.winnerName}` : 'انتهت الجولة';
    const label = (s) => (s === 'winner' ? '🏆 فائز' : s === 'survivor' ? 'نجا' : 'خرج');
    this.hud.reTable.innerHTML = '<tr><th></th><th>اللاعب</th><th>الحالة</th><th>القتلات</th><th>النقاط</th></tr>'
      + m.results.map((r) => `<tr><td><img class="px" src="${faceUrl(r.hero || 'shadow')}" /></td><td>${r.name}${r.isBot ? ' 🤖' : ''}</td><td>${label(r.status)}</td><td>${r.kills}</td><td>${r.pts}</td></tr>`).join('');
    this.hud.roundEnd.classList.add('show');
  }

  // ---------------------------------------------------------------- main loop
  update(time, delta) {
    const state = this.room.state;
    const me = state.players.get(this.myId);
    const now = performance.now();
    const dt = delta / 1000;

    if (state.phase !== this.lastPhase) {
      if (state.phase === 'playing') { this.hud.waiting.classList.remove('show'); this.hud.roundEnd.classList.remove('show'); }
      this.lastPhase = state.phase;
    }
    if (state.phase === 'waiting') {
      this.hud.waiting.classList.add('show');
      this.hud.waitingCountdown.textContent = state.countdown ? `${state.countdown}s` : '...';
    }

    // camera punch-zoom decay
    if (this.punch > 0.001) { this.punch *= 0.86; this.cameras.main.setZoom(this.baseZoom * (1 + this.punch)); }
    else if (this.punch !== 0) { this.punch = 0; this.cameras.main.setZoom(this.baseZoom); }

    this.gfxGround.clear(); this.gfxFx.clear(); this.gfxZone.clear();
    this.sendInput(me, time);
    this.updateAim();
    this.syncPlayers(state, me, now, dt);
    this.syncProps(state);
    this.syncPickups(state);
    this.updateProjectiles(state, now, dt);
    this.updateWaves(now);
    this.drawWorldFx(state, me, now);
    this.drawAim(me);
    this.updateObjectsFade(me);
    this.followCamera(state, me);
    this.drawScreenFx(state, me, now);
    this.updateHud(state, me);
  }

  sendInput(me, time) {
    if (!me || !me.alive) return;
    let mx = 0, my = 0;
    if (this.touch && (this.touch.move.x || this.touch.move.y)) { mx = this.touch.move.x; my = this.touch.move.y; }
    else {
      if (this.keys.up) my -= 1; if (this.keys.down) my += 1;
      if (this.keys.left) mx -= 1; if (this.keys.right) mx += 1;
    }
    const changed = Math.abs(mx - this.lastSent.mx) > 0.05 || Math.abs(my - this.lastSent.my) > 0.05;
    if (changed || time - this.lastSent.t > 250) {
      this.room.send('input', { mx, my });
      this.lastSent = { mx, my, t: time };
    }
  }

  followCamera(state, me) {
    let target = me && me.alive ? this.views.get(this.myId) : null;
    if (!target) {
      let best = null;
      state.players.forEach((p) => { if (p.alive && (!best || p.kills > best.kills)) best = p; });
      target = best ? this.views.get(best.id) : null;
    }
    if (!target) return;
    const cam = this.cameras.main;
    const tx = target.x - cam.width / 2, ty = target.y - 20 - cam.height / 2;
    cam.scrollX += (tx - cam.scrollX) * 0.12;
    cam.scrollY += (ty - cam.scrollY) * 0.12;
  }

  syncPlayers(state, me, now, dt) {
    const g = this.gfxBars;
    g.clear();
    const seen = new Set();
    const championId = state.championId;
    state.players.forEach((p, id) => {
      seen.add(id);
      let v = this.views.get(id);
      if (!v) v = this.createView(p, id);
      if (v.hero !== p.hero) { v.hero = p.hero; if (!v.poly) v.sprite.setTexture('hero_' + p.hero, 0); }

      const jump = Math.hypot(p.x - v.x, p.y - v.y);
      if (jump > 260) { v.x = p.x; v.y = p.y; }
      else { const k = Math.min(1, dt * 14); v.x += (p.x - v.x) * k; v.y += (p.y - v.y) * k; }

      const isChamp = id === championId && p.alive;
      if (v.alive && !p.alive) {
        v.alive = false;
        v.sprite.setTint(0x888888);
        this.tweens.add({ targets: [v.sprite, v.shadow], alpha: 0, angle: 90, duration: 500 });
      } else if (!v.alive && p.alive) {
        v.alive = true; v.sprite.clearTint(); v.sprite.setAlpha(1).setAngle(0); v.shadow.setAlpha(1);
        v.hp = p.hp;
      }

      if (p.hp < v.hp - 0.5 && p.alive) {
        const lost = v.hp - p.hp;
        v.dmgAcc = (v.dmgAcc || 0) + lost;
        v.flashUntil = now + 100;
        if (v.dmgAcc >= 2) {
          const big = v.dmgAcc >= 20;
          this.floatText(v.x + (Math.random() - 0.5) * 24, v.y - 70, `-${Math.round(v.dmgAcc)}`, id === this.myId ? '#ff6b6b' : big ? '#ffd166' : '#ffffff', big ? 24 : 17);
          v.dmgAcc = 0;
        }
        if (id === this.myId) this.flashDamage();
      }
      v.hp = p.hp;

      const fx = p.fx ? p.fx.split(',') : [];
      const frozen = fx.includes('timestop');
      const moving = Math.hypot(p.vx, p.vy) > 10 || jump > 3;
      if (now > v.castUntil && moving && !frozen) {
        const vx = p.vx || (p.x - v.px), vy = p.vy || (p.y - v.py);
        if (Math.abs(vx) + Math.abs(vy) > 1) v.dir = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? 'right' : 'left') : (vy > 0 ? 'down' : 'up');
      }
      v.px = p.x; v.py = p.y;

      if (!p.alive) {
        v.sprite.setPosition(v.x, v.y + 6).setDepth(v.y);
        v.name.setVisible(false); v.st.setVisible(false);
        this.setChampFx(v, false);
        return;
      }

      // polymorph: swap to the critter sheet
      const poly = fx.includes('polymorph');
      if (poly !== !!v.poly) {
        v.poly = poly;
        this.playFx(17, v.x, v.y - 20, 3, 0xff6bf0);
        if (poly) v.sprite.setTexture('dog', 0); else v.sprite.setTexture('hero_' + p.hero, 0);
      }

      const col = DIR_COL[v.dir];
      v.sprite.anims.timeScale = fx.includes('slowtime') ? 0.3 : fx.includes('berserk') ? 1.5 : 1;
      if (poly) {
        if (moving && !frozen) v.sprite.play('dog-walk', true); else { v.sprite.anims.stop(); v.sprite.setFrame(0); }
        v.sprite.setFlipX(v.dir === 'left');
      } else {
        v.sprite.setFlipX(false);
        if (frozen || fx.includes('stun') || fx.includes('root')) { v.sprite.anims.stop(); if (!frozen) v.sprite.setFrame(col); }
        else if (now < v.castUntil) { v.sprite.anims.stop(); v.sprite.setFrame(16 + col); }
        else if (moving) v.sprite.play(`${p.hero}-walk-${v.dir}`, true);
        else { v.sprite.anims.stop(); v.sprite.setFrame(col); }
      }

      const scale = (isChamp ? SCALE * 1.35 : SCALE) * (poly ? 0.8 : 1);
      v.sprite.setScale(scale);
      const hop = v.jump ? Math.sin(v.jump * Math.PI) * 34 : 0;
      const bob = (fx.includes('airborne') ? -22 : 0) - hop;
      v.sprite.setPosition(v.x, v.y + 8 + bob).setDepth(v.y);
      v.shadow.setPosition(v.x, v.y + 6).setDepth(v.y - 1).setScale(isChamp ? 1.5 : 1);

      let alpha = 1;
      const dMe = me ? Math.hypot(p.x - me.x, p.y - me.y) : 0;
      if (p.hidden) alpha = id === this.myId ? 0.55 : dMe < 150 || !me || !me.alive ? 0.55 : 0;
      if (p.invulnUntil > Date.now()) alpha *= 0.65 + 0.35 * Math.sin(now / 60);
      v.sprite.setAlpha(alpha); v.shadow.setAlpha(alpha * 0.9);

      if (now < v.flashUntil) v.sprite.setTintFill(0xffffff);
      else if (frozen) v.sprite.setTint(0x8a96b8);
      else if (fx.includes('stun')) v.sprite.setTint(now % 300 < 150 ? 0xffffff : 0xbbbbbb);
      else if (poly) v.sprite.setTint(now % 400 < 200 ? 0xffc0f5 : 0xffffff);
      else if (fx.includes('chill')) v.sprite.setTint(0x9fe8ff);
      else if (fx.includes('burn')) v.sprite.setTint(now % 240 < 120 ? 0xffb080 : 0xffd0a0);
      else if (fx.includes('poison')) v.sprite.setTint(now % 500 < 250 ? 0xb8f08a : 0xd8ffb0);
      else if (fx.includes('berserk')) v.sprite.setTint(now % 200 < 100 ? 0xff8080 : 0xffb0b0);
      else if (fx.includes('slowtime')) v.sprite.setTint(0xa8d8ff);
      else if (fx.includes('wet')) v.sprite.setTint(0xa8d0ff);
      else if (fx.includes('shock')) v.sprite.setTint(now % 160 < 80 ? 0xfff6a0 : 0xffffff);
      else if (isChamp) v.sprite.setTint(now % 900 < 450 ? 0xfff0c0 : 0xffffff);
      else v.sprite.clearTint();
      const vis = alpha > 0.01 && !frozen;
      if (vis && fx.includes('burn') && Math.random() < 0.3) this.burst(v.x + (Math.random() - 0.5) * 24, v.y - 24, 0xff7a3c, { count: 1, speedMin: 10, speedMax: 40, life: 450, scale: 1.2, gravity: -140 });
      if (vis && fx.includes('poison') && Math.random() < 0.2) this.burst(v.x + (Math.random() - 0.5) * 24, v.y - 20, 0x9be25a, { count: 1, speedMin: 5, speedMax: 25, life: 700, scale: 1, gravity: -90 });
      if (vis && fx.includes('berserk') && Math.random() < 0.3) this.burst(v.x + (Math.random() - 0.5) * 30, v.y - 10, 0xff3030, { count: 1, speedMin: 10, speedMax: 50, life: 400, scale: 1.3, gravity: -200 });
      if (vis && fx.includes('shock') && Math.random() < 0.1) this.drawBolt(v.x - 16, v.y - 50, v.x + 16, v.y - 4, 0xfff27a);

      this.setChampFx(v, isChamp && alpha > 0.01, now);
      if (alpha <= 0.01) { v.name.setVisible(false); v.st.setVisible(false); return; }

      const topY = v.y + 8 + bob - (poly ? 14 : 16) * scale;
      if (fx.includes('root')) { g.lineStyle(3, 0x6fae3a, 0.9); g.strokeEllipse(v.x, v.y + 6, 54, 22); g.lineStyle(2, 0x9ccc65, 0.9); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + now / 900; g.lineBetween(v.x + Math.cos(a) * 26, v.y + 6 + Math.sin(a) * 10, v.x + Math.cos(a) * 16, v.y - 16); } }
      if (fx.includes('mark')) { g.lineStyle(2, 0xff5e7a, 0.9); g.strokeCircle(v.x, topY - 36, 8); g.lineBetween(v.x - 12, topY - 36, v.x + 12, topY - 36); g.lineBetween(v.x, topY - 48, v.x, topY - 24); }
      if (fx.includes('inverted')) { g.lineStyle(3, 0xff5bd8, 0.9); const a = now / 150; g.beginPath(); g.arc(v.x, topY - 36, 11, a, a + 4); g.strokePath(); }
      if (frozen) { g.lineStyle(2, 0xffe27a, 0.8); g.strokeCircle(v.x, v.y - 20, 30); const a = -now / 400; g.lineBetween(v.x, v.y - 20, v.x + Math.cos(a) * 22, v.y - 20 + Math.sin(a) * 22); }

      const bw = isChamp ? 60 : 44, bx = v.x - bw / 2, by = topY - 12;
      const maxHp = p.maxHp || 150;
      g.fillStyle(0x000000, 0.65); g.fillRect(bx - 1, by - 1, bw + 2, 7);
      g.fillStyle(id === this.myId ? 0x6dff8a : isChamp ? 0xffc23d : 0xff5a5a, 1); g.fillRect(bx, by, bw * clampNum(p.hp / maxHp, 0, 1), 5);
      if (p.shield > 0) { g.fillStyle(0x7dd8ff, 1); g.fillRect(bx, by - 4, bw * clampNum(p.shield / p.maxShield, 0, 1), 3); }

      const label = isChamp ? `👑 ${p.name} ⭐${p.kills}` : (p.mythic ? '⚡' : '') + p.name;
      if (v.label !== label) { v.label = label; v.name.setText(label); }
      if (v.isChampStyle !== isChamp) {
        v.isChampStyle = isChamp;
        v.name.setFontSize(isChamp ? 15 : 12).setColor(isChamp ? '#ffd166' : id === this.myId ? '#ffe27a' : '#ffffff');
      }
      v.name.setVisible(true).setPosition(v.x, by - 6).setAlpha(Math.max(alpha, 0.5));
      const icons = fx.map((s) => (STATUS[s] ? STATUS[s].icon : '')).join('');
      v.st.setVisible(!!icons).setPosition(v.x, by - (isChamp ? 26 : 22)).setText(icons);
    });
    this.views.forEach((v, id) => {
      if (!seen.has(id)) { v.sprite.destroy(); v.shadow.destroy(); v.name.destroy(); v.st.destroy(); if (v.aura) v.aura.destroy(); if (v.glow) v.glow.destroy(); this.views.delete(id); }
    });
  }

  // champion look: gold light pillar + rotating crown ring + sparkles
  setChampFx(v, on, now) {
    if (!on) { if (v.aura) v.aura.setVisible(false); if (v.glow) v.glow.setVisible(false); return; }
    if (!v.aura) {
      v.aura = this.add.graphics();
      v.glow = this.add.image(v.x, v.y, 'glow').setTint(0xffc23d).setBlendMode(Phaser.BlendModes.ADD);
    }
    const pulse = 0.5 + 0.5 * Math.sin(now / 200);
    v.glow.setVisible(true).setPosition(v.x, v.y - 24).setScale(2.6 + pulse * 0.5, 3.4 + pulse * 0.4).setAlpha(0.35 + pulse * 0.2).setDepth(v.y - 2);
    const a = v.aura;
    a.setVisible(true).setDepth(v.y - 3).clear();
    a.fillStyle(0xffc23d, 0.14 + pulse * 0.08); a.fillEllipse(v.x, v.y + 6, 110, 44);
    a.lineStyle(3, 0xffd166, 0.7 + pulse * 0.3); a.strokeEllipse(v.x, v.y + 6, 96 + pulse * 10, 38 + pulse * 4);
    const rot = now / 500;
    a.lineStyle(4, 0xfff0a0, 0.9);
    for (let i = 0; i < 6; i++) {
      const s = rot + i / 6 * Math.PI * 2;
      const x1 = v.x + Math.cos(s) * 60, y1 = v.y + 6 + Math.sin(s) * 24, x2 = v.x + Math.cos(s + 0.35) * 60, y2 = v.y + 6 + Math.sin(s + 0.35) * 24;
      a.lineBetween(x1, y1, x2, y2);
    }
    if (Math.random() < 0.35) this.burst(v.x + (Math.random() - 0.5) * 60, v.y - Math.random() * 40, 0xffd166, { count: 1, speedMin: 10, speedMax: 40, life: 800, scale: 1, gravity: -120 });
  }

  createView(p, id) {
    const shadow = this.add.ellipse(p.x, p.y + 6, 30, 10, 0x000000, 0.35);
    const sprite = this.add.sprite(p.x, p.y + 8, 'hero_' + p.hero, 0).setOrigin(0.5, 1).setScale(SCALE);
    const name = this.add.text(p.x, p.y, p.name, { fontFamily: 'Tahoma, Segoe UI', fontSize: '12px', fontStyle: 'bold', color: id === this.myId ? '#ffe27a' : '#ffffff', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5, 1).setDepth(6600);
    const st = this.add.text(p.x, p.y, '', { fontSize: '13px' }).setOrigin(0.5, 1).setDepth(6600);
    const v = { sprite, shadow, name, st, hero: p.hero, x: p.x, y: p.y, px: p.x, py: p.y, dir: 'down', castUntil: 0, flashUntil: 0, hp: p.hp, alive: p.alive, jump: 0 };
    if (!p.alive) { sprite.setAlpha(0); shadow.setAlpha(0); }
    this.views.set(id, v);
    return v;
  }

  syncProps(state) {
    state.props.forEach((pr) => {
      const img = this.propViews.get(pr.id);
      if (img && img.visible !== pr.alive) img.setVisible(pr.alive);
    });
  }

  syncPickups(state) {
    if (state.pickups === this.lastPickups) return;
    this.lastPickups = state.pickups;
    const keys = new Set(state.pickups ? state.pickups.split(';') : []);
    this.pickupViews.forEach((img, k) => { if (!keys.has(k)) { img.destroy(); this.pickupViews.delete(k); } });
    keys.forEach((k) => {
      if (this.pickupViews.has(k)) return;
      const [x, y] = k.split(':').map(Number);
      const img = this.add.image(x, y, 'heart').setScale(3).setDepth(y);
      this.tweens.add({ targets: img, y: y - 8, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      this.pickupViews.set(k, img);
    });
  }

  updateProjectiles(state, now, dt) {
    const stopped = state.timeStopUntil > Date.now() ? state.timeStopBy : null;
    this.projectiles = this.projectiles.filter((p) => {
      if (stopped && p.casterId !== stopped && !p.flipped) return true; // frozen in time
      const cv = this.views.get(p.casterId);
      if (now < p.startAt) {
        if (cv) { p.x = cv.x; p.y = cv.y - 10; p.img.setPosition(p.x, p.y); if (p.glow) p.glow.setPosition(p.x, p.y); }
        return true;
      }
      p.img.setVisible(true); if (p.glow) p.glow.setVisible(true);
      let speed = p.speed;
      for (const z of this.zones) {
        if (z.type === 'bubble' && z.ownerId !== p.casterId && Math.hypot(p.x - z.x, p.y - z.y) < z.r) speed *= 0.25;
      }
      if (p.cfg.boomerang && p.returning && cv) {
        const dx = cv.x - p.x, dy = cv.y - 10 - p.y, d = Math.hypot(dx, dy);
        if (d < 30) { this.killProjectile(p); return false; }
        p.dir.set(dx / d, dy / d);
      }
      const step = speed * dt;
      p.x += p.dir.x * step; p.y += p.dir.y * step; p.travelled += step;
      p.img.setPosition(p.x, p.y);
      if (p.glow) p.glow.setPosition(p.x, p.y).setScale(p.cfg.glowScale * (0.9 + Math.random() * 0.2));
      if (p.cfg.spin) p.img.rotation += dt * (p.cfg.boomerang ? 24 : 18);
      if (p.cfg.trail && Math.random() < 0.8) this.burst(p.x, p.y, p.cfg.trail, { count: 1, speedMin: 5, speedMax: 35, life: 340, scale: p.id === 'fate_arrow' ? 2.4 : 1.1 });
      if (p.cfg.vine && cv) {
        this.gfxFx.lineStyle(6, 0x3e7a22, 0.9); this.gfxFx.lineBetween(cv.x, cv.y - 14, p.x, p.y);
        this.gfxFx.lineStyle(2, 0x9ccc65, 1); this.gfxFx.lineBetween(cv.x, cv.y - 14, p.x, p.y);
      }
      if (p.cfg.boomerang) {
        if (!p.returning && p.travelled > p.range) p.returning = true;
        if (p.travelled > p.range * 3) { this.killProjectile(p); return false; }
        return true;
      }
      if (p.travelled > p.range) { this.killProjectile(p); return false; }
      return true;
    });
  }

  updateWaves(now) {
    this.waves = this.waves.filter((w) => {
      if (now < w.start) return true;
      const front = w.speed * (now - w.start) / 1000;
      if (front > w.length) return false;
      if (now - w.lastSpawn > (w.id === 'tsunami' ? 80 : 60)) {
        w.lastSpawn = now;
        const nx = -w.dir.y, ny = w.dir.x;
        const n = w.id === 'tsunami' ? 6 : 4;
        for (let i = 0; i < n; i++) {
          const off = (i / (n - 1) - 0.5) * w.width;
          const x = w.ox + w.dir.x * front + nx * off, y = w.oy + w.dir.y * front + ny * off;
          if (w.id === 'tsunami') this.playFx(15, x, y - 20, 6.5, null);
          else this.playFx(13, x, y - 20, 3.8, 0xffffff);
        }
      }
      return true;
    });
  }

  drawWorldFx(state, me, now) {
    const gg = this.gfxGround, gf = this.gfxFx, gz = this.gfxZone;
    this.groundMarks = this.groundMarks.filter((m) => now - m.start < m.dur);
    this.groundMarks.forEach((m) => {
      const t = (now - m.start) / m.dur;
      gg.fillStyle(m.color, (1 - t) * (m.alpha || 0.45)); gg.fillEllipse(m.x, m.y, m.r * 2, m.r * 1.2);
      if (m.vines) { gg.lineStyle(3, 0x6fae3a, 1 - t); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; gg.lineBetween(m.x, m.y, m.x + Math.cos(a) * m.r * 0.9, m.y + Math.sin(a) * m.r * 0.5); } }
    });
    const tnow = Date.now();
    this.myTraps = this.myTraps.filter((k) => k.expiresAt > tnow);
    this.myTraps.forEach((k) => { gg.lineStyle(2, 0x9ccc65, 0.6); gg.strokeEllipse(k.x, k.y, 60, 30); gg.fillStyle(0x6fae3a, 0.25); gg.fillEllipse(k.x, k.y, 60, 30); });

    // time & reality zones
    this.zones = this.zones.filter((z) => now < z.until);
    this.zones.forEach((z) => {
      const life = clampNum((now - z.start) / 250, 0, 1) * clampNum((z.until - now) / 300, 0, 1);
      if (z.type === 'bubble') {
        gg.fillStyle(0x8fd0ff, 0.16 * life); gg.fillCircle(z.x, z.y, z.r);
        gf.lineStyle(4, 0x8fd0ff, 0.8 * life); gf.strokeCircle(z.x, z.y, z.r);
        gf.lineStyle(10, 0x8fd0ff, 0.15 * life); gf.strokeCircle(z.x, z.y, z.r - 6);
        for (let i = 0; i < 12; i++) {
          const a = i / 12 * Math.PI * 2, r1 = z.r - (i % 3 === 0 ? 26 : 14);
          gf.lineStyle(i % 3 === 0 ? 4 : 2, 0xdff4ff, 0.8 * life);
          gf.lineBetween(z.x + Math.cos(a) * r1, z.y + Math.sin(a) * r1, z.x + Math.cos(a) * (z.r - 4), z.y + Math.sin(a) * (z.r - 4));
        }
        const h1 = now / 2400, h2 = now / 300;
        gf.lineStyle(6, 0xdff4ff, 0.7 * life); gf.lineBetween(z.x, z.y, z.x + Math.cos(h1) * z.r * 0.5, z.y + Math.sin(h1) * z.r * 0.5);
        gf.lineStyle(3, 0xdff4ff, 0.7 * life); gf.lineBetween(z.x, z.y, z.x + Math.cos(h2) * z.r * 0.8, z.y + Math.sin(h2) * z.r * 0.8);
        gf.fillStyle(0xffffff, life); gf.fillCircle(z.x, z.y, 6);
      } else {
        gg.fillStyle(0x3a0a3a, 0.28 * life); gg.fillCircle(z.x, z.y, z.r);
        const pts = [];
        for (let i = 0; i <= 28; i++) { const a = i / 28 * Math.PI * 2; const rr = z.r + (Math.random() - 0.5) * 16; pts.push({ x: z.x + Math.cos(a) * rr, y: z.y + Math.sin(a) * rr }); }
        gf.lineStyle(4, 0xff5bd8, 0.9 * life); gf.strokePoints(pts, true);
        gf.lineStyle(2, 0x5bf0ff, 0.7 * life); gf.strokePoints(pts.map((p) => ({ x: p.x + 4, y: p.y - 3 })), true);
        for (let i = 0; i < 5; i++) {
          const yy = z.y + (Math.random() - 0.5) * z.r * 1.6, w = z.r * (0.4 + Math.random() * 0.8);
          gf.fillStyle(Math.random() < 0.5 ? 0xff5bd8 : 0x5bf0ff, 0.25 * life); gf.fillRect(z.x - w / 2 + (Math.random() - 0.5) * 30, yy, w, 3 + Math.random() * 5);
        }
        if (Math.random() < 0.3) this.burst(z.x + (Math.random() - 0.5) * z.r * 1.4, z.y + (Math.random() - 0.5) * z.r * 1.4, 0xff5bd8, { count: 1, speedMax: 60, life: 500, scale: 1.2 });
      }
    });

    this.telegraphs = this.telegraphs.filter((t) => now - t.start < t.dur);
    this.telegraphs.forEach((t) => {
      const k = (now - t.start) / t.dur;
      const pulse = 0.5 + 0.5 * Math.sin(k * Math.PI * 8);
      gg.fillStyle(t.color, 0.14 + pulse * 0.1); gg.fillEllipse(t.x, t.y, t.r * 2, t.r * 1.4);
      gg.lineStyle(4, t.color, 0.7 + pulse * 0.3); gg.strokeEllipse(t.x, t.y, t.r * 2, t.r * 1.4);
      gg.fillStyle(t.color, 0.3); gg.fillEllipse(t.x, t.y, t.r * 2 * k, t.r * 1.4 * k);
    });
    if (this.telegraphLine && now < this.telegraphLine.until) {
      const cv = this.views.get(this.telegraphLine.casterId);
      if (cv) { const d = this.telegraphLine.dir; gg.lineStyle(10, this.telegraphLine.color, 0.35 + 0.3 * Math.sin(now / 40)); gg.lineBetween(cv.x, cv.y, cv.x + d.x * 900, cv.y + d.y * 900); }
    }

    this.auras = this.auras.filter((a) => now - a.start < a.dur);
    this.auras.forEach((a) => {
      const k = (now - a.start) / a.dur;
      const v = a.followId ? this.views.get(a.followId) : null;
      if (a.followId && !v) return;
      const x = v ? v.x : a.x, y = v ? v.y : a.y;
      if (a.kind === 'bubble') {
        const r = a.big ? 58 : 44;
        gf.fillStyle(a.color, 0.16); gf.fillCircle(x, y - 22, r);
        gf.lineStyle(4, a.color, 0.85 - k * 0.3); gf.strokeCircle(x, y - 22, r + Math.sin(now / 90) * 3);
        gf.lineStyle(2, 0xffffff, 0.5); gf.beginPath(); gf.arc(x, y - 22, r - 8, -2.4, -1.6); gf.strokePath();
      } else if (a.kind === 'heal') {
        if (Math.random() < 0.5) this.burst(x + (Math.random() - 0.5) * 50, y - 10, 0x7dffb0, { count: 1, speedMin: 10, speedMax: 30, life: 700, gravity: -180, scale: 1.3 });
        gg.lineStyle(3, 0x7dffb0, 0.7); gg.strokeEllipse(x, y + 6, 84, 32);
      } else if (a.kind === 'rage') {
        gg.fillStyle(0xff2020, 0.14 + 0.08 * Math.sin(now / 80)); gg.fillEllipse(x, y + 6, 80, 30);
        gg.lineStyle(3, 0xff4040, 0.8); gg.strokeEllipse(x, y + 6, 70 + 6 * Math.sin(now / 70), 26);
      } else if (a.kind === 'snap') {
        const rr = 120 * (1 - k) + 10;
        gf.lineStyle(3, 0xffffff, 0.9); gf.strokeCircle(x, y - 30, rr);
        gf.fillStyle(0xffffff, 0.15 + k * 0.5); gf.fillCircle(x, y - 30, 14 + k * 20);
        if (Math.random() < 0.8) { const ang = Math.random() * Math.PI * 2; this.burst(x + Math.cos(ang) * rr, y - 30 + Math.sin(ang) * rr, 0xffe9a8, { count: 1, speedMax: 30, life: 300, scale: 1.2 }); }
      } else if (a.kind === 'vortex' || a.kind === 'portal') {
        const shrink = a.kind === 'vortex' ? 1 - k * 0.5 : 1;
        gg.fillStyle(0x1a0a2a, 0.4 + k * 0.25); gg.fillEllipse(x, y, a.r * 2 * shrink, a.r * 1.3 * shrink);
        for (let i = 0; i < 6; i++) {
          const ang = now / 140 + i * 1.047, rr = a.r * shrink * (1 - ((now / 900 + i * 0.17) % 1));
          gf.lineStyle(4, a.color, 0.85); gf.beginPath(); gf.arc(x, y, rr, ang, ang + 1.2); gf.strokePath();
        }
        gf.fillStyle(0x000000, 1); gf.fillCircle(x, y, 20 + k * 12); gf.lineStyle(4, a.color, 1); gf.strokeCircle(x, y, 22 + k * 12);
      } else if (a.kind === 'storm') {
        gg.lineStyle(4, a.color, 0.35 + 0.35 * Math.sin(now / 60)); gg.strokeEllipse(x, y, a.r * 2, a.r * 1.4);
        gf.fillStyle(0x10102a, 0.25 * k); gf.fillCircle(x, y, a.r);
      }
    });

    // shrinking safe zone
    const cx = this.W / 2, cy = this.H / 2, r = state.safeRadius;
    gz.lineStyle(3000, 0x2a0010, 0.35); gz.strokeCircle(cx, cy, r + 1500);
    const pulse = 0.5 + 0.5 * Math.sin(now / 250);
    gz.lineStyle(10, 0xff3d3d, 0.25 + pulse * 0.2); gz.strokeCircle(cx, cy, r + 4);
    gz.lineStyle(3, 0xff7070, 0.9); gz.strokeCircle(cx, cy, r);
    const rot = now / 3000;
    gz.lineStyle(4, 0xffc4a0, 0.6);
    for (let i = 0; i < 36; i += 2) { gz.beginPath(); gz.arc(cx, cy, r - 6, rot + i / 36 * Math.PI * 2, rot + (i + 0.7) / 36 * Math.PI * 2); gz.strokePath(); }
  }

  // DOM overlays: time-stop screen + arrow to an off-screen champion
  drawScreenFx(state, me, now) {
    const ts = this.hud.timeStopFx;
    const stopping = this.timeStop && now < this.timeStop.until;
    if (stopping !== this._tsOn) {
      this._tsOn = stopping;
      ts.classList.toggle('show', !!stopping);
      if (stopping) ts.querySelector('.lbl').textContent = this.timeStop.id === this.myId ? '⏸️ أوقفت الزمن — تحرك واضرب!' : `⏸️ ${this.timeStop.name} أوقف الزمن`;
    }
    const arrow = this.hud.champArrow;
    const champ = state.championId ? state.players.get(state.championId) : null;
    if (!champ || !champ.alive || champ.id === this.myId || !me || !me.alive) { if (this._arrowOn) { arrow.classList.remove('show'); this._arrowOn = false; } return; }
    const cam = this.cameras.main, wv = cam.worldView;
    const cv = this.views.get(champ.id);
    const wx = cv ? cv.x : champ.x, wy = cv ? cv.y : champ.y;
    const sw = this.scale.width, sh = this.scale.height;
    const sx = (wx - wv.x) * cam.zoom, sy = (wy - wv.y) * cam.zoom;
    const onScreen = sx > 20 && sx < sw - 20 && sy > 40 && sy < sh - 20;
    if (onScreen || champ.hidden) { if (this._arrowOn) { arrow.classList.remove('show'); this._arrowOn = false; } return; }
    const cx = sw / 2, cy = sh / 2, dx = sx - cx, dy = sy - cy;
    const k = Math.min((sw / 2 - 46) / Math.abs(dx || 1), (sh / 2 - 60) / Math.abs(dy || 1));
    arrow.style.left = `${cx + dx * k}px`; arrow.style.top = `${cy + dy * k}px`;
    arrow.querySelector('.ar').style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
    if (!this._arrowOn) { arrow.classList.add('show'); this._arrowOn = true; }
  }

  updateObjectsFade(me) {
    const v = this.views.get(this.myId);
    if (!v || !me) return;
    this.objectViews.forEach((ov) => {
      if (!ov.big) return;
      const behind = v.y < ov.o.y - 10 && v.y > ov.o.y - ov.h + 10 && Math.abs(v.x - ov.o.x) < ov.w / 2;
      const target = behind ? 0.5 : 1;
      if (Math.abs(ov.img.alpha - target) > 0.01) ov.img.setAlpha(ov.img.alpha + (target - ov.img.alpha) * 0.2);
    });
    this.bushViews.forEach((bv) => {
      const inside = Math.hypot(v.x - bv.b.x, v.y - bv.b.y) < bv.b.r;
      bv.imgs.forEach((im) => im.setAlpha(inside ? 0.7 : 1));
    });
  }

  flashDamage() {
    this.hud.dmgFlash.style.opacity = '0.8';
    clearTimeout(this._dmgT);
    this._dmgT = setTimeout(() => { this.hud.dmgFlash.style.opacity = '0'; }, 160);
  }

  updateHud(state, me) {
    const h = this.hud;
    if (me) {
      const maxHp = me.maxHp || 150;
      h.hpFill.style.width = `${clampNum(me.hp / maxHp, 0, 1) * 100}%`;
      h.shieldFill.style.width = `${clampNum(me.shield / me.maxShield, 0, 1) * 100}%`;
      const stats = `${state.championId === me.id ? '👑 ' : ''}القتلات: ${me.kills} · الصحة: ${Math.ceil(me.hp)}`;
      if (stats !== this._lastStats) { h.statsLine.textContent = stats; this._lastStats = stats; }
      if (this._face !== me.hero) { this._face = me.hero; h.selfFace.style.backgroundImage = `url('${faceUrl(me.hero)}')`; h.selfFace.style.backgroundSize = 'cover'; }
      const st = me.fx ? me.fx.split(',').map((s) => STATUS[s] ? STATUS[s].icon : '').join(' ') : '';
      if (st !== this._lastSt) { h.selfStatus.textContent = st; this._lastSt = st; }
      if (this.touch) this.touch.update(me);
      else this.renderHotbar(me);
      const pas = this.touch
        ? [...me.passives].map((id) => `<span class="p">${PASSIVES[id] ? PASSIVES[id].icon : '?'}</span>`).join('')
        : [...me.passives].map((id) => `<span class="p" title="${PASSIVES[id] ? PASSIVES[id].desc : ''}">${PASSIVES[id] ? PASSIVES[id].icon + ' ' + PASSIVES[id].nameAr : id}</span>`).join('');
      if (pas !== this._lastPas) { h.passives.innerHTML = (this.touch ? '' : `<div class="ttl">القدرات الجانبية (${me.passives.length})</div>`) + pas; this._lastPas = pas; }
    }
    let alive = 0; state.players.forEach((p) => { if (p.alive) alive++; });
    const pl = `⚔ اللاعبون: ${alive}`;
    if (pl !== this._lastPl) { h.playersLeft.textContent = pl; this._lastPl = pl; }
    if (state.phase === 'playing') {
      const total = Math.max(0, Math.ceil(state.remaining));
      const tt = `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
      if (tt !== this._lastT) { h.timer.textContent = tt; this._lastT = tt; }
      const ev = state.eventId ? WORLD_EVENTS[state.eventId] || '' : (Date.now() < state.matchReadyAt ? 'استعد...' : '');
      if (ev !== this._lastEv) { h.remaining.textContent = ev; this._lastEv = ev; }
    }
    const champ = state.championId ? state.players.get(state.championId) : null;
    if (champ && champ.alive) {
      h.bossBar.classList.add('show');
      const lbl = `👑 البطل الأقوى: ${champ.name} (${champ.kills} قتلات)`;
      if (lbl !== this._lastChampLbl) { h.bossLbl.textContent = lbl; this._lastChampLbl = lbl; }
      h.bossFill.style.width = `${clampNum(champ.hp / (champ.maxHp || 190), 0, 1) * 100}%`;
    } else h.bossBar.classList.remove('show');
  }

  renderHotbar(me) {
    const now = Date.now();
    const slot = (id, key, def, extra = '') => {
      if (!def) return '';
      const cd = (me.cooldowns.get(id) || 0) - now;
      const secs = cd > 0 ? Math.ceil(cd / 1000) : 0;
      return `<div class="slot ${extra}" data-cast="${id}" title="${def.nameAr}">
        <div class="ico" style="${iconStyle(def.icon, extra ? 48 : 38)}"></div>
        <div class="key">${key}</div>${secs ? `<div class="cd">${secs}</div>` : ''}
      </div>`;
    };
    const html = slot('strike', 'Space', BASIC)
      + [...me.abilities].map((id, i) => slot(id, String(i + 1), ABILITIES[id])).join('')
      + slot(me.legend, 'Q', LEGENDS[me.legend], 'legend')
      + (me.mythic ? slot(me.mythic, 'E', MYTHICS[me.mythic], 'mythic') : '');
    if (html !== this._lastHotbar) { this.hud.hotbar.innerHTML = html; this._lastHotbar = html; }
  }
}

function getHudRefs() {
  const byId = (id) => document.getElementById(id);
  return {
    root: byId('hud'), hpFill: byId('hpFill'), shieldFill: byId('shieldFill'), statsLine: byId('statsLine'),
    selfFace: byId('selfFace'), selfStatus: byId('selfStatus'), timer: byId('timer'), remaining: byId('remaining'),
    hotbar: byId('hotbar'), passives: byId('passives'), killfeed: byId('killfeed'), playersLeft: byId('playersLeft'),
    bossBar: byId('bossBar'), bossLbl: byId('bossLbl'), bossFill: byId('bossFill'), banner: byId('banner'), toast: byId('toast'),
    waiting: byId('waiting'), waitingCountdown: byId('waitingCountdown'),
    roundEnd: byId('roundEnd'), reTitle: byId('reTitle'), reTable: byId('reTable'), dmgFlash: byId('dmgFlash'),
    helpBtn: byId('helpBtn'), helpPanel: byId('helpPanel'),
  };
}
