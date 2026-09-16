import Phaser from 'phaser';
import { ABILITIES, RARITY_COLOR, PASSIVES, BASIC_ABILITY_ID } from './abilityData.js';
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

export default class ArenaScene extends Phaser.Scene {
  constructor() { super('arena'); }

  init(data) {
    this.room = data.room;
    this.myId = this.room.sessionId;
  }

  create() {
    this.cameras.main.setBackgroundColor('#07060d');
    this.gfxBg = this.add.graphics();
    this.gfxZone = this.add.graphics();
    this.gfxFx = this.add.graphics();
    this.gfxPlayers = this.add.graphics();
    this.nameTexts = new Map(); // sessionId -> Phaser.Text

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

    this.hud = getHudRefs();
    this.hud.root.classList.add('active');

    this.room.state.players.onAdd((p, key) => {
      const t = this.add.text(0, 0, '', { fontFamily: 'Segoe UI, Tahoma, sans-serif', fontSize: '12px', color: '#f0ecff' })
        .setOrigin(0.5, 1).setDepth(10);
      this.nameTexts.set(key, t);
    });
    this.room.state.players.onRemove((p, key) => {
      const t = this.nameTexts.get(key);
      if (t) t.destroy();
      this.nameTexts.delete(key);
    });

    this.room.onMessage('cast', (m) => { this.onCastFx(m); const def = ABILITIES[m.abilityId]; if (def) castSfxFor(def.type); });
    this.room.onMessage('impact', (m) => { this.onImpactFx(m); playSfx('impact'); });
    this.room.onMessage('killfeed', (m) => { this.pushKillfeed(`${m.killer} ⚔ ${m.victim}`); playSfx('killfeed'); });
    this.room.onMessage('death', (m) => {
      if (!m.killerName) this.pushKillfeed(`${this.nameOf(m.victimId)} خرج من الحدود الآمنة`);
      if (m.victimId === this.myId) playSfx('death');
    });
    this.room.onMessage('bossHunt', (m) => { this.showBanner(`🔥 مطاردة الوحش: ${m.name}!`, 3000); playSfx('boss_warning'); });
    this.room.onMessage('bossResolved', (m) => this.showBanner(m.survived ? `الوحش ${m.name} نجا!` : `تم إسقاط الوحش!`, 2500));
    this.room.onMessage('worldEvent', () => playSfx('world_event'));
    this.room.onMessage('finalDuel', (m) => this.showBanner(`🗡 المبارزة الأخيرة: ${m.a} ضد ${m.b}`, 3000));
    this.room.onMessage('toast', () => {});
    this.room.onMessage('matchStart', () => {});
    this.room.onMessage('roundEnd', (m) => { this.showRoundEnd(m); playSfx(m.winnerName && this.nameOf(this.myId) === m.winnerName ? 'victory' : 'defeat'); });
    this.room.onMessage('upgradeOffer', (m) => { this.showUpgradeOffer(m.options); playSfx('upgrade'); });
    this.room.onMessage('passiveAcquired', (m) => { if (m.playerId === this.myId) this.pushKillfeed(`قدرة جانبية جديدة: ${PASSIVES[m.passiveId]?.nameAr || m.passiveId}`); });

    this.cameras.main.setBounds(0, 0, this.room.state.arenaW, this.room.state.arenaH);
  }

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

  onCastFx(m) {
    const def = ABILITIES[m.abilityId];
    if (!def) return;
    const now = performance.now();
    if (def.telegraph > 0) {
      this.localEffects.push({ kind: 'telegraph', x: m.tx, y: m.ty, radius: def.radius || 40, color: def.color, start: now, dur: def.telegraph });
    }
    if (m.abilityId === 'fireball' || m.abilityId === BASIC_ABILITY_ID) {
      const dir = Math.atan2(m.ty - m.y, m.tx - m.x);
      const spd = def.speed || 620;
      this.localEffects.push({ kind: 'projectile', x: m.x, y: m.y, vx: Math.cos(dir) * spd, vy: Math.sin(dir) * spd, color: def.color, start: now, dur: 1200 });
    } else if (m.abilityId === 'firewave' || m.abilityId === 'tsunami') {
      const dir = Math.atan2(m.ty - m.y, m.tx - m.x);
      this.localEffects.push({ kind: 'wave', ox: m.x, oy: m.y, dx: Math.cos(dir), dy: Math.sin(dir), speed: m.abilityId === 'tsunami' ? 500 : 640, width: m.abilityId === 'tsunami' ? 180 : 90, color: def.color, start: now + def.telegraph, dur: 2600 });
    } else if (m.abilityId === 'dash' || m.abilityId === 'teleport') {
      this.localEffects.push({ kind: 'burst', x: m.x, y: m.y, color: def.color, start: now, dur: 350 });
    }
  }

