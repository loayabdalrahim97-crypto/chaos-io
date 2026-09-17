import Phaser from 'phaser';
import { SP, GD, HEROES, COMBOS, OBJECT_FRAMES, GROUND, SCALE, STATUS, SLOT_COLORS, defOf } from './gameData.js';
import { TouchControls, isTouchDevice } from './touch.js';
import { fxMixin, clampNum } from './scene/fx.js';
import { messagesMixin } from './scene/messages.js';
import { hudMixin, getHudRefs } from './scene/hud.js';
import { strategyMixin } from './scene/strategy.js';

// Physical key codes (not e.key) so bindings work on any keyboard language/layout.
const CODE_TO_ACTION = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  Digit1: 'slot0', Digit2: 'slot1', Digit3: 'slot2', KeyQ: 'legend', Digit4: 'legend', KeyE: 'mythic', Digit5: 'mythic',
  KeyR: 'fusion', KeyF: 'bonus', KeyC: 'curse', Space: 'basic', KeyZ: 'summon1', KeyX: 'summon2', KeyG: 'domain',
};
const DIR_COL = { down: 0, up: 1, left: 2, right: 3 };
const DIR_VEC = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };
const FX_USED = [1, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 17, 18, 19, 20];
const BIG_OBJECTS = new Set(['cluster', 'tree', 'tree2', 'pine', 'house', 'hut', 'ruin', 'kiln']);
const TEAM_COLORS = { 1: 0x4cc9ff, 2: 0xff6b6b, 3: 0xffd166 };
const BOSS_SHEET = 8;

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
    this.load.spritesheet('boss', `${SP}/monsters/${BOSS_SHEET}.png`, { frameWidth: 16, frameHeight: 16 });
    FX_USED.forEach((n) => this.load.spritesheet('fx' + n, `${SP}/fx/${n}.png`, { frameWidth: 32, frameHeight: 32 }));
    this.load.image('tiles', `${SP}/background-elements/tileset.png`);
    this.load.image('village', `${GD}/tileset_village_abandoned.png`);
    this.load.image('floor', `${GD}/tileset_floor.png`);
    this.load.image('shuriken', `${SP}/hud/shuriken.png`);
    this.load.image('fireball', `${SP}/items/fireball.png`);
    this.load.image('icespike', `${SP}/items/ice-spike.png`);
    this.load.image('arrow', `${SP}/items/arrow.png`);
    this.load.image('kunai', `${SP}/items/kunai.png`);
    this.load.image('heart', `${SP}/items/heart.png`);
    this.load.image('axe', `${SP}/weapons/axe.png`);
    this.load.image('sai', `${SP}/weapons/sai.png`);
    this.load.image('bow', `${SP}/weapons/bow.png`);
    this.load.image('lance', `${SP}/weapons/lance.png`);
    this.preloadStrategy();
  }

  create() {
    this.W = this.map.w; this.H = this.map.h;
    this.setupTextures();
    this.buildGround();
    this.buildObjects();

    this.gfxGround = this.add.graphics().setDepth(-900);
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
    this.summonViews = new Map();
    this.dropViews = new Map();
    this.lastDrops = null;
    this.pickupViews = new Map();
    this.lastPickups = null;
    this.keys = {};
    this.aimWorld = { x: this.W / 2, y: this.H / 2 };
    this.lastSent = { mx: 9, my: 9, t: 0 };
    this.lastPhase = null;
    this.punch = 0;

    this.hud = getHudRefs();
    this.hud.root.classList.add('active');
    this.touch = isTouchDevice() ? new TouchControls(this) : null;
    this.fxMul = this.touch ? 0.7 : 1;
    this.buildScreenFx();
    this.setupStrategy();
    window.__cioToast = (t) => this.toast(t, 4000);
    const controls = this.touch
      ? '🕹️ اسحب يسار الشاشة للمشي · 👆 اضغط زر القدرة = تصويب تلقائي · ✋ اسحب الزر = تصويب يدوي'
      : 'WASD حركة · الماوس تصويب · Space/كليك شوريكن · 1 2 3 قدرات · Q أسطورية · R اندماج · F الصندوق · E خارقة · C لعنة الشبح · Z X استدعاء · G النطاق';
    this.hud.helpPanel.innerHTML = '<b>🎮 التحكم</b><br/>' + controls
      + `<br/><br/><b>🛡️ الجيش والحرب</b><br/>⚔ المباراة 5 جولات وبعدها الحرب الأخيرة<br/>🛡️ كل بطل معه جيش AI بيلحقه وبيحميه — القتل والمساعدة بيزيدوا قوة الجيش<br/>🏹 قوة أكثر = جنود نخبة ⚜️ وقادة — وكلها بتضل معك بين الجولات<br/>🐾 ${this.touch ? 'الأزرار الزرقاء' : 'Z / X'}: استدعاء رفيقين خاصين<br/>🌍 ${this.touch ? 'الزر الوردي' : 'G'}: النطاق — بيحوّل كل الساحة لعالم بطلك (نطاق واحد بس بالوقت)<br/>🎯 قبل الحرب الأخيرة بتختار هدفين — وكل لاعب بيستهدفه 2 بالأكثر`
      + '<br/><br/><b>⚔ داخل الجولة</b><br/>👑 أكثر لاعب قتلات = البطل، اللي بيقتله بياخد قدرة خارقة<br/>🧬 بعد 3 قتلات قدراتك بتندمج<br/>⬆️ كل قتلتين بتختار ترقية<br/>🎁 صناديق السما فيها قدرة أسطورية لمرة<br/>👹 الغول بيطلع بعد 30 ثانية — اقتله لقوة دائمة<br/>🔥 3 قتلات = مولّع · 💀 5 قتلات = هيجان<br/>💰 اللي بيقتل 3 بيصير مطلوب<br/>👻 لما تموت بتصير شبح وبتلعن قاتلك مرة<br/><br/>'
      + '<b>🔗 الكومبوهات</b><br/>' + Object.values(COMBOS).map((c) => `<div class="cb"><span style="color:${c.color}">${c.nameAr}</span> ${c.recipe} → ${c.effect}</div>`).join('');
    this.hud.helpBtn.addEventListener('click', () => this.hud.helpPanel.classList.toggle('show'));

    this.setupInput();
    this.setupMessages();
    this.setupStrategyMessages();
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
    g.clear(); g.fillStyle(0x6b4a2b, 1); g.fillCircle(16, 16, 15); g.fillStyle(0x9a7048, 1); g.fillCircle(12, 12, 9); g.fillStyle(0x3a2814, 1); g.fillCircle(20, 21, 4); g.generateTexture('rock', 32, 32);
    g.destroy();
    if (!this.textures.exists('glow')) {
      const ct = this.textures.createCanvas('glow', 64, 64);
      const ctx = ct.getContext();
      const grd = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.35, 'rgba(255,255,255,0.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grd; ctx.fillRect(0, 0, 64, 64);
      ct.refresh();
    }
    this.textures.get('glow').setFilter(Phaser.Textures.FilterMode.LINEAR);

    const walk = (key, sheet) => Object.entries(DIR_COL).forEach(([dir, col]) => {
      this.anims.create({ key: `${key}-walk-${dir}`, frames: this.anims.generateFrameNumbers(sheet, { frames: [col, 4 + col, 8 + col, 12 + col] }), frameRate: 9, repeat: -1 });
    });
    Object.keys(HEROES).forEach((id) => walk(id, 'hero_' + id));
    walk('boss', 'boss');
    this.anims.create({ key: 'dog-walk', frames: this.anims.generateFrameNumbers('dog', { frames: [0, 1] }), frameRate: 8, repeat: -1 });
    FX_USED.forEach((n) => this.anims.create({ key: 'fx' + n, frames: this.anims.generateFrameNumbers('fx' + n), frameRate: 16, repeat: 0 }));
  }

  buildGround() {
    const { cols, rows } = this.map;
    const rt = this.add.renderTexture(0, 0, cols * 16, rows * 16).setOrigin(0, 0).setScale(SCALE).setDepth(-1000);
    const stamp = this.make.image({ key: 'floor', add: false }).setOrigin(0, 0);
    const rng = mulberry32(1337);
    const isIn = (list, c, r, pad = 0) => list.some((a) => c >= a.x - pad && c < a.x + a.w + pad && r >= a.y - pad && r < a.y + a.h + pad);
    rt.beginDraw();
    const draw = (tex, frame, x, y) => { stamp.setTexture(tex, frame); rt.batchDraw(stamp, x, y); };
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const v = rng(); draw('floor', v < 0.72 ? 'g0' : 'g' + (1 + Math.floor(rng() * (GROUND.grass.length - 1))), c * 16, r * 16); }
    const nine = (rect, tex, prefix) => {
      for (let r = rect.y; r < rect.y + rect.h; r++) {
        for (let c = rect.x; c < rect.x + rect.w; c++) {
          const top = r === rect.y, bot = r === rect.y + rect.h - 1, left = c === rect.x, right = c === rect.x + rect.w - 1;
          const k = top ? (left ? 'tl' : right ? 'tr' : 't') : bot ? (left ? 'bl' : right ? 'br' : 'b') : (left ? 'l' : right ? 'r' : 'c');
          draw(tex, prefix + k, c * 16, r * 16);
        }
      }
    };
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
      if (['tree', 'tree2', 'pine', 'cluster'].includes(o.kind)) this.tweens.add({ targets: img, scaleX: SCALE * 1.02, duration: 1800 + Math.random() * 800, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
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
    this.map.props.forEach((p) => this.propViews.set(p.id, this.add.image(p.x, p.y, 'tiles', p.kind).setOrigin(0.5, 1).setScale(SCALE).setDepth(p.y)));
  }

  // ---------------------------------------------------------------- input
  setupInput() {
    this.input.keyboard.on('keydown', (e) => this.onKey(e, true));
    this.input.keyboard.on('keyup', (e) => this.onKey(e, false));
    this.input.on('pointerdown', (p) => {
      if (p.wasTouch || this.touch) return;
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
    const map = { basic: 'strike', legend: me.legend, mythic: me.mythic, fusion: me.fusion, bonus: me.bonus, curse: 'curse', summon1: 'summon1', summon2: 'summon2', domain: 'domain' };
    this.cast(a.startsWith('slot') ? me.abilities[Number(a.slice(4))] : map[a]);
  }

  nearestEnemy(me, maxD = 700) {
    let best = null, bd = maxD;
    this.room.state.players.forEach((p) => {
      if (p.id === this.myId || !p.alive || (me.team && p.team === me.team) || (p.hidden && Math.hypot(p.x - me.x, p.y - me.y) > 150)) return;
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
    if (!me || (!me.alive && !(abilityId === 'curse' && me.ghost))) return;
    if (tx === undefined) {
      if (this.touch) { const t = this.touchTarget(me, abilityId, 0, 0, 110); tx = t.x; ty = t.y; }
      else { this.updateAim(); tx = this.aimWorld.x; ty = this.aimWorld.y; }
    }
    this.room.send('cast', { abilityId, tx, ty });
  }

  touchTarget(me, id, dx, dy, aimR) {
    const def = defOf(id) || {};
    const range = def.range || (def.radius && def.self ? def.radius : 600);
    const len = Math.hypot(dx, dy);
    if (len < 18) {
      const e = this.nearestEnemy(me, range + 80);
      if (e) return { x: e.x, y: e.y };
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
    if (!me) return;
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

  // ---------------------------------------------------------------- main loop
  update(time, delta) {
    const state = this.room.state;
    const me = state.players.get(this.myId);
    const now = performance.now();
    const dt = delta / 1000;

    if (state.phase !== this.lastPhase) {
      if (state.phase !== 'waiting') this.hud.waiting.classList.remove('show');
      if (state.phase === 'playing') this.hud.roundEnd.classList.remove('show');
      this.lastPhase = state.phase;
    }
    if (state.phase === 'waiting') {
      this.hud.waiting.classList.add('show');
      this.hud.waitingCountdown.textContent = state.countdown ? `${state.countdown}s` : '...';
    }

    if (this.punch > 0.001) { this.punch *= 0.86; this.cameras.main.setZoom(this.baseZoom * (1 + this.punch)); }
    else if (this.punch !== 0) { this.punch = 0; this.cameras.main.setZoom(this.baseZoom); }

    this.gfxGround.clear(); this.gfxFx.clear(); this.gfxZone.clear();
    this.sendInput(me, time);
    this.updateAim();
    this.syncPlayers(state, me, now, dt);
    this.syncUnits(state, me, now, dt);
    this.syncProps(state);
    this.syncPickups(state);
    this.syncDrops(state);
    this.updateProjectiles(state, now, dt);
    this.updateWaves(now);
    this.drawWorldFx(state, me, now);
    this.drawDomain(state, me, now, dt);
    this.drawAim(me);
    this.updateObjectsFade(me);
    this.followCamera(state, me);
    this.drawScreenFx(state, me, now);
    this.updateHud(state, me);
    this.updateStrategyHud(state, me, now);
  }

  sendInput(me, time) {
    if (!me || (!me.alive && !me.ghost)) return;
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
    let target = me && (me.alive || me.ghost) ? this.views.get(this.myId) : null;
    if (!target) {
      let best = null;
      state.players.forEach((p) => { if (p.alive && p.kind !== 'boss' && (!best || p.kills > best.kills)) best = p; });
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
    const myTeam = me ? me.team : 0;
    state.players.forEach((p, id) => {
      seen.add(id);
      let v = this.views.get(id);
      if (!v) v = this.createView(p, id);
      const isBoss = p.kind === 'boss';
      const texKey = isBoss ? 'boss' : 'hero_' + p.hero;
      if (v.hero !== p.hero && !isBoss) { v.hero = p.hero; if (!v.poly) v.sprite.setTexture(texKey, 0); }

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
        v.dmgAcc = (v.dmgAcc || 0) + (v.hp - p.hp);
        v.flashUntil = now + 100;
        if (v.dmgAcc >= 2) {
          const big = v.dmgAcc >= 20;
          this.floatText(v.x + (Math.random() - 0.5) * 24, v.y - (isBoss ? 130 : 70), `-${Math.round(v.dmgAcc)}`, id === this.myId ? '#ff6b6b' : big ? '#ffd166' : '#ffffff', big ? 24 : 17);
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

      // ghosts: drifting translucent spirit
      if (!p.alive) {
        this.setChampFx(v, false);
        if (p.ghost && state.phase === 'playing') {
          const mineOrClose = id === this.myId || (me && Math.hypot(p.x - me.x, p.y - me.y) < 500);
          v.sprite.setAlpha(mineOrClose ? (id === this.myId ? 0.6 : 0.28) : 0).setAngle(0).setTint(0xb0c0ff).setTexture(texKey, DIR_COL[v.dir]);
          v.sprite.setPosition(v.x, v.y - 6 + Math.sin(now / 300) * 6).setDepth(v.y + 2000);
          v.shadow.setAlpha(0);
          v.name.setVisible(mineOrClose).setText('👻 ' + p.name).setPosition(v.x, v.y - 60).setAlpha(0.7);
          v.st.setVisible(false);
          if (id === this.myId && p.curseReady) { g.lineStyle(2, 0xb0c0ff, 0.25); g.strokeCircle(v.x, v.y, 380); }
        } else {
          v.sprite.setPosition(v.x, v.y + 6).setDepth(v.y);
          v.name.setVisible(false); v.st.setVisible(false);
        }
        return;
      }

      const poly = fx.includes('polymorph');
      if (poly !== !!v.poly) {
        v.poly = poly;
        this.playFx(17, v.x, v.y - 20, 3, 0xff6bf0);
        v.sprite.setTexture(poly ? 'dog' : texKey, 0);
      }

      const col = DIR_COL[v.dir];
      const animKey = isBoss ? 'boss' : p.hero;
      v.sprite.anims.timeScale = fx.includes('slowtime') ? 0.3 : fx.includes('berserk') || fx.includes('haste') ? 1.5 : 1;
      if (poly) {
        if (moving && !frozen) v.sprite.play('dog-walk', true); else { v.sprite.anims.stop(); v.sprite.setFrame(0); }
        v.sprite.setFlipX(v.dir === 'left');
      } else {
        v.sprite.setFlipX(false);
        if (frozen || fx.includes('stun') || fx.includes('root')) { v.sprite.anims.stop(); if (!frozen) v.sprite.setFrame(col); }
        else if (now < v.castUntil && !isBoss) { v.sprite.anims.stop(); v.sprite.setFrame(16 + col); }
        else if (moving) v.sprite.play(`${animKey}-walk-${v.dir}`, true);
        else { v.sprite.anims.stop(); v.sprite.setFrame(col); }
      }

      const scale = isBoss ? SCALE * 3 : (isChamp ? SCALE * 1.35 : SCALE) * (poly ? 0.8 : 1) * (fx.includes('rampage') ? 1.12 : 1);
      v.sprite.setScale(scale);
      const hop = v.jump ? Math.sin(v.jump * Math.PI) * 34 : 0;
      const bob = (fx.includes('airborne') ? -22 : 0) - hop;
      v.sprite.setPosition(v.x, v.y + 8 + bob).setDepth(v.y);
      v.shadow.setPosition(v.x, v.y + 6).setDepth(v.y - 1).setScale(isBoss ? 3 : isChamp ? 1.5 : 1);

      let alpha = 1;
      const dMe = me ? Math.hypot(p.x - me.x, p.y - me.y) : 0;
      const ally = myTeam && p.team === myTeam;
      if (p.hidden) alpha = id === this.myId || ally ? 0.5 : dMe < 150 || !me || !me.alive ? 0.5 : 0;
      if (this.visionLimited(state, me) && id !== this.myId && !ally && me && me.alive && dMe > 260) alpha = 0;
      if (p.invulnUntil > Date.now()) alpha *= 0.65 + 0.35 * Math.sin(now / 60);
      v.sprite.setAlpha(alpha); v.shadow.setAlpha(alpha * 0.9);

      if (now < v.flashUntil) v.sprite.setTintFill(0xffffff);
      else if (frozen) v.sprite.setTint(0x8a96b8);
      else if (fx.includes('stun')) v.sprite.setTint(now % 300 < 150 ? 0xffffff : 0xbbbbbb);
      else if (poly) v.sprite.setTint(now % 400 < 200 ? 0xffc0f5 : 0xffffff);
      else if (fx.includes('chill')) v.sprite.setTint(0x9fe8ff);
      else if (fx.includes('burn')) v.sprite.setTint(now % 240 < 120 ? 0xffb080 : 0xffd0a0);
      else if (fx.includes('poison')) v.sprite.setTint(now % 500 < 250 ? 0xb8f08a : 0xd8ffb0);
      else if (fx.includes('silence') || fx.includes('weak')) v.sprite.setTint(0xc8a8ff);
      else if (fx.includes('berserk') || fx.includes('rampage')) v.sprite.setTint(now % 200 < 100 ? 0xff8080 : 0xffb0b0);
      else if (fx.includes('slowtime')) v.sprite.setTint(0xa8d8ff);
      else if (fx.includes('wet')) v.sprite.setTint(0xa8d0ff);
      else if (fx.includes('shock')) v.sprite.setTint(now % 160 < 80 ? 0xfff6a0 : 0xffffff);
      else if (isChamp) v.sprite.setTint(now % 900 < 450 ? 0xfff0c0 : 0xffffff);
      else v.sprite.clearTint();
      const vis = alpha > 0.01 && !frozen;
      if (vis && (fx.includes('burn') || fx.includes('onfire')) && Math.random() < (fx.includes('onfire') ? 0.6 : 0.3)) this.burst(v.x + (Math.random() - 0.5) * (fx.includes('onfire') ? 60 : 24), v.y - 24 + (Math.random() - 0.5) * 20, 0xff7a3c, { count: 1, speedMin: 10, speedMax: 40, life: 450, scale: 1.3, gravity: -140 });
      if (vis && fx.includes('poison') && Math.random() < 0.2) this.burst(v.x + (Math.random() - 0.5) * 24, v.y - 20, 0x9be25a, { count: 1, speedMin: 5, speedMax: 25, life: 700, scale: 1, gravity: -90 });
      if (vis && (fx.includes('berserk') || fx.includes('rampage')) && Math.random() < 0.3) this.burst(v.x + (Math.random() - 0.5) * 30, v.y - 10, 0xff3030, { count: 1, speedMin: 10, speedMax: 50, life: 400, scale: 1.3, gravity: -200 });
      if (vis && fx.includes('shock') && Math.random() < 0.1) this.drawBolt(v.x - 16, v.y - 50, v.x + 16, v.y - 4, 0xfff27a);
      if (vis && fx.includes('haste') && Math.random() < 0.3) this.burst(v.x, v.y - 10, 0xfff27a, { count: 1, speedMin: 30, speedMax: 60, life: 250, scale: 0.8 });

      this.setChampFx(v, isChamp && alpha > 0.01, now);
      if (alpha <= 0.01) { v.name.setVisible(false); v.st.setVisible(false); return; }

      const topY = v.y + 8 + bob - (poly ? 14 : 16) * scale;
      if (myTeam && !isBoss) { g.lineStyle(3, ally ? 0x6dff8a : 0xff5a5a, 0.7); g.strokeEllipse(v.x, v.y + 6, 40, 16); }
      else if (!isBoss && id !== this.myId) { g.lineStyle(2, SLOT_COLORS[p.slot || 0], 0.6); g.strokeEllipse(v.x, v.y + 6, 42, 16); }
      if (isBoss) { g.lineStyle(4, 0xff3d1f, 0.4 + 0.3 * Math.sin(now / 150)); g.strokeEllipse(v.x, v.y + 8, 150, 50); }
      if (fx.includes('onfire')) { g.lineStyle(3, 0xff7a3c, 0.6 + 0.3 * Math.sin(now / 70)); g.strokeEllipse(v.x, v.y + 6, 80, 32); }
      if (fx.includes('reflect')) { g.lineStyle(3, 0xaee8ff, 0.8); g.strokeCircle(v.x, v.y - 22, 34); }
      if (fx.includes('root')) { g.lineStyle(3, 0x6fae3a, 0.9); g.strokeEllipse(v.x, v.y + 6, 54, 22); g.lineStyle(2, 0x9ccc65, 0.9); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + now / 900; g.lineBetween(v.x + Math.cos(a) * 26, v.y + 6 + Math.sin(a) * 10, v.x + Math.cos(a) * 16, v.y - 16); } }
      if (fx.includes('mark')) { g.lineStyle(2, 0xff5e7a, 0.9); g.strokeCircle(v.x, topY - 36, 8); g.lineBetween(v.x - 12, topY - 36, v.x + 12, topY - 36); g.lineBetween(v.x, topY - 48, v.x, topY - 24); }
      if (fx.includes('inverted')) { g.lineStyle(3, 0xff5bd8, 0.9); const a = now / 150; g.beginPath(); g.arc(v.x, topY - 36, 11, a, a + 4); g.strokePath(); }
      if (frozen) { g.lineStyle(2, 0xffe27a, 0.8); g.strokeCircle(v.x, v.y - 20, 30); const a = -now / 400; g.lineBetween(v.x, v.y - 20, v.x + Math.cos(a) * 22, v.y - 20 + Math.sin(a) * 22); }

      const bw = isBoss ? 120 : isChamp ? 60 : 44, bx = v.x - bw / 2, by = topY - 12;
      const maxHp = p.maxHp || 200;
      g.fillStyle(0x000000, 0.65); g.fillRect(bx - 1, by - 1, bw + 2, isBoss ? 9 : 7);
      g.fillStyle(id === this.myId ? 0x6dff8a : isBoss ? 0xff3d1f : ally ? 0x4cc9ff : isChamp ? 0xffc23d : 0xff5a5a, 1); g.fillRect(bx, by, bw * clampNum(p.hp / maxHp, 0, 1), isBoss ? 7 : 5);
      if (p.shield > 0) { g.fillStyle(0x7dd8ff, 1); g.fillRect(bx, by - 4, bw * clampNum(p.shield / Math.max(p.maxShield, p.shield), 0, 1), 3); }

      const label = (isChamp ? '👑 ' : '') + (p.bounty >= 3 ? '💰' : '') + (p.mythic ? '⚡' : '') + p.name + (isChamp ? ` ⭐${p.kills}` : '');
      if (v.label !== label) { v.label = label; v.name.setText(label); }
      const style = isBoss ? 'boss' : isChamp ? 'champ' : id === this.myId ? 'me' : ally ? 'ally' : myTeam ? 'enemy' : 'other';
      if (v.nameStyle !== style) {
        v.nameStyle = style;
        v.name.setFontSize(isBoss ? 18 : isChamp ? 15 : 12).setColor({ boss: '#ff6b3d', champ: '#ffd166', me: '#ffe27a', ally: '#7dffb0', enemy: '#ff8a8a', other: '#ffffff' }[style]);
      }
      v.name.setVisible(true).setPosition(v.x, by - 6).setAlpha(Math.max(alpha, 0.5));
      const icons = fx.map((s) => (STATUS[s] ? STATUS[s].icon : '')).join('');
      v.st.setVisible(!!icons).setPosition(v.x, by - (isChamp || isBoss ? 26 : 22)).setText(icons);
    });
    this.views.forEach((v, id) => {
      if (!seen.has(id)) { v.sprite.destroy(); v.shadow.destroy(); v.name.destroy(); v.st.destroy(); if (v.aura) v.aura.destroy(); if (v.glow) v.glow.destroy(); this.views.delete(id); }
    });
  }

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
      a.lineBetween(v.x + Math.cos(s) * 60, v.y + 6 + Math.sin(s) * 24, v.x + Math.cos(s + 0.35) * 60, v.y + 6 + Math.sin(s + 0.35) * 24);
    }
    if (Math.random() < 0.35) this.burst(v.x + (Math.random() - 0.5) * 60, v.y - Math.random() * 40, 0xffd166, { count: 1, speedMin: 10, speedMax: 40, life: 800, scale: 1, gravity: -120 });
  }

  createView(p, id) {
    const boss = p.kind === 'boss';
    const shadow = this.add.ellipse(p.x, p.y + 6, 30, 10, 0x000000, 0.35);
    const sprite = this.add.sprite(p.x, p.y + 8, boss ? 'boss' : 'hero_' + p.hero, 0).setOrigin(0.5, 1).setScale(boss ? SCALE * 3 : SCALE);
    const name = this.add.text(p.x, p.y, p.name, { fontFamily: 'Tahoma, Segoe UI', fontSize: '12px', fontStyle: 'bold', color: id === this.myId ? '#ffe27a' : '#ffffff', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5, 1).setDepth(6600);
    const st = this.add.text(p.x, p.y, '', { fontSize: '13px' }).setOrigin(0.5, 1).setDepth(6600);
    const v = { sprite, shadow, name, st, hero: p.hero, x: p.x, y: p.y, px: p.x, py: p.y, dir: 'down', castUntil: 0, flashUntil: 0, hp: p.hp, alive: p.alive, jump: 0 };
    if (!p.alive) { sprite.setAlpha(0); shadow.setAlpha(0); }
    if (boss) { this.playFx(18, p.x, p.y - 30, 10, 0x8a5a2b); }
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

  syncDrops(state) {
    if (state.drops === this.lastDrops) return;
    this.lastDrops = state.drops;
    const items = (state.drops ? state.drops.split(';') : []).map((s) => { const [id, x, y, landAt] = s.split(':').map(Number); return { id, x, y, landAt }; });
    const ids = new Set(items.map((d) => d.id));
    this.dropViews.forEach((dv, id) => { if (!ids.has(id)) { dv.crate.destroy(); dv.glow.destroy(); this.dropViews.delete(id); } });
    items.forEach((d) => {
      if (this.dropViews.has(d.id)) return;
      const delay = Math.max(0, d.landAt - Date.now());
      const crate = this.add.image(d.x, d.y, 'tiles', 'crate').setOrigin(0.5, 1).setScale(4).setDepth(d.y).setTint(0xffe8a0).setVisible(delay < 50);
      const glow = this.add.image(d.x, d.y - 24, 'glow').setTint(0xffd166).setBlendMode(Phaser.BlendModes.ADD).setScale(2.2).setDepth(d.y - 1).setVisible(delay < 50);
      this.time.delayedCall(delay, () => { crate.setVisible(true); glow.setVisible(true); });
      this.tweens.add({ targets: glow, alpha: { from: 0.4, to: 0.9 }, yoyo: true, repeat: -1, duration: 500 });
      this.dropViews.set(d.id, { crate, glow, x: d.x, y: d.y, landAt: d.landAt });
    });
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
}

Object.assign(ArenaScene.prototype, fxMixin, messagesMixin, hudMixin, strategyMixin);
