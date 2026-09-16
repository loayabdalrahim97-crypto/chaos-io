import Phaser from 'phaser';
import { ABILITIES, RARITY_COLOR, PASSIVES, BASIC_ABILITY_ID, TYPE_ICON } from './abilityData.js';
import { playSfx, castSfxFor } from './audio.js';

// Physical-keycode map (not e.key) so WASD/number/R bindings work regardless of the
// player's OS keyboard language/layout — see server-side lesson from the earlier
// single-file prototype: relying on e.key breaks on non-Latin layouts.
const CODE_TO_ACTION = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  Digit1: 'slot0', Digit2: 'slot1', Digit3: 'slot2', Digit4: 'slot3',
  KeyR: 'bossNova',
  Space: 'basic',
};

const RING_HEX = (h) => parseInt(h.replace('#', ''), 16);
const clampNum = (v, a, b) => Math.max(a, Math.min(b, v));

// The server's `ring` colors are pale pastels (readable as thin accent lines/auras),
// but painted flat across a whole character body they wash out toward white —
// especially where two players' translucent silhouettes overlap. This maps each
// pastel ring to a richer, more saturated tone used specifically for the body/head
// fill, so every player stays visually distinct at a glance.
const BODY_PALETTE = {
  '#ffe27a': 0xf2a93c,
  '#c9d6ff': 0x5678ff,
  '#ffc9de': 0xff4fa3,
  '#c9ffe0': 0x22c98a,
  '#e0c9ff': 0x9b4fff,
  '#fff3c9': 0xe8b93a,
};

// Deterministic per-session-id phase offset so idle bobs aren't all in lockstep —
// purely cosmetic, never sent to/from the server.
function hashPhase(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000 * Math.PI * 2;
}

