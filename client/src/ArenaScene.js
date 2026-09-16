import Phaser from 'phaser';
import {
  SP, GD, HEROES, faceUrl, ABILITIES, LEGENDS, BASIC, BOSS_NOVA, PASSIVES, STATUS, COMBOS, WORLD_EVENTS,
  OBJECT_FRAMES, GROUND, SCALE, iconStyle,
} from './gameData.js';
import { playSfx } from './audio.js';

// Physical key codes (not e.key) so bindings work on any keyboard language/layout.
const CODE_TO_ACTION = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  Digit1: 'slot0', Digit2: 'slot1', Digit3: 'slot2', KeyQ: 'legend', Digit4: 'legend', KeyR: 'bossNova', Space: 'basic',
};
const DIR_COL = { down: 0, up: 1, left: 2, right: 3 };
const FX_USED = [1, 3, 4, 5, 7, 8, 12, 13, 14, 15, 16, 18, 19, 20];
const PROJECTILE = {
  strike: { tex: 'shuriken', scale: 2.2, spin: true },
  fireball: { tex: 'fireball', scale: 3, trail: 0xff7a3c },
  ice_shard: { tex: 'icespike', scale: 3, trail: 0x8ae8ff },
  hunter_mark: { tex: 'arrow', scale: 3, trail: 0xff5e7a },
  fate_arrow: { tex: 'arrow', scale: 7, trail: 0xffe27a, tint: 0xffe27a, delay: 250 },
};
const BIG_OBJECTS = new Set(['cluster', 'tree', 'tree2', 'pine', 'house', 'hut', 'ruin', 'kiln']);
const clampNum = (v, a, b) => Math.max(a, Math.min(b, v));
const defOf = (id) => ABILITIES[id] || LEGENDS[id] || (id === BASIC.id ? BASIC : id === BOSS_NOVA.id ? BOSS_NOVA : null);

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
    FX_USED.forEach((n) => this.load.spritesheet('fx' + n, `${SP}/fx/${n}.png`, { frameWidth: 32, frameHeight: 32 }));
    this.load.image('tiles', `${SP}/background-elements/tileset.png`);
    this.load.image('village', `${GD}/tileset_village_abandoned.png`);
    this.load.image('floor', `${GD}/tileset_floor.png`);
    this.load.image('shuriken', `${SP}/hud/shuriken.png`);
    this.load.image('fireball', `${SP}/items/fireball.png`);
    this.load.image('icespike', `${SP}/items/ice-spike.png`);
    this.load.image('arrow', `${SP}/items/arrow.png`);
    this.load.image('heart', `${SP}/items/heart.png`);
  }

  create() {
    this.W = this.map.w; this.H = this.map.h;
    this.setupTextures();
    this.buildGround();
    this.buildObjects();

    this.gfxGround = this.add.graphics().setDepth(-900);   // trap marks, scorch, telegraphs
    this.gfxZone = this.add.graphics().setDepth(6000);
    this.gfxBars = this.add.graphics().setDepth(6500);
    this.gfxFx = this.add.graphics().setDepth(5000);
    this.views = new Map();
    this.projectiles = [];
    this.telegraphs = [];
    this.groundMarks = [];
    this.waves = [];
    this.auras = [];
    this.myTraps = [];
    this.pickupViews = new Map();
    this.lastPickups = null;
    this.keys = {};
    this.aimWorld = { x: this.W / 2, y: this.H / 2 };
    this.lastSent = { mx: 9, my: 9, t: 0 };
    this.lastPhase = null;
    this.huntActive = false;

    this.hud = getHudRefs();
    this.hud.root.classList.add('active');
    this.hud.helpPanel.innerHTML = '<b>🔗 الكومبوهات</b><br/>' + Object.values(COMBOS).map((c) => `<div class="cb"><span style="color:${c.color}">${c.nameAr}</span><br/>${c.recipe} → ${c.effect}</div>`).join('')
      + '<br/><b>🎮 التحكم</b><br/>WASD حركة · الماوس تصويب · Space/كليك شوريكن · 1 2 3 قدرات · Q أسطورية · R انفجار الوحش<br/>🌿 ادخل العشب الطويل لتختفي · 💧 الماء يبللك ويبطئك · 📦 اكسر الصناديق للشفاء';
    this.hud.helpBtn.addEventListener('click', () => this.hud.helpPanel.classList.toggle('show'));

    this.setupInput();
    this.setupMessages();

    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.W, this.H);
    cam.setZoom(Math.min(this.scale.width, this.scale.height) < 600 ? 0.6 : 1);
    this.scale.on('resize', (s) => cam.setZoom(Math.min(s.width, s.height) < 600 ? 0.6 : 1));
    cam.centerOn(this.W / 2, this.H / 2);
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

    Object.keys(HEROES).forEach((id) => {
      Object.entries(DIR_COL).forEach(([dir, col]) => {
        this.anims.create({ key: `${id}-walk-${dir}`, frames: this.anims.generateFrameNumbers('hero_' + id, { frames: [col, 4 + col, 8 + col, 12 + col] }), frameRate: 9, repeat: -1 });
      });
    });
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
    // scattered flowers / grass tufts on open grass
    for (let i = 0; i < 160; i++) {
      const c = Math.floor(rng() * cols), r = Math.floor(rng() * rows);
      if (isIn(this.map.dirt, c, r) || isIn(this.map.ponds, c, r, 1)) continue;
      const kind = rng() < 0.45 ? 'flower' : rng() < 0.6 ? 'grass' : 'fern';
      draw('tiles', kind, c * 16 + Math.floor(rng() * 6), r * 16 + Math.floor(rng() * 6));
    }
    rt.endDraw();
    stamp.destroy();

    // animated water shimmer
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
    this.joyGfx = this.add.graphics().setScrollFactor(0).setDepth(9000);
    this.moveTouch = null;
    this.aimTouch = null;
    this.input.on('pointerdown', (p) => {
      if (p.pointerType !== 'touch') { if (p.leftButtonDown()) this.cast('strike'); return; }
      if (p.x < this.scale.width * 0.5) this.moveTouch = { id: p.id, bx: p.x, by: p.y, cx: p.x, cy: p.y };
      else { this.aimTouch = p; this.updateAim(); this.cast('strike'); }
    });
    this.input.on('pointermove', (p) => { if (this.moveTouch && p.id === this.moveTouch.id) { this.moveTouch.cx = p.x; this.moveTouch.cy = p.y; } });
    this.input.on('pointerup', (p) => {
      if (this.moveTouch && p.id === this.moveTouch.id) this.moveTouch = null;
      if (this.aimTouch && p.id === this.aimTouch.id) this.aimTouch = null;
    });
    this.hud.hotbar.addEventListener('pointerdown', (e) => {
      const slot = e.target.closest('.slot');
      if (slot) { e.preventDefault(); this.cast(slot.dataset.cast); }
    });
    this.hud.bossPrompt.addEventListener('pointerdown', () => this.cast('boss_nova'));
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
    else if (a === 'bossNova') this.cast('boss_nova');
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
    const me = this.room.state.players.get(this.myId);
    if (this.aimTouch) { const w = this.cameras.main.getWorldPoint(this.aimTouch.x, this.aimTouch.y); this.aimWorld = { x: w.x, y: w.y }; return; }
    if (this.input.activePointer && this.input.activePointer.pointerType !== 'touch') {
      const p = this.input.activePointer;
      const w = this.cameras.main.getWorldPoint(p.x, p.y); this.aimWorld = { x: w.x, y: w.y }; return;
    }
    // touch without an active aim finger: auto-aim at the nearest visible enemy
    if (me) { const t = this.nearestEnemy(me); if (t) this.aimWorld = { x: t.x, y: t.y }; }
  }

  cast(abilityId) {
    if (!abilityId) return;
    const me = this.room.state.players.get(this.myId);
    if (!me || !me.alive) return;
    this.updateAim();
    this.room.send('cast', { abilityId, tx: this.aimWorld.x, ty: this.aimWorld.y });
  }
  // ---------------------------------------------------------------- network messages
  setupMessages() {
    const r = this.room;
    r.onMessage('cast', (m) => this.onCast(m));
    r.onMessage('impact', (m) => this.onImpact(m));
    r.onMessage('combo', (m) => { const c = COMBOS[m.id]; if (c) { this.floatText(m.x, m.y - 60, c.nameAr, c.color, 22); this.playFx(3, m.x, m.y - 10, 3, Phaser.Display.Color.HexStringToColor(c.color).color); playSfx('upgrade'); } });
    r.onMessage('crit', (m) => this.floatText(m.x + 20, m.y - 50, 'حرجة!', '#ffd166', 14));
    r.onMessage('bolts', (m) => this.onBolts(m));
    r.onMessage('hop', (m) => {
      const v = this.views.get(m.casterId);
      if (v) { this.playFx(18, v.x, v.y - 20, 2.5, 0x9d7bff); v.x = m.x; v.y = m.y; }
      this.playFx(7, m.tx, m.ty - 20, 3, 0xb9a6ff); this.playFx(18, m.x, m.y - 20, 2, 0x9d7bff);
      this.cameras.main.shake(90, 0.004);
    });
    r.onMessage('propBreak', (m) => {
      this.playFx(18, m.x, m.y - 20, 2.4, 0xc28e5c);
      this.burst(m.x, m.y - 20, 0xa8683a, { count: 16, speedMax: 220, scale: 1.2, gravity: 500, tex: 'pixel' });
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
      this.playFx(18, x, y - 20, 3.5, 0xdddddd);
      this.burst(x, y - 20, 0xff4d4d, { count: 26, speedMax: 260, scale: 1.4, gravity: 300 });
      if (m.victimId === this.myId) { playSfx('death'); this.toast('💀 تم إقصاؤك — شاهد باقي الجولة', 3500); }
      else if (!m.killerName) this.pushFeed(`☠ ${this.nameOf(m.victimId)} سقط خارج المنطقة الآمنة`);
    });
    r.onMessage('bossHunt', (m) => {
      this.huntActive = true;
      this.showBanner(`⚠ بدأ الصيد! الهدف: ${m.name}`, 3500);
      this.cameras.main.shake(220, 0.006);
      playSfx('boss_warning');
    });
    r.onMessage('bossResolved', (m) => { this.huntActive = false; this.showBanner(m.survived ? `👑 الوحش ${m.name} نجا!` : `🏹 تم إسقاط الوحش!`, 2800); });
    r.onMessage('worldEvent', (m) => { this.showBanner(WORLD_EVENTS[m.id] || m.id, 2800); playSfx('world_event'); });
    r.onMessage('finalDuel', (m) => this.showBanner(`🗡 المبارزة الأخيرة: ${m.a} ضد ${m.b}`, 3200));
    r.onMessage('matchStart', () => { this.myTraps = []; this.showBanner('⚔ ابدأ القتال!', 2000); });
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
      v.castUntil = now + 240;
      const dx = m.tx - m.x, dy = m.ty - m.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) v.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    }
    const color = def.color || 0xffffff;
    const id = m.abilityId;
    const mine = m.casterId === this.myId;
    if (PROJECTILE[id]) {
      const cfg = PROJECTILE[id];
      const dir = new Phaser.Math.Vector2(m.tx - m.x, m.ty - m.y).normalize();
      if (dir.lengthSq() === 0) dir.set(1, 0);
      const img = this.add.image(m.x, m.y - 10, cfg.tex).setScale(cfg.scale).setDepth(4000).setRotation(Math.atan2(dir.y, dir.x));
      if (cfg.tint) img.setTint(cfg.tint);
      if (cfg.delay) img.setVisible(false);
      this.projectiles.push({ id, img, x: m.x, y: m.y - 10, dir, speed: def.speed, range: def.range, travelled: 0, cfg, startAt: now + (cfg.delay || 0), casterId: m.casterId });
      playSfx(id === 'strike' ? 'cast_mobility' : 'cast_offensive');
      return;
    }
    switch (id) {
      case 'lightning': case 'earth_prison': case 'boss_nova': case 'ice_age':
        this.telegraphs.push({ x: m.tx, y: m.ty, r: def.radius, color, start: now, dur: def.telegraph });
        playSfx('cast_control'); break;
      case 'meteor_storm':
        this.telegraphs.push({ x: m.tx, y: m.ty, r: 150 + def.radius, color, start: now, dur: def.telegraph + 1200 });
        this.showBannerLocal(mine, '☄️ مطر النيازك!');
        playSfx('cast_area'); break;
      case 'black_hole':
        this.auras.push({ kind: 'vortex', x: m.tx, y: m.ty, start: now, dur: def.telegraph, color, r: def.pullRadius });
        playSfx('cast_control'); break;
      case 'thunderstorm':
        this.auras.push({ kind: 'storm', followId: m.casterId, start: now, dur: def.telegraph, color, r: def.radius });
        playSfx('cast_area'); break;
      case 'gust': case 'tsunami': {
        const dir = new Phaser.Math.Vector2(m.tx - m.x, m.ty - m.y).normalize();
        this.waves.push({ id, ox: m.x, oy: m.y, dir, speed: def.speed, width: def.width, length: def.length, color, start: now + (def.telegraph || 0), lastSpawn: 0 });
        playSfx('cast_area'); break;
      }
      case 'dash':
        this.playFx(18, m.x, m.y - 16, 1.8, 0xb9a6ff);
        if (v) for (let i = 1; i <= 4; i++) {
          const gx = m.x + (m.tx - m.x) * i / 5, gy = m.y + (m.ty - m.y) * i / 5;
          const ghost = this.add.image(gx, gy + 6, v.sprite.texture.key, v.sprite.frame.name).setOrigin(0.5, 1).setScale(SCALE).setTint(0x9d7bff).setAlpha(0.5).setDepth(gy);
          this.tweens.add({ targets: ghost, alpha: 0, duration: 380, delay: i * 30, onComplete: () => ghost.destroy() });
        }
        if (v) { v.x = m.tx; v.y = m.ty; }
        playSfx('cast_mobility'); break;
      case 'shield':
        this.auras.push({ kind: 'bubble', followId: m.casterId, start: now, dur: 2000, color: 0xffd166 });
        playSfx('cast_defensive'); break;
      case 'kings_fortress':
        this.auras.push({ kind: 'bubble', followId: m.casterId, start: now, dur: 3000, color: 0xffd166, big: true });
        this.playFx(3, m.x, m.y - 20, 4, 0xffd166);
        playSfx('cast_defensive'); break;
      case 'heal_spring':
        this.auras.push({ kind: 'heal', followId: m.casterId, start: now, dur: 2000, color: 0x7dffb0 });
        playSfx('cast_defensive'); break;
      case 'dragon_breath':
        playSfx('cast_area'); break;
      case 'shadow_strike':
        playSfx('cast_mobility'); break;
      case 'trap':
        playSfx('cast_mobility'); break;
      default: break;
    }
  }

  onImpact(m) {
    const t = m.type;
    const near = (id, pierce) => {
      let best = -1, bd = 90;
      this.projectiles.forEach((p, i) => { if ((id === null || p.id === id) && !(pierce && p.id === 'fate_arrow')) { const d = Math.hypot(p.x - m.x, p.y - m.y); if (d < bd) { bd = d; best = i; } } });
      if (best >= 0) { this.projectiles[best].img.destroy(); this.projectiles.splice(best, 1); }
    };
    if (t === 'poof') { near(null, true); this.playFx(18, m.x, m.y, 1.2, 0xcccccc); return; }
    if (PROJECTILE[t]) {
      if (t !== 'fate_arrow') near(t);
      const color = defOf(t).color;
      this.playFx(8, m.x, m.y, t === 'fate_arrow' ? 4 : 2, color);
      this.burst(m.x, m.y, color, { count: 8, speedMax: 160, scale: 0.8 });
      return;
    }
    const shake = (ms, k) => {
      const me = this.room.state.players.get(this.myId);
      const d = me ? Math.hypot(me.x - m.x, me.y - m.y) : 0;
      const f = clampNum(1 - d / 600, 0, 1);
      if (f > 0) this.cameras.main.shake(ms, k * f);
    };
    switch (t) {
      case 'lightning':
        this.drawBolt(m.x, m.y - 420, m.x, m.y, 0xfff27a);
        this.playFx(19, m.x, m.y - 20, 4, 0xfff27a);
        this.burst(m.x, m.y, 0xfff27a, { count: 14, speedMax: 240 });
        shake(120, 0.006); playSfx('impact'); break;
      case 'earth':
        this.playFx(18, m.x, m.y - 10, 7, 0xa0703f);
        this.burst(m.x, m.y, 0x8a5a2b, { count: 30, speedMax: 300, scale: 1.4, gravity: 600, tex: 'pixel' });
        this.groundMarks.push({ x: m.x, y: m.y, r: m.radius, color: 0x4f7a2a, start: performance.now(), dur: 2200, vines: true });
        shake(160, 0.008); playSfx('impact'); break;
      case 'meteor': {
        const rock = this.add.image(m.x + 120, m.y - 420, 'fireball').setScale(6).setDepth(5500).setRotation(Math.atan2(420, -120));
        this.tweens.add({ targets: rock, x: m.x, y: m.y, duration: 110, onComplete: () => rock.destroy() });
        this.time.delayedCall(110, () => {
          this.playFx(12, m.x, m.y - 30, 5, null);
          this.burst(m.x, m.y, 0xff6a3d, { count: 28, speedMax: 320, scale: 1.5 });
          this.groundMarks.push({ x: m.x, y: m.y, r: m.radius * 0.8, color: 0x2a1a10, start: performance.now(), dur: 5000 });
          shake(200, 0.012); playSfx('impact');
        });
        break;
      }
      case 'ice':
        this.playFx(14, m.x, m.y - 20, 9, 0x9fe8ff);
        this.burst(m.x, m.y, 0xcff6ff, { count: 40, speedMax: 380, scale: 1.2 });
        this.groundMarks.push({ x: m.x, y: m.y, r: m.radius, color: 0x9fe8ff, start: performance.now(), dur: 2500, alpha: 0.28 });
        shake(160, 0.008); playSfx('impact'); break;
      case 'nova':
        this.playFx(1, m.x, m.y - 10, 10, 0xff3d81);
        this.burst(m.x, m.y, 0xff3d81, { count: 30, speedMax: 340, scale: 1.4 });
        shake(180, 0.01); playSfx('impact'); break;
      case 'splash':
        this.playFx(15, m.x, m.y - 20, 5, null);
        this.burst(m.x, m.y, 0x4cb6ff, { count: 22, speedMax: 260, gravity: 400 });
        playSfx('cast_mobility'); break;
      case 'blackhole':
        this.playFx(1, m.x, m.y - 10, 9, 0xb388ff);
        this.burst(m.x, m.y, 0xb388ff, { count: 36, speedMax: 360, scale: 1.3 });
        shake(200, 0.012); playSfx('impact'); break;
      case 'breath': {
        const base = Math.atan2(m.dy, m.dx);
        for (let i = 0; i < 7; i++) {
          const a = base + (Math.random() - 0.5) * 1.1, d = 60 + Math.random() * (m.radius - 60);
          this.playFx(20, m.x + Math.cos(a) * d, m.y - 16 + Math.sin(a) * d, 3 + Math.random() * 2, null);
        }
        const e = this.add.particles(m.x, m.y - 16, 'spark', { angle: { min: Phaser.Math.RadToDeg(base) - 34, max: Phaser.Math.RadToDeg(base) + 34 }, speed: { min: 300, max: 620 }, lifespan: 480, scale: { start: 1.6, end: 0 }, tint: [0xffd166, 0xff7a3c, 0xff3d1f], blendMode: 'ADD', emitting: false }).setDepth(5000);
        e.explode(40); this.time.delayedCall(600, () => e.destroy());
        playSfx('cast_area'); break;
      }
      case 'heal':
        this.playFx(5, m.x, m.y, 3, 0x7dffb0);
        this.burst(m.x, m.y, 0x7dffb0, { count: 12, speedMax: 120 });
        break;
      case 'trap':
        this.playFx(16, m.x, m.y - 10, 3, 0x9ccc65);
        this.groundMarks.push({ x: m.x, y: m.y, r: 40, color: 0x4f7a2a, start: performance.now(), dur: 1500, vines: true });
        this.myTraps = this.myTraps.filter((k) => Math.hypot(k.x - m.x, k.y - m.y) > 5);
        playSfx('impact'); break;
      default: break;
    }
  }

  onBolts(m) {
    this.playFx(19, m.x, m.y - 30, 5, 0xfff27a);
    m.points.forEach((p, i) => this.time.delayedCall(i * 70, () => {
      this.drawBolt(p.x + (Math.random() - 0.5) * 60, p.y - 460, p.x, p.y - 10, 0xfff27a);
      this.playFx(19, p.x, p.y - 20, 3.5, 0xfff27a);
      this.burst(p.x, p.y, 0xfff9b0, { count: 10, speedMax: 220 });
    }));
    this.cameras.main.flash(120, 255, 250, 200);
    playSfx('impact');
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
    const count = o.count ?? 12;
    const life = o.life ?? 520;
    const e = this.add.particles(x, y, o.tex || 'spark', {
      lifespan: life, speed: { min: o.speedMin ?? 40, max: o.speedMax ?? 200 }, scale: { start: o.scale ?? 1, end: 0 },
      alpha: { start: 1, end: 0 }, tint: color, gravityY: o.gravity || 0, blendMode: o.tex === 'pixel' ? 'NORMAL' : 'ADD', emitting: false,
    }).setDepth(5100);
    e.explode(count);
    this.time.delayedCall(life + 80, () => e.destroy());
  }

  drawBolt(x1, y1, x2, y2, color) {
    const g = this.add.graphics().setDepth(5300);
    const segs = 9;
    const pts = [[x1, y1]];
    for (let i = 1; i < segs; i++) pts.push([x1 + (x2 - x1) * i / segs + (Math.random() - 0.5) * 34, y1 + (y2 - y1) * i / segs]);
    pts.push([x2, y2]);
    [[10, color, 0.35], [4, color, 1], [2, 0xffffff, 1]].forEach(([w, c, a]) => {
      g.lineStyle(w, c, a); g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); pts.forEach(([px, py]) => g.lineTo(px, py)); g.strokePath();
    });
    this.tweens.add({ targets: g, alpha: 0, duration: 260, onComplete: () => g.destroy() });
  }

  floatText(x, y, text, color = '#ffffff', size = 16) {
    const t = this.add.text(x, y, text, { fontFamily: 'Tahoma, Segoe UI', fontSize: size + 'px', fontStyle: 'bold', color, stroke: '#000000', strokeThickness: 4 }).setOrigin(0.5).setDepth(7000);
    this.tweens.add({ targets: t, y: y - 46, alpha: { from: 1, to: 0 }, duration: 1100, ease: 'Cubic.out', onComplete: () => t.destroy() });
  }

  showBannerLocal(mine, text) { if (mine) this.showBanner(text, 1400); }

  // ---------------------------------------------------------------- HUD helpers
  pushFeed(text) {
    const el = document.createElement('div');
    el.className = 'k';
    el.textContent = text;
    this.hud.killfeed.prepend(el);
    while (this.hud.killfeed.children.length > 6) this.hud.killfeed.lastChild.remove();
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

    this.sendInput(me, time);
    this.updateAim();
    this.syncPlayers(state, me, now, dt);
    this.syncProps(state);
    this.syncPickups(state);
    this.updateProjectiles(now, dt);
    this.updateWaves(now);
    this.drawWorldFx(state, me, now);
    this.updateObjectsFade(me);
    this.drawJoystick();
    this.followCamera(state, me);
    this.updateHud(state, me);
  }

  sendInput(me, time) {
    if (!me || !me.alive) return;
    let mx = 0, my = 0;
    if (this.moveTouch) {
      const dx = this.moveTouch.cx - this.moveTouch.bx, dy = this.moveTouch.cy - this.moveTouch.by;
      const len = Math.hypot(dx, dy);
      if (len > 8) { const k = Math.min(len, 60) / len / 60; mx = dx * k; my = dy * k; }
    } else {
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
      // spectate: follow whoever is alive (prefer the leader)
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
    state.players.forEach((p, id) => {
      seen.add(id);
      let v = this.views.get(id);
      if (!v) v = this.createView(p, id);
      if (v.hero !== p.hero) { v.hero = p.hero; v.sprite.setTexture('hero_' + p.hero, 0); }

      // smooth toward the server position (snap on big jumps: dash/teleport/respawn)
      const jump = Math.hypot(p.x - v.x, p.y - v.y);
      if (jump > 260) { v.x = p.x; v.y = p.y; }
      else { const k = Math.min(1, dt * 14); v.x += (p.x - v.x) * k; v.y += (p.y - v.y) * k; }

      // death transition
      if (v.alive && !p.alive) {
        v.alive = false;
        v.sprite.setTint(0x888888);
        this.tweens.add({ targets: [v.sprite, v.shadow], alpha: 0, angle: 90, duration: 500 });
      } else if (!v.alive && p.alive) {
        v.alive = true; v.sprite.clearTint(); v.sprite.setAlpha(1).setAngle(0); v.shadow.setAlpha(1);
        v.hp = p.hp;
      }

      // damage numbers + hit flash
      if (p.hp < v.hp - 0.5 && p.alive) {
        const lost = v.hp - p.hp;
        v.dmgAcc = (v.dmgAcc || 0) + lost;
        v.flashUntil = now + 90;
        if (v.dmgAcc >= 2) { this.floatText(v.x + (Math.random() - 0.5) * 20, v.y - 60, `-${Math.round(v.dmgAcc)}`, id === this.myId ? '#ff6b6b' : '#ffffff', 15); v.dmgAcc = 0; }
        if (id === this.myId) this.flashDamage();
      }
      v.hp = p.hp;

      const fx = p.fx ? p.fx.split(',') : [];
      const moving = Math.hypot(p.vx, p.vy) > 10 || jump > 3;
      if (now > v.castUntil && moving) {
        const vx = p.vx || (p.x - v.px), vy = p.vy || (p.y - v.py);
        if (Math.abs(vx) + Math.abs(vy) > 1) v.dir = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? 'right' : 'left') : (vy > 0 ? 'down' : 'up');
      }
      v.px = p.x; v.py = p.y;

      if (!p.alive) {
        v.sprite.setPosition(v.x, v.y + 6).setDepth(v.y);
        v.name.setVisible(false); v.st.setVisible(false);
        return;
      }

      // animation: walk / idle / cast pose
      const col = DIR_COL[v.dir];
      if (fx.includes('stun') || fx.includes('root')) { v.sprite.anims.stop(); v.sprite.setFrame(col); }
      else if (now < v.castUntil) { v.sprite.anims.stop(); v.sprite.setFrame(16 + col); }
      else if (moving) v.sprite.play(`${p.hero}-walk-${v.dir}`, true);
      else { v.sprite.anims.stop(); v.sprite.setFrame(col); }

      const scale = p.isBoss ? SCALE * 1.45 : SCALE;
      v.sprite.setScale(scale);
      const bob = fx.includes('airborne') ? -18 : 0;
      v.sprite.setPosition(v.x, v.y + 8 + bob).setDepth(v.y);
      v.shadow.setPosition(v.x, v.y + 6).setDepth(v.y - 1).setScale(p.isBoss ? 1.5 : 1);

      // visibility (tall grass hides you from anyone not close)
      let alpha = 1;
      const dMe = me ? Math.hypot(p.x - me.x, p.y - me.y) : 0;
      if (p.hidden) alpha = id === this.myId ? 0.55 : dMe < 150 || !me || !me.alive ? 0.55 : 0;
      if (p.invulnUntil > Date.now()) alpha *= 0.65 + 0.35 * Math.sin(now / 60);
      v.sprite.setAlpha(alpha); v.shadow.setAlpha(alpha * 0.9);

      // status tint
      if (now < v.flashUntil) v.sprite.setTintFill(0xffffff);
      else if (fx.includes('stun')) v.sprite.setTint(now % 300 < 150 ? 0xffffff : 0xbbbbbb);
      else if (fx.includes('chill')) v.sprite.setTint(0x9fe8ff);
      else if (fx.includes('burn')) v.sprite.setTint(now % 240 < 120 ? 0xffb080 : 0xffd0a0);
      else if (fx.includes('wet')) v.sprite.setTint(0xa8d0ff);
      else if (fx.includes('shock')) v.sprite.setTint(now % 160 < 80 ? 0xfff6a0 : 0xffffff);
      else if (p.isBoss) v.sprite.setTint(0xffc0d0);
      else v.sprite.clearTint();
      if (fx.includes('burn') && Math.random() < 0.25 && alpha > 0) this.burst(v.x + (Math.random() - 0.5) * 20, v.y - 20, 0xff7a3c, { count: 1, speedMin: 10, speedMax: 40, life: 400, scale: 0.9, gravity: -120 });
      if (fx.includes('shock') && Math.random() < 0.08 && alpha > 0) this.drawBolt(v.x - 14, v.y - 44, v.x + 14, v.y - 4, 0xfff27a);

      if (alpha <= 0.01) { v.name.setVisible(false); v.st.setVisible(false); return; }

      const topY = v.y + 8 + bob - 16 * scale;
      // boss aura
      if (p.isBoss) {
        const pulse = 0.5 + 0.5 * Math.sin(now / 180);
        g.lineStyle(3, 0xff3d81, 0.4 + pulse * 0.4); g.strokeEllipse(v.x, v.y + 6, 80 + pulse * 10, 34 + pulse * 4);
      }
      if (fx.includes('root')) { g.lineStyle(3, 0x6fae3a, 0.9); g.strokeEllipse(v.x, v.y + 6, 50, 20); g.lineStyle(2, 0x9ccc65, 0.9); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + now / 900; g.lineBetween(v.x + Math.cos(a) * 24, v.y + 6 + Math.sin(a) * 10, v.x + Math.cos(a) * 16, v.y - 14); } }
      if (fx.includes('mark')) { g.lineStyle(2, 0xff5e7a, 0.9); g.strokeCircle(v.x, topY - 34, 7); g.lineBetween(v.x - 11, topY - 34, v.x + 11, topY - 34); g.lineBetween(v.x, topY - 45, v.x, topY - 23); }

      // hp/shield bars
      const bw = 44, bx = v.x - bw / 2, by = topY - 12;
      const maxHp = p.maxHp + (p.isBoss ? 110 : 0);
      g.fillStyle(0x000000, 0.6); g.fillRect(bx - 1, by - 1, bw + 2, 7);
      g.fillStyle(id === this.myId ? 0x6dff8a : 0xff5a5a, 1); g.fillRect(bx, by, bw * clampNum(p.hp / maxHp, 0, 1), 5);
      if (p.shield > 0) { g.fillStyle(0x7dd8ff, 1); g.fillRect(bx, by - 4, bw * clampNum(p.shield / p.maxShield, 0, 1), 3); }

      v.name.setVisible(true).setPosition(v.x, by - 6).setText((p.isBoss ? '👑 ' : '') + p.name).setAlpha(Math.max(alpha, 0.5));
      const icons = fx.map((s) => (STATUS[s] ? STATUS[s].icon : '')).join('');
      v.st.setVisible(!!icons).setPosition(v.x, by - 22).setText(icons);
    });
    this.views.forEach((v, id) => { if (!seen.has(id)) { v.sprite.destroy(); v.shadow.destroy(); v.name.destroy(); v.st.destroy(); this.views.delete(id); } });
  }

  createView(p, id) {
    const shadow = this.add.ellipse(p.x, p.y + 6, 30, 10, 0x000000, 0.35);
    const sprite = this.add.sprite(p.x, p.y + 8, 'hero_' + p.hero, 0).setOrigin(0.5, 1).setScale(SCALE);
    const name = this.add.text(p.x, p.y, p.name, { fontFamily: 'Tahoma, Segoe UI', fontSize: '12px', fontStyle: 'bold', color: id === this.myId ? '#ffe27a' : '#ffffff', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5, 1).setDepth(6600);
    const st = this.add.text(p.x, p.y, '', { fontSize: '13px' }).setOrigin(0.5, 1).setDepth(6600);
    const v = { sprite, shadow, name, st, hero: p.hero, x: p.x, y: p.y, px: p.x, py: p.y, dir: 'down', castUntil: 0, flashUntil: 0, hp: p.hp, alive: p.alive };
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

  updateProjectiles(now, dt) {
    this.projectiles = this.projectiles.filter((p) => {
      if (now < p.startAt) {
        const v = this.views.get(p.casterId);
        if (v) { p.x = v.x; p.y = v.y - 10; p.img.setPosition(p.x, p.y); }
        return true;
      }
      p.img.setVisible(true);
      const step = p.speed * dt;
      p.x += p.dir.x * step; p.y += p.dir.y * step; p.travelled += step;
      p.img.setPosition(p.x, p.y);
      if (p.cfg.spin) p.img.rotation += dt * 18;
      if (p.cfg.trail && Math.random() < 0.7) this.burst(p.x, p.y, p.cfg.trail, { count: 1, speedMin: 5, speedMax: 30, life: 300, scale: p.id === 'fate_arrow' ? 1.6 : 0.8 });
      if (p.travelled > p.range) { p.img.destroy(); return false; }
      return true;
    });
  }

  updateWaves(now) {
    this.waves = this.waves.filter((w) => {
      if (now < w.start) return true;
      const front = w.speed * (now - w.start) / 1000;
      if (front > w.length) return false;
      if (now - w.lastSpawn > (w.id === 'tsunami' ? 90 : 70)) {
        w.lastSpawn = now;
        const nx = -w.dir.y, ny = w.dir.x;
        const n = w.id === 'tsunami' ? 5 : 3;
        for (let i = 0; i < n; i++) {
          const off = (i / (n - 1) - 0.5) * w.width;
          const x = w.ox + w.dir.x * front + nx * off, y = w.oy + w.dir.y * front + ny * off;
          if (w.id === 'tsunami') this.playFx(15, x, y - 20, 4.5, null);
          else this.playFx(13, x, y - 20, 2.6, 0xffffff);
        }
      }
      return true;
    });
  }
  drawWorldFx(state, me, now) {
    const gg = this.gfxGround, gf = this.gfxFx, gz = this.gfxZone;
    gg.clear(); gf.clear(); gz.clear();
    // ground marks (scorch, frost, vines)
    this.groundMarks = this.groundMarks.filter((m) => now - m.start < m.dur);
    this.groundMarks.forEach((m) => {
      const t = (now - m.start) / m.dur;
      gg.fillStyle(m.color, (1 - t) * (m.alpha || 0.45)); gg.fillEllipse(m.x, m.y, m.r * 2, m.r * 1.2);
      if (m.vines) { gg.lineStyle(3, 0x6fae3a, 1 - t); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; gg.lineBetween(m.x, m.y, m.x + Math.cos(a) * m.r * 0.9, m.y + Math.sin(a) * m.r * 0.5); } }
    });
    // my hidden traps
    const tnow = Date.now();
    this.myTraps = this.myTraps.filter((k) => k.expiresAt > tnow);
    this.myTraps.forEach((k) => { gg.lineStyle(2, 0x9ccc65, 0.6); gg.strokeEllipse(k.x, k.y, 60, 30); gg.fillStyle(0x6fae3a, 0.25); gg.fillEllipse(k.x, k.y, 60, 30); });
    // telegraphs
    this.telegraphs = this.telegraphs.filter((t) => now - t.start < t.dur);
    this.telegraphs.forEach((t) => {
      const k = (now - t.start) / t.dur;
      const pulse = 0.5 + 0.5 * Math.sin(k * Math.PI * 8);
      gg.fillStyle(t.color, 0.12 + pulse * 0.08); gg.fillEllipse(t.x, t.y, t.r * 2, t.r * 1.4);
      gg.lineStyle(3, t.color, 0.7 + pulse * 0.3); gg.strokeEllipse(t.x, t.y, t.r * 2, t.r * 1.4);
      gg.fillStyle(t.color, 0.25); gg.fillEllipse(t.x, t.y, t.r * 2 * k, t.r * 1.4 * k);
    });
    // auras that follow a player or sit in the world
    this.auras = this.auras.filter((a) => now - a.start < a.dur);
    this.auras.forEach((a) => {
      const k = (now - a.start) / a.dur;
      const v = a.followId ? this.views.get(a.followId) : null;
      const x = v ? v.x : a.x, y = v ? v.y : a.y;
      if (a.followId && !v) return;
      if (a.kind === 'bubble') {
        const r = a.big ? 46 : 36;
        gf.fillStyle(a.color, 0.14); gf.fillCircle(x, y - 20, r);
        gf.lineStyle(3, a.color, 0.8 - k * 0.3); gf.strokeCircle(x, y - 20, r + Math.sin(now / 90) * 2);
      } else if (a.kind === 'heal') {
        if (Math.random() < 0.35) this.burst(x + (Math.random() - 0.5) * 40, y - 10, 0x7dffb0, { count: 1, speedMin: 10, speedMax: 30, life: 600, gravity: -160 });
        gg.lineStyle(2, 0x7dffb0, 0.6); gg.strokeEllipse(x, y + 6, 70, 26);
      } else if (a.kind === 'vortex') {
        gg.fillStyle(0x1a0a2a, 0.35 + k * 0.25); gg.fillEllipse(x, y, a.r * 2 * (1 - k * 0.5), a.r * 1.3 * (1 - k * 0.5));
        for (let i = 0; i < 5; i++) {
          const ang = now / 160 + i * 1.256, rr = a.r * (1 - ((now / 900 + i * 0.2) % 1));
          gf.lineStyle(3, a.color, 0.8); gf.beginPath(); gf.arc(x, y, rr, ang, ang + 1.2); gf.strokePath();
        }
        gf.fillStyle(0x000000, 1); gf.fillCircle(x, y, 18 + k * 10); gf.lineStyle(3, a.color, 1); gf.strokeCircle(x, y, 20 + k * 10);
      } else if (a.kind === 'storm') {
        gg.lineStyle(3, a.color, 0.35 + 0.35 * Math.sin(now / 60)); gg.strokeEllipse(x, y, a.r * 2, a.r * 1.4);
        gf.fillStyle(0x10102a, 0.2 * k); gf.fillCircle(x, y, a.r);
      }
    });

    // shrinking safe zone: darken & tint everything outside the circle
    const cx = this.W / 2, cy = this.H / 2, r = state.safeRadius;
    gz.lineStyle(3000, 0x2a0010, 0.35); gz.strokeCircle(cx, cy, r + 1500);
    const pulse = 0.5 + 0.5 * Math.sin(now / 250);
    gz.lineStyle(10, 0xff3d3d, 0.25 + pulse * 0.2); gz.strokeCircle(cx, cy, r + 4);
    gz.lineStyle(3, 0xff7070, 0.9); gz.strokeCircle(cx, cy, r);
    const rot = now / 3000;
    gz.lineStyle(4, 0xffc4a0, 0.6);
    for (let i = 0; i < 36; i += 2) { gz.beginPath(); gz.arc(cx, cy, r - 6, rot + i / 36 * Math.PI * 2, rot + (i + 0.7) / 36 * Math.PI * 2); gz.strokePath(); }
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

  drawJoystick() {
    const g = this.joyGfx;
    g.clear();
    if (!this.moveTouch) return;
    const { bx, by, cx, cy } = this.moveTouch;
    const dx = cx - bx, dy = cy - by, len = Math.hypot(dx, dy), k = len > 60 ? 60 / len : 1;
    g.fillStyle(0x000000, 0.25); g.fillCircle(bx, by, 60);
    g.lineStyle(3, 0xffd166, 0.6); g.strokeCircle(bx, by, 60);
    g.fillStyle(0xffd166, 0.7); g.fillCircle(bx + dx * k, by + dy * k, 24);
  }

  flashDamage() {
    this.hud.dmgFlash.style.opacity = '0.8';
    clearTimeout(this._dmgT);
    this._dmgT = setTimeout(() => { this.hud.dmgFlash.style.opacity = '0'; }, 160);
  }

  updateHud(state, me) {
    const h = this.hud;
    if (me) {
      const maxHp = me.maxHp + (me.isBoss ? 110 : 0);
      h.hpFill.style.width = `${clampNum(me.hp / maxHp, 0, 1) * 100}%`;
      h.shieldFill.style.width = `${clampNum(me.shield / me.maxShield, 0, 1) * 100}%`;
      const stats = `القتلات: ${me.kills} · الصحة: ${Math.ceil(me.hp)}`;
      if (stats !== this._lastStats) { h.statsLine.textContent = stats; this._lastStats = stats; }
      if (this._face !== me.hero) { this._face = me.hero; h.selfFace.style.backgroundImage = `url('${faceUrl(me.hero)}')`; h.selfFace.style.backgroundSize = 'cover'; }
      const st = me.fx ? me.fx.split(',').map((s) => STATUS[s] ? STATUS[s].icon : '').join(' ') : '';
      if (st !== this._lastSt) { h.selfStatus.textContent = st; this._lastSt = st; }
      h.bossPrompt.classList.toggle('show', !!me.isBoss && me.alive);
      this.renderHotbar(me);
      const pas = [...me.passives].map((id) => `<span class="p" title="${PASSIVES[id] ? PASSIVES[id].desc : ''}">${PASSIVES[id] ? PASSIVES[id].icon + ' ' + PASSIVES[id].nameAr : id}</span>`).join('');
      if (pas !== this._lastPas) { h.passives.innerHTML = `<div class="ttl">القدرات الجانبية (${me.passives.length})</div>${pas}`; this._lastPas = pas; }
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
    if (state.bossId) {
      const boss = state.players.get(state.bossId);
      h.bossBar.classList.add('show');
      if (boss) { h.bossLbl.textContent = `👑 الوحش: ${boss.name}`; h.bossFill.style.width = `${clampNum(boss.hp / (boss.maxHp + 110), 0, 1) * 100}%`; }
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
      + slot(me.legend, 'Q', LEGENDS[me.legend], 'legend');
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
    bossPrompt: byId('bossPrompt'), waiting: byId('waiting'), waitingCountdown: byId('waitingCountdown'),
    roundEnd: byId('roundEnd'), reTitle: byId('reTitle'), reTable: byId('reTable'), dmgFlash: byId('dmgFlash'),
    helpBtn: byId('helpBtn'), helpPanel: byId('helpPanel'),
  };
}