  onImpactFx(m) {
    this.localEffects.push({ kind: 'impact', x: m.x, y: m.y, radius: m.radius || 40, color: m.type === 'mine' ? 0xcccccc : 0xff5252, start: performance.now(), dur: 380 });
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
      const btn = document.createElement('div');
      btn.className = 'opt';
      btn.innerHTML = `<div>${def ? def.nameAr : id}</div><div class="rn" style="color:${def ? RARITY_COLOR[def.rarity] : '#fff'}">${def ? def.rarity : ''}</div>`;
      btn.onclick = () => {
        this.room.send('upgradeChoice', { id });
        this.hud.upgradeModal.classList.remove('show');
        this.upgradeShown = false;
      };
      this.hud.upgradeOpts.appendChild(btn);
    });
    this.hud.upgradeModal.classList.add('show');
    clearTimeout(this._upgradeTimer);
    this._upgradeTimer = setTimeout(() => { this.hud.upgradeModal.classList.remove('show'); this.upgradeShown = false; }, 9000);
  }

  update(time, delta) {
    const state = this.room.state;
    const me = state.players.get(this.myId);

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

    this.drawBackground(state);
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

  drawBackground(state) {
    const g = this.gfxBg;
    g.clear();
    g.fillStyle(0x0b0918, 1);
    g.fillRect(0, 0, state.arenaW, state.arenaH);
    g.lineStyle(1, 0x1c1730, 1);
    const step = 80;
    for (let x = 0; x <= state.arenaW; x += step) g.lineBetween(x, 0, x, state.arenaH);
    for (let y = 0; y <= state.arenaH; y += step) g.lineBetween(0, y, state.arenaW, y);
    g.lineStyle(3, 0x3a3260, 1);
    g.strokeRect(0, 0, state.arenaW, state.arenaH);

    if (state.orbActive) {
      g.fillStyle(0xffe27a, 0.85);
      g.fillCircle(state.orbX, state.orbY, 12);
      g.lineStyle(2, 0xffe27a, 0.4);
      g.strokeCircle(state.orbX, state.orbY, 20);
    }
  }

  drawZone(state, time) {
    const g = this.gfxZone;
    g.clear();
    const cx = state.arenaW / 2, cy = state.arenaH / 2;
    // darken everything outside the safe radius
    g.fillStyle(0x000000, 0.55);
    g.fillRect(0, 0, state.arenaW, state.arenaH);
    g.beginPath();
    g.arc(cx, cy, state.safeRadius, 0, Math.PI * 2);
    g.closePath();
    g.fillStyle(0x000000, 1);
    // use blend trick: draw a hole by drawing the safe area with destination-out isn't
    // available on Graphics directly, so instead just outline the boundary clearly.
    g.lineStyle(3, 0xff5e5e, 0.8);
    g.strokeCircle(cx, cy, state.safeRadius);
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
        g.lineStyle(2 + pulse * 2, fx.color, 0.5 + pulse * 0.4);
        g.strokeCircle(fx.x, fx.y, fx.radius * (0.7 + 0.3 * t));
      } else if (fx.kind === 'impact') {
        if (t < 0 || t > 1) continue;
        g.fillStyle(fx.color, (1 - t) * 0.5);
        g.fillCircle(fx.x, fx.y, fx.radius * (0.4 + t * 0.8));
        g.lineStyle(2, fx.color, 1 - t);
        g.strokeCircle(fx.x, fx.y, fx.radius * (0.4 + t * 0.8));
      } else if (fx.kind === 'projectile') {
        if (t < 0 || t > 1) continue;
        const elapsedSec = (now - fx.start) / 1000;
        const px = fx.x + fx.vx * elapsedSec, py = fx.y + fx.vy * elapsedSec;
        g.fillStyle(fx.color, 1);
        g.fillCircle(px, py, 8);
      } else if (fx.kind === 'burst') {
        if (t < 0 || t > 1) continue;
        g.lineStyle(3, fx.color, 1 - t);
        g.strokeCircle(fx.x, fx.y, 10 + t * 30);
      } else if (fx.kind === 'wave') {
        if (now < fx.start) continue;
        const elapsedSec = (now - fx.start) / 1000;
        const front = fx.speed * elapsedSec;
        if (elapsedSec * 1000 > fx.dur) continue;
        const nx = -fx.dy, ny = fx.dx;
        const cxp = fx.ox + fx.dx * front, cyp = fx.oy + fx.dy * front;
        const len = 2000;
        g.lineStyle(fx.width, fx.color, 0.35);
        g.lineBetween(cxp - nx * len, cyp - ny * len, cxp + nx * len, cyp + ny * len);
      }
    }
  }

  drawPlayers(state, timeMs) {
    const g = this.gfxPlayers;
    g.clear();
    state.players.forEach((p, key) => {
      const text = this.nameTexts.get(key);
      if (!p.alive) { if (text) text.setVisible(false); return; }
      if (text) text.setVisible(true);

      const ring = RING_HEX(p.ring || '#ffe27a');
      const radius = p.isBoss ? 30 : 18;
      const now = Date.now();
      const invuln = p.invulnUntil > now;

      g.fillStyle(ring, key === this.myId ? 0.9 : 0.55);
      g.fillCircle(p.x, p.y, radius);
      g.lineStyle(p.isBoss ? 4 : 2, p.isBoss ? 0xff3d81 : ring, 1);
      g.strokeCircle(p.x, p.y, radius);
      if (invuln) { g.lineStyle(2, 0x8affc9, 0.8); g.strokeCircle(p.x, p.y, radius + 6); }

      // mini hp bar over head
      const maxHp = p.maxHp || 100;
      const hpFrac = Math.max(0, p.hp / maxHp);
      const bw = 34;
      g.fillStyle(0x000000, 0.5);
      g.fillRect(p.x - bw / 2, p.y - radius - 16, bw, 5);
      g.fillStyle(hpFrac > 0.3 ? 0x7dffb0 : 0xff6b6b, 1);
      g.fillRect(p.x - bw / 2, p.y - radius - 16, bw * hpFrac, 5);

      if (text) {
        text.setPosition(p.x, p.y - radius - 20);
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
      const passivesHtml = me.passives.map((id) => `<div class="p">${PASSIVES[id]?.nameAr || id}</div>`).join('');
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
        ${id ? `<div class="nm">${def.nameAr}</div>` : ''}
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
  };
}