// Small deterministic PRNG so the one-time arena decoration looks the same every
// time it's generated (no need to sync it — it's purely cosmetic and client-local).
function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export default class ArenaScene extends Phaser.Scene {
  constructor() { super('arena'); }

  init(data) {
    this.room = data.room;
    this.myId = this.room.sessionId;
  }

  create() {
    this.cameras.main.setBackgroundColor('#050308');
    this.generateTextures();

    // draw order (back to front): static decor -> ground marks -> orb -> zone ->
    // ability fx -> players/names
    this.gfxDecor = this.add.graphics();
    this.gfxGround = this.add.graphics();
    this.gfxOrb = this.add.graphics();
    this.gfxZone = this.add.graphics();
    this.gfxFx = this.add.graphics();
    this.gfxPlayers = this.add.graphics();
    this.nameTexts = new Map(); // sessionId -> Phaser.Text
    this.pv = new Map(); // sessionId -> local-only visual/animation state
    this.groundMarks = []; // {x,y,radius,color,start,dur}

    this.keys = {};
    this.input.keyboard.on('keydown', (e) => this.onKey(e, true));
    this.input.keyboard.on('keyup', (e) => this.onKey(e, false));

    // ---- touch controls: left half = virtual joystick, right half = aim ----
    this.joyGfx = this.add.graphics().setScrollFactor(0).setDepth(50);
    this.moveTouch = null; // {id, baseX, baseY, curX, curY}
    this.aimPointer = null; // right-side touch pointer used for aim, if any
    this.input.on('pointerdown', (p) => {
      if (p.pointerType !== 'touch') {
        // desktop: left-click anywhere on the canvas fires the basic attack (DOM elements
        // like the hotbar sit above the canvas and swallow the click before it gets here,
        // so this never double-fires with the hotbar's own delegated tap-to-cast).
        if (p.leftButtonDown()) this.castBasic();
        return;
      }
      if (p.x < this.scale.width * 0.52) this.moveTouch = { id: p.id, baseX: p.x, baseY: p.y, curX: p.x, curY: p.y };
      else this.aimPointer = p;
    });
    this.input.on('pointermove', (p) => {
      if (this.moveTouch && p.id === this.moveTouch.id) { this.moveTouch.curX = p.x; this.moveTouch.curY = p.y; }
    });
    this.input.on('pointerup', (p) => {
      if (this.moveTouch && p.id === this.moveTouch.id) this.moveTouch = null;
      if (this.aimPointer && p.id === this.aimPointer.id) this.aimPointer = null;
    });

    // tap-to-cast: delegate clicks on the hotbar/boss-prompt DOM overlay
    document.getElementById('hotbar').addEventListener('pointerdown', (e) => {
      const slot = e.target.closest('.slot');
      if (!slot) return;
      if (slot.dataset.idx === 'basic') this.castBasic();
      else this.castSlot(Number(slot.dataset.idx));
    });
    document.getElementById('bossPrompt').addEventListener('pointerdown', () => this.castBossNova());

    this.localEffects = [];
    this.lastInputSentAt = 0;
    this.localCountdownMs = 0;
    this.lastSeenCountdown = -1;
    this.lastPhase = null;
    this.upgradeShown = false;
    this.huntActive = false;
    this.huntCountdownMs = 0;

    this.hud = getHudRefs();
    this.hud.root.classList.add('active');

    this.room.state.players.onAdd((p, key) => {
      const t = this.add.text(0, 0, '', { fontFamily: 'Segoe UI, Tahoma, sans-serif', fontSize: '12px', color: '#f0ecff' })
        .setOrigin(0.5, 1).setDepth(10);
      this.nameTexts.set(key, t);
      this.pv.set(key, {
        phase: hashPhase(key), prevHp: p.hp, prevShield: p.shield,
        hitAt: -9999, castAt: -9999, castColor: 0xffffff, deathAt: -9999,
        wasAlive: p.alive, facing: 0,
      });
    });
    this.room.state.players.onRemove((p, key) => {
      const t = this.nameTexts.get(key);
      if (t) t.destroy();
      this.nameTexts.delete(key);
      this.pv.delete(key);
    });

    this.room.onMessage('cast', (m) => { this.onCastFx(m); const def = ABILITIES[m.abilityId]; if (def) castSfxFor(def.type); });
    this.room.onMessage('impact', (m) => { this.onImpactFx(m); playSfx('impact'); });
    this.room.onMessage('killfeed', (m) => { this.pushKillfeed(`${m.killer} ⚔ ${m.victim}`); playSfx('killfeed'); });
    this.room.onMessage('death', (m) => {
      if (!m.killerName) this.pushKillfeed(`${this.nameOf(m.victimId)} خرج من الحدود الآمنة`);
      if (m.victimId === this.myId) playSfx('death');
    });
    this.room.onMessage('bossHunt', (m) => this.startHuntBanner(m.name));
    this.room.onMessage('bossResolved', (m) => {
      this.endHuntBanner();
      this.showBanner(m.survived ? `الوحش ${m.name} نجا!` : `تم إسقاط الوحش!`, 2500);
    });
    this.room.onMessage('worldEvent', () => playSfx('world_event'));
    this.room.onMessage('finalDuel', (m) => this.showBanner(`🗡 المبارزة الأخيرة: ${m.a} ضد ${m.b}`, 3000));
    this.room.onMessage('toast', () => {});
    this.room.onMessage('matchStart', () => {});
    this.room.onMessage('roundEnd', (m) => { this.showRoundEnd(m); playSfx(m.winnerName && this.nameOf(this.myId) === m.winnerName ? 'victory' : 'defeat'); });
    this.room.onMessage('upgradeOffer', (m) => { this.showUpgradeOffer(m.options); playSfx('upgrade'); });
    this.room.onMessage('passiveAcquired', (m) => {
      if (m.playerId === this.myId) {
        this.showPassiveToast(m.passiveId);
        this.pushKillfeed(`قدرة جانبية جديدة: ${PASSIVES[m.passiveId]?.nameAr || m.passiveId}`);
      }
    });

    this.cameras.main.setBounds(0, 0, this.room.state.arenaW, this.room.state.arenaH);
    this.drawArenaDecor(this.room.state);

    // ambient floating dust across the arena — drawn once, runs continuously, cheap
    this.ambient = this.add.particles(0, 0, 'spark', {
      x: { min: 0, max: this.room.state.arenaW },
      y: { min: 0, max: this.room.state.arenaH },
      lifespan: 5000,
      speed: { min: 4, max: 14 },
      angle: { min: 250, max: 290 },
      scale: { start: 0.35, end: 0 },
      alpha: { start: 0.22, end: 0 },
      tint: [0x8877bb, 0x5566aa],
      frequency: 180,
      blendMode: 'ADD',
    });
  }

  // ---------------------------------------------------------------- setup helpers
  generateTextures() {
    if (this.textures.exists('spark')) return;
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xffffff, 1);
    g.fillCircle(8, 8, 8);
    g.generateTexture('spark', 16, 16);
    g.clear();
    g.destroy();
  }

  // one-off procedural particle burst — creates a short-lived emitter, explodes it once,
  // then cleans itself up. Cheap at this game's scale (a handful of casts/impacts at once).
  burst(x, y, color, opts = {}) {
    const count = opts.count ?? 14;
    const life = opts.life ?? 500;
    const e = this.add.particles(x, y, 'spark', {
      lifespan: life,
      speed: { min: opts.speedMin ?? 60, max: opts.speedMax ?? 220 },
      scale: { start: opts.scale ?? 0.9, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: color,
      blendMode: opts.blend || 'ADD',
      quantity: count,
      emitting: false,
    });
    e.explode(count);
    this.time.delayedCall(life + 60, () => e.destroy());
  }

  addGroundMark(x, y, radius, color, dur) {
    this.groundMarks.push({ x, y, radius, color, start: performance.now(), dur });
    if (this.groundMarks.length > 24) this.groundMarks.shift();
  }

  // ---------------------------------------------------------------- static arena decor
  drawArenaDecor(state) {
    const g = this.gfxDecor;
    g.clear();
    const W = state.arenaW, H = state.arenaH, cx = W / 2, cy = H / 2;

    g.fillStyle(0x0b0918, 1);
    g.fillRect(0, 0, W, H);

    // poor-man's radial glow toward the arena center (concentric fading circles)
    const maxR = Math.max(W, H) * 0.75;
    const rings = 10;
    for (let i = rings; i >= 1; i--) {
      g.fillStyle(0x2a1f52, 0.02 + (1 - i / rings) * 0.05);
      g.fillCircle(cx, cy, maxR * (i / rings));
    }

    // faint grid — present but no longer the dominant visual element
    g.lineStyle(1, 0x181430, 0.5);
    const step = 100;
    for (let x = 0; x <= W; x += step) g.lineBetween(x, 0, x, H);
    for (let y = 0; y <= H; y += step) g.lineBetween(0, y, W, y);

    // border frame with an inner glow band
    g.lineStyle(6, 0x2c2450, 0.9);
    g.strokeRect(3, 3, W - 6, H - 6);
    g.lineStyle(1, 0x554a99, 0.6);
    g.strokeRect(14, 14, W - 28, H - 28);

    const rng = mulberry32(1337);

    // scattered ruin pillars ringing the arena
    const pillarCount = 16;
    for (let i = 0; i < pillarCount; i++) {
      const ang = (i / pillarCount) * Math.PI * 2 + rng() * 0.2;
      const rad = Math.min(W, H) * (0.46 + rng() * 0.06);
      const px = clampNum(cx + Math.cos(ang) * rad, 40, W - 40);
      const py = clampNum(cy + Math.sin(ang) * rad, 40, H - 40);
      this.drawPillar(g, px, py, 14 + rng() * 10, 34 + rng() * 26);
    }

    // scattered rocks, kept clear of the central fighting area
    for (let i = 0; i < 10; i++) {
      const px = rng() * W, py = rng() * H;
      if (Math.hypot(px - cx, py - cy) < Math.min(W, H) * 0.22) continue;
      this.drawRock(g, px, py, 10 + rng() * 14, rng());
    }

    // four corner energy crystals for visually interesting corners
    const corners = [[70, 70], [W - 70, 70], [70, H - 70], [W - 70, H - 70]];
    const crystalColors = [0xff6fa0, 0x6fc9ff, 0x9dff8f, 0xffd166];
    corners.forEach(([px, py], i) => this.drawCrystal(g, px, py, crystalColors[i % 4]));
  }

  drawPillar(g, x, y, w, h) {
    g.fillStyle(0x000000, 0.35);
    g.fillEllipse(x, y + h * 0.42, w * 1.5, w * 0.6);
    g.fillStyle(0x2a2348, 1);
    g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 4);
    g.lineStyle(2, 0x4a3f80, 0.8);
    g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 4);
    g.fillStyle(0x6a5cc2, 0.5);
    g.fillRoundedRect(x - w / 2 - 3, y - h / 2 - 6, w + 6, 8, 3);
  }

  drawRock(g, x, y, r, seed) {
    g.fillStyle(0x000000, 0.3);
    g.fillEllipse(x, y + r * 0.5, r * 1.7, r * 0.6);
    g.fillStyle(0x211c38, 1);
    g.beginPath();
    const pts = 6;
    for (let i = 0; i < pts; i++) {
      const a = (i / pts) * Math.PI * 2;
      const rr = r * (0.75 + ((seed * (i + 1) * 97) % 100) / 400);
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * 0.8;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath();
    g.fillPath();
    g.lineStyle(1, 0x3a3260, 0.8);
    g.strokePath();
  }

  drawCrystal(g, x, y, color) {
    g.fillStyle(color, 0.18);
    g.fillCircle(x, y, 30);
    g.fillStyle(color, 0.9);
    g.fillTriangle(x, y - 16, x + 8, y, x, y + 16);
    g.fillTriangle(x, y - 16, x - 8, y, x, y + 16);
    g.lineStyle(1, 0xffffff, 0.6);
    g.strokeCircle(x, y, 30);
  }

  // ---------------------------------------------------------------- input
  onKey(e, down) {
    const action = CODE_TO_ACTION[e.code];
    if (!action) return;
    if (['up', 'down', 'left', 'right'].includes(action)) {
      this.keys[action] = down;
      return;
    }
    if (action === 'basic') e.preventDefault(); // stop Space from scrolling the page
    if (!down) return; // fire actions only on keydown
    if (action === 'bossNova') { this.castBossNova(); return; }
    if (action === 'basic') { this.castBasic(); return; }
    this.castSlot(Number(action.replace('slot', '')));
  }

  getAimWorld() {
    const pointer = this.aimPointer || this.input.activePointer;
    return this.cameras.main.getWorldPoint(pointer.x, pointer.y);
  }

  castSlot(idx) {
    const me = this.room.state.players.get(this.myId);
    if (!me || !me.alive) return;
    const abilityId = me.abilities[idx];
    if (!abilityId) return;
    const world = this.getAimWorld();
    this.room.send('cast', { abilityId, tx: world.x, ty: world.y });
  }

  castBossNova() {
    const me = this.room.state.players.get(this.myId);
    if (!me || !me.alive || !me.isBoss) return;
    this.room.send('cast', { abilityId: 'boss_nova', tx: me.x, ty: me.y });
  }

  castBasic() {
    const me = this.room.state.players.get(this.myId);
    if (!me || !me.alive) return;
    const world = this.getAimWorld();
    this.room.send('cast', { abilityId: BASIC_ABILITY_ID, tx: world.x, ty: world.y });
  }

  nameOf(id) { const p = this.room.state.players.get(id); return p ? p.name : '???'; }

  // ---------------------------------------------------------------- ability fx
  onCastFx(m) {
    const def = ABILITIES[m.abilityId];
    if (!def) return;
    const now = performance.now();

    // flag the caster's avatar so drawPlayers briefly glows/flashes them mid-cast
    if (m.casterId) {
      const pv = this.pv.get(m.casterId);
      if (pv) { pv.castAt = now; pv.castColor = def.color; }
    }

    if (def.telegraph > 0) {
      this.localEffects.push({ kind: 'telegraph', x: m.tx, y: m.ty, radius: def.radius || 40, color: def.color, start: now, dur: def.telegraph });
      this.burst(m.x, m.y, def.color, { count: 8, life: Math.min(def.telegraph, 700), speedMin: 10, speedMax: 40, scale: 0.5 });
    }

    if (m.abilityId === 'fireball' || m.abilityId === BASIC_ABILITY_ID) {
      const dir = Math.atan2(m.ty - m.y, m.tx - m.x);
      const spd = def.speed || 620;
      this.localEffects.push({ kind: 'projectile', x: m.x, y: m.y, vx: Math.cos(dir) * spd, vy: Math.sin(dir) * spd, color: def.color, start: now, dur: 1200 });
      this.burst(m.x, m.y, def.color, { count: 6, life: 260, speedMin: 20, speedMax: 60, scale: 0.5 });
    } else if (m.abilityId === 'firewave' || m.abilityId === 'tsunami') {
      const dir = Math.atan2(m.ty - m.y, m.tx - m.x);
      this.localEffects.push({ kind: 'wave', ox: m.x, oy: m.y, dx: Math.cos(dir), dy: Math.sin(dir), speed: m.abilityId === 'tsunami' ? 500 : 640, width: m.abilityId === 'tsunami' ? 180 : 90, color: def.color, start: now + def.telegraph, dur: 2600 });
    } else if (m.abilityId === 'dash' || m.abilityId === 'teleport') {
      this.localEffects.push({ kind: 'burst', x: m.x, y: m.y, color: def.color, start: now, dur: 350 });
      this.burst(m.x, m.y, def.color, { count: 16, life: 380, speedMin: 60, speedMax: 200 });
    } else if (m.abilityId === 'shield') {
      this.burst(m.x, m.y, def.color, { count: 10, life: 300, speedMin: 20, speedMax: 60, scale: 0.6 });
    } else if (m.abilityId === 'mine') {
      this.burst(m.x, m.y, def.color, { count: 5, life: 220, speedMin: 10, speedMax: 30, scale: 0.4, blend: 'NORMAL' });
    }
  }

  onImpactFx(m) {
    const now = performance.now();
    const palette = { mine: 0xcfcfcf, meteor: 0xff6a3d, lightning: 0xfff27a, blackhole: 0xb388ff, freeze: 0x8ae8ff };
    const color = palette[m.type] || 0xff5252;
    const radius = m.radius || 40;

    this.localEffects.push({ kind: 'impact', x: m.x, y: m.y, radius, color, start: now, dur: 380 });
    this.burst(m.x, m.y, color, { count: m.type === 'meteor' ? 26 : 16, life: 480, speedMin: 60, speedMax: m.type === 'meteor' ? 320 : 220, scale: 1.1 });

    if (m.type === 'meteor') this.addGroundMark(m.x, m.y, radius * 0.8, 0x552211, 4500);
    else if (m.type === 'blackhole') this.addGroundMark(m.x, m.y, radius * 0.7, 0x2a1444, 3200);
    else if (m.type === 'freeze') this.addGroundMark(m.x, m.y, radius * 0.85, 0x184a55, 3600);
    else if (m.type === 'lightning') this.addGroundMark(m.x, m.y, radius * 0.5, 0x555522, 1600);

    // gentle camera feedback, scaled by proximity to the local player — never jarring
    const me = this.room.state.players.get(this.myId);
    if (me) {
      const d = Math.hypot(me.x - m.x, me.y - m.y);
      const near = clampNum(1 - d / 420, 0, 1);
      if (near > 0) this.cameras.main.shake(160, (m.type === 'meteor' ? 0.01 : 0.006) * near);
    }
  }

  flashDamage() {
    if (!this.hud.dmgFlash) return;
    this.hud.dmgFlash.style.opacity = '0.35';
    clearTimeout(this._dmgFlashTimer);
    this._dmgFlashTimer = setTimeout(() => { this.hud.dmgFlash.style.opacity = '0'; }, 220);
  }

  pushKillfeed(text) {
    const el = document.createElement('div');
    el.className = 'k';
    el.textContent = text;
    this.hud.killfeed.prepend(el);
    while (this.hud.killfeed.children.length > 6) this.hud.killfeed.lastChild.remove();
    setTimeout(() => el.remove(), 6000);
  }

  showBanner(text, ms) {
    this.hud.banner.textContent = text;
    this.hud.banner.classList.add('show');
    clearTimeout(this._bannerTimer);
    this._bannerTimer = setTimeout(() => this.hud.banner.classList.remove('show'), ms);
  }

  startHuntBanner(name) {
    this.huntActive = true;
    this.huntCountdownMs = 20000; // cosmetic countdown only — mirrors the server's hunt duration
    this.hud.huntTargetName.textContent = name;
    this.hud.huntCountdown.textContent = '20';
    this.hud.huntBanner.classList.add('show');
    this.cameras.main.shake(220, 0.008);
    playSfx('boss_warning');
  }
  endHuntBanner() {
    this.huntActive = false;
    this.hud.huntBanner.classList.remove('show');
  }

  showPassiveToast(passiveId) {
    const def = PASSIVES[passiveId];
    if (!def) return;
    this.hud.passiveToastIcon.textContent = def.icon || '✨';
    this.hud.passiveToastName.textContent = def.nameAr;
    this.hud.passiveToastDesc.textContent = def.desc || '';
    this.hud.passiveToast.classList.add('show');
    clearTimeout(this._passiveToastTimer);
    this._passiveToastTimer = setTimeout(() => this.hud.passiveToast.classList.remove('show'), 3200);
  }

  showRoundEnd(m) {
    this.hud.reTitle.textContent = m.winnerName ? `🏆 الفائز: ${m.winnerName}` : 'انتهت الجولة';
    this.hud.reTable.innerHTML = '<tr><th>اللاعب</th><th>الحالة</th><th>القتلات</th><th>النقاط</th></tr>' +
      m.results.map((r) => `<tr><td>${r.name}${r.isBot ? ' 🤖' : ''}</td><td>${statusLabel(r.status)}</td><td>${r.kills}</td><td>${r.pts}</td></tr>`).join('');
    this.hud.roundEnd.classList.add('show');
  }

  showUpgradeOffer(options) {
    this.upgradeShown = true;
    this.hud.upgradeOpts.innerHTML = '';
    options.forEach((id) => {
      const def = ABILITIES[id];
      const card = document.createElement('div');
      card.className = 'opt';
      card.style.setProperty('--rc', def ? RARITY_COLOR[def.rarity] : '#c9d6ff');
      card.innerHTML = `
        <div class="opt-icon">${def ? (TYPE_ICON[def.type] || '✨') : '✨'}</div>
        <div class="opt-name">${def ? def.nameAr : id}</div>
        <div class="opt-rarity">${def ? def.rarity : ''}</div>
        <div class="opt-desc">${def ? def.desc : ''}</div>
        <div class="opt-meta">${def && def.damage ? `⚔ ${def.damage}` : ''} ${def && def.cooldown ? ` · ⏱ ${(def.cooldown / 1000).toFixed(1)}s` : ''}</div>
      `;
      card.onclick = () => {
        card.classList.add('picked');
        this.room.send('upgradeChoice', { id });
        setTimeout(() => { this.hud.upgradeModal.classList.remove('show'); this.upgradeShown = false; }, 180);
      };
      this.hud.upgradeOpts.appendChild(card);
    });
    this.hud.upgradeModal.classList.add('show');
    clearTimeout(this._upgradeTimer);
    this._upgradeTimer = setTimeout(() => { this.hud.upgradeModal.classList.remove('show'); this.upgradeShown = false; }, 9000);
  }

  // ---------------------------------------------------------------- main loop
  update(time, delta) {
    const state = this.room.state;
    const me = state.players.get(this.myId);

    if (this.huntActive) {
      this.huntCountdownMs = Math.max(0, this.huntCountdownMs - delta);
      this.hud.huntCountdown.textContent = String(Math.ceil(this.huntCountdownMs / 1000));
    }

    // ---- phase transitions ----
    if (state.phase !== this.lastPhase) {
      if (state.phase === 'playing') { this.hud.waiting.classList.remove('show'); this.hud.roundEnd.classList.remove('show'); }
      if (state.phase === 'waiting') this.hud.roundEnd.classList.remove('show');
      this.lastPhase = state.phase;
    }
    if (state.phase === 'waiting') {
      if (state.countdown !== this.lastSeenCountdown) { this.lastSeenCountdown = state.countdown; this.localCountdownMs = state.countdown * 1000; }
      this.localCountdownMs = Math.max(0, this.localCountdownMs - delta);
      this.hud.waiting.classList.add('show');
      this.hud.waitingCountdown.textContent = Math.ceil(this.localCountdownMs / 1000) + 's';
    }

    // ---- input ----
    if (me && me.alive && state.phase === 'playing' && time - this.lastInputSentAt > 60) {
      this.lastInputSentAt = time;
      let mx = 0, my = 0;
      if (this.moveTouch) {
        const dx = this.moveTouch.curX - this.moveTouch.baseX, dy = this.moveTouch.curY - this.moveTouch.baseY;
        const maxR = 50, len = Math.hypot(dx, dy);
        if (len > 4) { const k = Math.min(len, maxR) / len; mx = dx * k / maxR; my = dy * k / maxR; }
      } else {
        if (this.keys.up) my -= 1;
        if (this.keys.down) my += 1;
        if (this.keys.left) mx -= 1;
        if (this.keys.right) mx += 1;
      }
      const world = this.getAimWorld();
      this.room.send('input', { mx, my, aimX: world.x, aimY: world.y });
    }

    this.drawJoystick();

    // ---- camera follow ----
    if (me) {
      const cx = this.cameras.main.scrollX + this.cameras.main.width / 2;
      const cy = this.cameras.main.scrollY + this.cameras.main.height / 2;
      this.cameras.main.scrollX += (me.x - cx) * Math.min(1, delta / 180);
      this.cameras.main.scrollY += (me.y - cy) * Math.min(1, delta / 180);
    }

    this.drawGroundMarks();
    this.drawOrb(state, time);
    this.drawZone(state, time);
    this.drawEffects(time);
    this.drawPlayers(state, time);
    this.updateHud(state, me);
  }

  drawJoystick() {
    const g = this.joyGfx;
    g.clear();
    if (!this.moveTouch) return;
    const { baseX, baseY, curX, curY } = this.moveTouch;
    const dx = curX - baseX, dy = curY - baseY;
    const maxR = 50, len = Math.hypot(dx, dy);
    const k = len > 0 ? Math.min(len, maxR) / len : 0;
    g.fillStyle(0xffffff, 0.08);
    g.fillCircle(baseX, baseY, maxR);
    g.lineStyle(2, 0xffe27a, 0.5);
    g.strokeCircle(baseX, baseY, maxR);
    g.fillStyle(0xffe27a, 0.55);
    g.fillCircle(baseX + dx * k, baseY + dy * k, 20);
  }

  drawGroundMarks() {
    const g = this.gfxGround;
    g.clear();
    const now = performance.now();
    this.groundMarks = this.groundMarks.filter((m) => now - m.start < m.dur);
    for (const m of this.groundMarks) {
      const t = (now - m.start) / m.dur;
      g.fillStyle(m.color, (1 - t) * 0.35);
      g.fillCircle(m.x, m.y, m.radius * (0.9 + t * 0.15));
    }
  }

  drawOrb(state, timeMs) {
    const g = this.gfxOrb;
    g.clear();
    if (!state.orbActive) return;
    const pulse = 0.5 + 0.5 * Math.sin(timeMs / 220);
    g.fillStyle(0xffe27a, 0.18 + pulse * 0.08);
    g.fillCircle(state.orbX, state.orbY, 26 + pulse * 6);
    g.fillStyle(0xffe27a, 0.9);
    g.fillCircle(state.orbX, state.orbY, 11);
    g.lineStyle(2, 0xffffff, 0.7);
    g.strokeCircle(state.orbX, state.orbY, 11);
    g.lineStyle(1.5, 0xffe27a, 0.5 + pulse * 0.3);
    g.strokeCircle(state.orbX, state.orbY, 22 + pulse * 5);
  }

  drawZone(state, timeMs) {
    const g = this.gfxZone;
    g.clear();
    const cx = state.arenaW / 2, cy = state.arenaH / 2, r = state.safeRadius;

    g.fillStyle(0x000000, 0.45);
    g.fillRect(0, 0, state.arenaW, state.arenaH);

    const pulse = 0.5 + 0.5 * Math.sin(timeMs / 260);
    for (let i = 3; i >= 1; i--) {
      g.lineStyle(2 + i * 4, 0xff4d4d, 0.05 + 0.05 * i * pulse);
      g.strokeCircle(cx, cy, r + i * 3);
    }
    g.lineStyle(3, 0xff5e5e, 0.9);
    g.strokeCircle(cx, cy, r);

    // rotating dashed "energy wall" pattern
    const segs = 40;
    const rot = (timeMs / 4000) % (Math.PI * 2);
    g.lineStyle(4, 0xffb199, 0.55 + 0.25 * pulse);
    for (let i = 0; i < segs; i++) {
      if (i % 2 === 0) continue;
      const a0 = rot + (i / segs) * Math.PI * 2;
      const a1 = rot + ((i + 0.6) / segs) * Math.PI * 2;
      g.beginPath();
      g.arc(cx, cy, r, a0, a1, false);
      g.strokePath();
    }

    if (!this._nextZoneEmberAt || timeMs > this._nextZoneEmberAt) {
      this._nextZoneEmberAt = timeMs + 90;
      const a = Math.random() * Math.PI * 2;
      this.burst(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0xff6a4d, { count: 2, life: 700, speedMin: 4, speedMax: 24, scale: 0.5 });
    }
  }

  drawEffects(nowMs) {
    const g = this.gfxFx;
    g.clear();
    const now = performance.now();
    this.localEffects = this.localEffects.filter((fx) => now - fx.start < fx.dur + 50);
    for (const fx of this.localEffects) {
      const t = (now - fx.start) / fx.dur;
      if (fx.kind === 'telegraph') {
        if (t < 0 || t > 1) continue;
        const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 6);
        g.fillStyle(fx.color, 0.08 + pulse * 0.05);
        g.fillCircle(fx.x, fx.y, fx.radius * (0.7 + 0.3 * t));
        g.lineStyle(2 + pulse * 2, fx.color, 0.5 + pulse * 0.4);
        g.strokeCircle(fx.x, fx.y, fx.radius * (0.7 + 0.3 * t));
        const ticks = 10;
        for (let i = 0; i < ticks; i++) {
          const a = (i / ticks) * Math.PI * 2 + t * 3;
          const rr = fx.radius * (0.7 + 0.3 * t);
          g.lineStyle(2, fx.color, 0.6);
          g.lineBetween(fx.x + Math.cos(a) * (rr - 6), fx.y + Math.sin(a) * (rr - 6), fx.x + Math.cos(a) * (rr + 6), fx.y + Math.sin(a) * (rr + 6));
        }
      } else if (fx.kind === 'impact') {
        if (t < 0 || t > 1) continue;
        g.fillStyle(fx.color, (1 - t) * 0.5);
        g.fillCircle(fx.x, fx.y, fx.radius * (0.4 + t * 0.8));
        g.lineStyle(2, fx.color, 1 - t);
        g.strokeCircle(fx.x, fx.y, fx.radius * (0.4 + t * 0.8));
        g.lineStyle(1, 0xffffff, (1 - t) * 0.6);
        g.strokeCircle(fx.x, fx.y, fx.radius * (0.2 + t * 0.5));
      } else if (fx.kind === 'projectile') {
        if (t < 0 || t > 1) continue;
        const elapsedSec = (now - fx.start) / 1000;
        const px = fx.x + fx.vx * elapsedSec, py = fx.y + fx.vy * elapsedSec;
        g.fillStyle(fx.color, 0.25);
        g.fillCircle(px, py, 16);
        g.fillStyle(fx.color, 0.55);
        g.fillCircle(px, py, 11);
        g.fillStyle(0xffffff, 0.9);
        g.fillCircle(px, py, 5);
        if (Math.random() < 0.5) this.burst(px, py, fx.color, { count: 1, life: 220, speedMin: 4, speedMax: 16, scale: 0.4 });
      } else if (fx.kind === 'burst') {
        if (t < 0 || t > 1) continue;
        g.lineStyle(3, fx.color, 1 - t);
        g.strokeCircle(fx.x, fx.y, 10 + t * 34);
        g.lineStyle(1.5, 0xffffff, (1 - t) * 0.7);
        g.strokeCircle(fx.x, fx.y, 6 + t * 20);
      } else if (fx.kind === 'wave') {
        if (now < fx.start) continue;
        const elapsedSec = (now - fx.start) / 1000;
        const front = fx.speed * elapsedSec;
        if (elapsedSec * 1000 > fx.dur) continue;
        const nx = -fx.dy, ny = fx.dx;
        const cxp = fx.ox + fx.dx * front, cyp = fx.oy + fx.dy * front;
        const len = 2000;
        g.lineStyle(fx.width, fx.color, 0.3);
        g.lineBetween(cxp - nx * len, cyp - ny * len, cxp + nx * len, cyp + ny * len);
        g.lineStyle(3, 0xffffff, 0.5);
        g.lineBetween(cxp - nx * len, cyp - ny * len, cxp + nx * len, cyp + ny * len);
        if (!fx._lastSparkAt || now - fx._lastSparkAt > 60) {
          fx._lastSparkAt = now;
          const spread = (Math.random() - 0.5) * len * 0.6;
          this.burst(cxp + nx * spread, cyp + ny * spread, fx.color, { count: 3, life: 260, speedMin: 10, speedMax: 40, scale: 0.5 });
        }
      }
    }
  }

  drawPlayers(state, timeMs) {
    const g = this.gfxPlayers;
    g.clear();
    const now = performance.now();

    state.players.forEach((p, key) => {
      const text = this.nameTexts.get(key);
      let pv = this.pv.get(key);
      if (!pv) {
        pv = { phase: hashPhase(key), prevHp: p.hp, prevShield: p.shield, hitAt: -9999, castAt: -9999, castColor: 0xffffff, deathAt: -9999, wasAlive: p.alive, facing: 0 };
        this.pv.set(key, pv);
      }

      // hp/shield drop detected purely from state deltas -> hit flash + light shake
      if (p.hp < pv.prevHp || p.shield < pv.prevShield) {
        pv.hitAt = now;
        if (key === this.myId) { this.flashDamage(); this.cameras.main.shake(120, 0.006); }
      }
      pv.prevHp = p.hp; pv.prevShield = p.shield;

      // alive -> dead transition -> explosion + brief fade/expand instead of an instant pop
      if (pv.wasAlive && !p.alive) {
        pv.deathAt = now;
        this.burst(p.x, p.y, RING_HEX(p.ring || '#ffe27a'), { count: 28, life: 650, speedMin: 40, speedMax: 260, scale: 1.2 });
      }
      pv.wasAlive = p.alive;

      const deathAge = now - pv.deathAt;
      if (!p.alive && deathAge > 500) { if (text) text.setVisible(false); return; }
      if (text) text.setVisible(true);

      const ring = RING_HEX(p.ring || '#ffe27a');
      const bodyRing = BODY_PALETTE[p.ring] || ring;
      const baseRadius = p.isBoss ? 26 : 16;
      const invuln = p.invulnUntil > now;

      if (key === this.myId) {
        const world = this.getAimWorld();
        pv.facing = Math.atan2(world.y - p.y, world.x - p.x);
      } else if (Math.abs(p.vx) + Math.abs(p.vy) > 4) {
        pv.facing = Math.atan2(p.vy, p.vx);
      }

      const speed = Math.hypot(p.vx || 0, p.vy || 0);
      const moving = speed > 4;
      const bob = moving ? Math.sin(timeMs / 90 + pv.phase) * 1.5 : Math.sin(timeMs / 420 + pv.phase) * 2.2;
      const stretch = moving ? Math.min(0.35, speed / 700) : 0;

      const deathT = !p.alive ? clampNum(deathAge / 500, 0, 1) : 0;
      const alpha = p.alive ? 1 : (1 - deathT);
      const deathScale = p.alive ? 1 : (1 + deathT * 0.6);

      const castT = clampNum((now - pv.castAt) / 260, 0, 1);
      const casting = castT < 1;
      const hitT = clampNum((now - pv.hitAt) / 220, 0, 1);
      const hit = hitT < 1;

      const drawX = p.x, drawY = p.y + bob - deathT * 14;

      // ground shadow
      g.fillStyle(0x000000, 0.35 * alpha);
      g.fillEllipse(drawX, p.y + baseRadius * 0.85, baseRadius * 1.7, baseRadius * 0.55);

      // boss aura
      if (p.isBoss) {
        const pulse = 0.5 + 0.5 * Math.sin(timeMs / 200);
        g.lineStyle(3, 0xff3d81, 0.35 + pulse * 0.25);
        g.strokeCircle(drawX, drawY, baseRadius + 16 + pulse * 4);
        g.lineStyle(1.5, 0xffd166, 0.5);
        g.strokeCircle(drawX, drawY, baseRadius + 24);
        if (Math.random() < 0.06) this.burst(drawX + (Math.random() - 0.5) * 40, drawY + (Math.random() - 0.5) * 40, 0xff3d81, { count: 2, life: 500, speedMin: 4, speedMax: 20, scale: 0.5 });
      }

      // body — rotated to face movement/aim, squashed & stretched with speed
      g.save();
      g.translateCanvas(drawX, drawY);
      g.rotateCanvas(pv.facing);
      const bw = baseRadius * 1.5 * (1 + stretch) * deathScale;
      const bh = baseRadius * 1.9 * (1 - stretch * 0.5) * deathScale;
      const bodyColor = hit ? 0xffffff : bodyRing;
      // dark silhouette base first so overlapping players never blend into a white blob
      g.fillStyle(0x14102a, 0.9 * alpha);
      g.fillEllipse(0, 0, bw * 1.08, bh * 1.08);
      g.fillStyle(bodyColor, (key === this.myId ? 1 : 0.92) * alpha);
      g.fillEllipse(0, 0, bw, bh);
      g.lineStyle(p.isBoss ? 3 : 2, hit ? 0xffffff : (p.isBoss ? 0xff3d81 : bodyRing), alpha);
      g.strokeEllipse(0, 0, bw, bh);
      g.fillStyle(0xffffff, 0.85 * alpha);
      g.fillTriangle(bw * 0.34, -4, bw * 0.34, 4, bw * 0.5, 0);
      g.restore();

      // head
      g.fillStyle(0x14102a, 0.9 * alpha);
      g.fillCircle(drawX, drawY - baseRadius * 0.95 * deathScale, baseRadius * 0.6 * deathScale);
      g.fillStyle(hit ? 0xffffff : bodyRing, alpha);
      g.fillCircle(drawX, drawY - baseRadius * 0.95 * deathScale, baseRadius * 0.52 * deathScale);
      g.lineStyle(1.5, 0x0e0a1e, 0.85 * alpha);
      g.strokeCircle(drawX, drawY - baseRadius * 0.95 * deathScale, baseRadius * 0.52 * deathScale);

      // cast glow — hands channeling energy in the facing direction
      if (casting) {
        const cg = 1 - castT;
        const handX = drawX + Math.cos(pv.facing) * baseRadius * 1.3;
        const handY = drawY + Math.sin(pv.facing) * baseRadius * 1.3;
        g.fillStyle(pv.castColor, 0.5 * cg);
        g.fillCircle(handX, handY, 10 + (1 - cg) * 6);
        g.fillStyle(0xffffff, 0.8 * cg);
        g.fillCircle(handX, handY, 4);
      }

      // invulnerability / shield ring (dash/teleport i-frames and the shield ability alike)
      if (invuln) {
        const pulse = 0.5 + 0.5 * Math.sin(timeMs / 130);
        g.lineStyle(2, 0x8affc9, 0.5 + pulse * 0.4);
        g.strokeCircle(drawX, drawY, baseRadius + 8 + pulse * 2);
        g.lineStyle(1, 0xffffff, 0.4);
        g.strokeCircle(drawX, drawY, baseRadius + 12);
      }

      // hp/shield bar over the head
      if (p.alive) {
        const maxHp = p.maxHp || 100;
        const hpFrac = clampNum(p.hp / maxHp, 0, 1);
        const bw2 = 34, by = drawY - baseRadius - 20;
        g.fillStyle(0x000000, 0.55);
        g.fillRoundedRect(drawX - bw2 / 2, by, bw2, 5, 2);
        g.fillStyle(hpFrac > 0.3 ? 0x7dffb0 : 0xff6b6b, 1);
        g.fillRoundedRect(drawX - bw2 / 2, by, bw2 * hpFrac, 5, 2);
        if (p.maxShield) {
          const sf = clampNum(p.shield / p.maxShield, 0, 1);
          g.fillStyle(0x000000, 0.4);
          g.fillRoundedRect(drawX - bw2 / 2, by - 4, bw2, 3, 1.5);
          g.fillStyle(0x7dd8ff, 0.9);
          g.fillRoundedRect(drawX - bw2 / 2, by - 4, bw2 * sf, 3, 1.5);
        }
      }

      if (text) {
        text.setPosition(drawX, drawY - baseRadius - 26);
        text.setAlpha(alpha);
        text.setText((p.isBoss ? '👑 ' : '') + p.name);
      }
    });
  }

  updateHud(state, me) {
    const h = this.hud;
    if (me) {
      h.hpFill.style.width = `${Math.max(0, (me.hp / (me.maxHp || 100)) * 100)}%`;
      h.shieldFill.style.width = `${Math.max(0, (me.shield / (me.maxShield || 45)) * 100)}%`;
      h.statsLine.textContent = `القتلات: ${me.kills} | النقاط: ${me.score}`;
      h.bossPrompt.classList.toggle('show', !!me.isBoss);
      this.renderHotbar(me);
      const passivesHtml = me.passives.map((id) => `<div class="p">${PASSIVES[id]?.icon || ''} ${PASSIVES[id]?.nameAr || id}</div>`).join('');
      if (passivesHtml !== this._lastPassivesHtml) { h.passives.innerHTML = passivesHtml; this._lastPassivesHtml = passivesHtml; }
    }
    const alive = [...state.players.values()].filter((p) => p.alive).length;
    h.playersLeft.textContent = `اللاعبون المتبقون: ${alive}`;

    if (state.phase === 'playing') {
      const total = Math.max(1, Math.ceil(state.remaining));
      const mm = Math.floor(total / 60), ss = total % 60;
      h.timer.textContent = `${mm}:${String(ss).padStart(2, '0')}`;
      h.remaining.textContent = state.eventId ? eventLabel(state.eventId) : '';
    } else {
      h.timer.textContent = '--:--';
    }

    if (state.bossId) {
      const boss = state.players.get(state.bossId);
      h.bossBar.classList.add('show');
      if (boss) {
        h.bossLbl.textContent = `الوحش: ${boss.name}`;
        h.bossFill.style.width = `${Math.max(0, (boss.hp / (boss.maxHp || 190)) * 100)}%`;
      }
    } else {
      h.bossBar.classList.remove('show');
    }
  }

  renderHotbar(me) {
    const h = this.hud;
    const now = Date.now();
    const slots = [];
    {
      const bcd = (me.cooldowns.get ? me.cooldowns.get(BASIC_ABILITY_ID) : me.cooldowns[BASIC_ABILITY_ID]) || 0;
      const bLeft = Math.max(0, Math.ceil((bcd - now) / 1000));
      slots.push(`<div class="slot basic" data-idx="basic">
        <div class="key">Space</div>
        <div class="nm">${ABILITIES[BASIC_ABILITY_ID].nameAr}</div>
        ${bLeft > 0 ? `<div class="cd">${bLeft}</div>` : ''}
      </div>`);
    }
    for (let i = 0; i < 4; i++) {
      const id = me.abilities[i];
      const def = id ? ABILITIES[id] : null;
      const cdUntil = id ? (me.cooldowns.get ? me.cooldowns.get(id) : me.cooldowns[id]) || 0 : 0;
      const cdLeft = Math.max(0, Math.ceil((cdUntil - now) / 1000));
      slots.push(`<div class="slot" data-idx="${i}" style="border-color:${def ? RARITY_COLOR[def.rarity] : '#333'}">
        <div class="key">${i + 1}</div>
        ${id ? `<div class="nm">${TYPE_ICON[def.type] || ''} ${def.nameAr}</div>` : ''}
        ${cdLeft > 0 ? `<div class="cd">${cdLeft}</div>` : ''}
      </div>`);
    }
    // only touch the DOM when the rendered markup actually changed — rebuilding
    // innerHTML every frame at 60fps is wasteful and detaches any element a click
    // handler or test just grabbed a reference to.
    const html = slots.join('');
    if (html !== this._lastHotbarHtml) { h.hotbar.innerHTML = html; this._lastHotbarHtml = html; }
  }
}

function statusLabel(s) { return s === 'winner' ? '🏆 فائز' : s === 'survivor' ? 'نجا' : 'خرج'; }
function eventLabel(id) {
  return { double_damage: '⚡ ضعف الضرر!', chaos: '🌀 فوضى — كولداون أسرع!', no_abilities: '🚫 القدرات معطلة!', meteor_shower: '☄️ وابل نيازك!' }[id] || id;
}

function getHudRefs() {
  const byId = (id) => document.getElementById(id);
  return {
    root: byId('hud'),
    hpFill: byId('hpFill'), shieldFill: byId('shieldFill'), statsLine: byId('statsLine'),
    timer: byId('timer'), remaining: byId('remaining'),
    hotbar: byId('hotbar'), passives: byId('passives'), killfeed: byId('killfeed'),
    playersLeft: byId('playersLeft'),
    bossBar: byId('bossBar'), bossLbl: byId('bossLbl'), bossFill: byId('bossFill'),
    banner: byId('banner'), bossPrompt: byId('bossPrompt'),
    waiting: byId('waiting'), waitingCountdown: byId('waitingCountdown'),
    roundEnd: byId('roundEnd'), reTitle: byId('reTitle'), reTable: byId('reTable'),
    upgradeModal: byId('upgradeModal'), upgradeOpts: byId('upgradeOpts'),
    dmgFlash: byId('dmgFlash'),
    huntBanner: byId('huntBanner'), huntTargetName: byId('huntTargetName'), huntCountdown: byId('huntCountdown'),
    passiveToast: byId('passiveToast'), passiveToastIcon: byId('passiveToastIcon'),
    passiveToastName: byId('passiveToastName'), passiveToastDesc: byId('passiveToastDesc'),
  };
}
