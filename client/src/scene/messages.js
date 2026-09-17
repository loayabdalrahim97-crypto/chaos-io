// Server message handlers: casts, impacts, zones, summons, drops, boss, streaks, ghosts...
import Phaser from 'phaser';
import {
  defOf, ABILITIES, LEGENDS, MYTHICS, FUSIONS, PASSIVES, COMBOS, WORLD_EVENTS, UPGRADES, iconStyle, FAMILIES,
} from '../gameData.js';
import { playSfx } from '../audio.js';

const IMPACT_ALIAS = {
  water_splash: 'splash', ground_slam: 'slam', boss_slam: 'slam', earthquake: 'slam', frost_nova: 'ice', ice_age: 'ice', glacier_tomb: 'ice',
  frost_trap: 'ice', earth_prison: 'earth', fire_ring: 'firering', lava_mine: 'firering', phoenix_heal: 'firering', sun_flare: 'sunflare',
  magma_bolt: 'meteor', storm_caller: 'lightning', magnet_pull: 'magnet', earth_spikes: 'spike', steam_explosion: 'steam',
};

export const messagesMixin = {
  setupMessages() {
    const r = this.room;
    r.onMessage('cast', (m) => this.onCast(m));
    r.onMessage('impact', (m) => this.onImpact(m));
    r.onMessage('strikes', (m) => {
      const def = defOf(m.id) || {};
      const color = this.familyColor(def) || 0xff5a1f;
      const now = performance.now();
      m.points.forEach((p) => { if (p.delay > 80) this.telegraphs.push({ x: p.x, y: p.y, r: p.r, inner: p.inner, color, start: now, dur: p.delay }); });
      if (m.id === 'meteor_storm' || m.id === 'arrow_rain' || m.id === 'storm_caller') this.telegraphs.push({ x: m.points[0].x, y: m.points[0].y, r: 200, color, start: now, dur: 900 });
      if (m.id === 'ground_slam' || m.id === 'glacier_tomb' || m.id === 'sun_flare') { const v = this.views.get(m.casterId); if (v) { v.jump = 0; this.tweens.add({ targets: v, jump: 1, duration: m.points[0].delay || 300 }); } }
    });
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
      const def = defOf(m.id) || {};
      const col = m.id === 'frozen_thunder' ? 0xbfe8ff : 0x9fd8ff;
      const pts = m.points || [];
      for (let i = 1; i < pts.length; i++) {
        this.time.delayedCall((i - 1) * 60, () => {
          this.drawBolt(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y, col, true);
          this.playFx(def.applies === 'chill' ? 14 : 19, pts[i].x, pts[i].y, 3.6, col);
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
      if (m.victimId === this.myId) {
        playSfx('death');
        this.toast(m.ghost ? `👻 صرت شبح! تحرك وقرّب من ${m.killerName || 'عدو'} واضغط ${this.touch ? 'زر اللعنة' : 'C'} عشان تلعنه` : '💀 تم إقصاؤك — شاهد باقي الجولة', 4500);
      } else if (!m.killerName) this.pushFeed(`☠ ${this.nameOf(m.victimId)} سقط`);
    });
    r.onMessage('champion', (m) => {
      const v = this.views.get(m.id);
      if (v) { this.playFx(3, v.x, v.y - 30, 6, 0xffd166); this.shockwave(v.x, v.y, 180, 0xffd166, 700); this.burst(v.x, v.y - 30, 0xffd166, { count: 40, speedMax: 340, scale: 1.5 }); }
      if (m.id === this.myId) { this.toast(`👑 <b>أنت البطل${m.roundStart ? ' لهالجولة' : ' الأقوى'}!</b> صحة وضرر أكثر وجيشك أقوى — بس الكل رح يطاردك`, 3800); this.punchZoom(0.12); }
      else this.showBanner(m.roundStart ? `👑 ${m.name} بطل الجولة (🛡️ ${m.power}) — جيشه أقوى، اقتله واكسب قدرة خارقة وقوة جيش!` : `👑 ${m.name} صار البطل الأقوى (${m.kills} قتلات) — اقتله واكسب قدرة خارقة!`, 3500);
      playSfx('boss_warning');
    });
    r.onMessage('mythic', (m) => {
      const def = MYTHICS[m.mythicId];
      const v = this.views.get(m.playerId);
      if (v) { this.castCircle(v.x, v.y, def ? def.color : 0xffffff, 150); this.playFx(4, v.x, v.y - 30, 7, def ? def.color : 0xffffff); this.burst(v.x, v.y - 30, def ? def.color : 0xffffff, { count: 50, speedMax: 380, scale: 1.6 }); }
      this.cameras.main.flash(250, 255, 240, 200);
      if (m.playerId === this.myId) {
        this.toast(`<div style="${def ? iconStyle(def.icon, 36) : ''}"></div><div>⚡ قتلت البطل <b>${m.victimName}</b> وكسبت <b>${def ? def.nameAr : m.mythicId}</b>!<br/>${this.touch ? 'الزر البنفسجي' : 'اضغط E'}</div>`, 5000);
        this.punchZoom(0.15);
      } else this.showBanner(`⚡ ${m.playerName} أسقط البطل وكسب ${def ? def.nameAr : ''}!`, 3500);
      playSfx('victory');
    });
    r.onMessage('fusion', (m) => {
      const def = FUSIONS[m.fusionId];
      const v = this.views.get(m.id);
      if (v && def) { this.castCircle(v.x, v.y, def.color, 120); this.playFx(3, v.x, v.y - 30, 6, def.color); this.burst(v.x, v.y - 30, def.color, { count: 40, speedMax: 320, scale: 1.4 }); }
      if (m.id === this.myId && def) { this.announce('🧬 اندماج!', def.color); this.toast(`<div style="${iconStyle(def.icon, 36)}"></div><div>🧬 اندمجت قدراتك: <b>${def.nameAr}</b><br/>${def.desc} — ${this.touch ? 'الزر الأخضر' : 'اضغط R'}</div>`, 5000); playSfx('upgrade'); }
      else if (def) this.pushFeed(`🧬 ${m.name} فتح ${def.nameAr}`);
    });
    r.onMessage('upgraded', (m) => {
      if (m.id !== this.myId) return;
      const u = UPGRADES[m.upgrade];
      const v = this.views.get(m.id);
      if (v) { this.floatText(v.x, v.y - 90, `${u.icon} ${u.nameAr} ${m.lvl}`, '#7dffb0', 20); this.playFx(5, v.x, v.y - 30, 4, 0x7dffb0); }
      playSfx('upgrade');
    });
    r.onMessage('multikill', (m) => {
      const names = { 2: 'قتلة مزدوجة!', 3: 'قتلة ثلاثية!', 4: 'مجزرة رباعية!' };
      const t = names[m.n] || `🔥 ${m.n} قتلات ورا بعض!`;
      if (m.id === this.myId) this.announce(`⚔ ${t}`, 0xff5e5e); else this.showBanner(`⚔ ${m.name}: ${t}`, 2200);
    });
    r.onMessage('streak', (m) => {
      const t = m.level >= 5 ? '💀 هيجان! ضرر وسرعة أكثر' : '🔥 مولّع! نار حوالين جسمك';
      const v = this.views.get(m.id);
      if (v) { this.shockwave(v.x, v.y, 160, m.level >= 5 ? 0xff3030 : 0xff7a3c, 500); this.playFx(12, v.x, v.y - 30, 5, null); }
      if (m.id === this.myId) this.announce(t, m.level >= 5 ? 0xff3030 : 0xff7a3c); else this.pushFeed(`${m.name}: ${t}`);
    });
    r.onMessage('wanted', (m) => {
      if (m.id === this.myId) this.toast('💰 <b>صرت مطلوب!</b> اللي بيقتلك بياخد مكافأة', 3500);
      else this.showBanner(`💰 ${m.name} صار مطلوب — اقتله للمكافأة!`, 3000);
    });
    r.onMessage('bountyClaim', (m) => this.showBanner(`💰 ${m.name} صاد المطلوب ${m.victimName}!`, 3000));
    r.onMessage('phoenix', (m) => {
      this.playFx(12, m.x, m.y - 30, 8, null); this.shockwave(m.x, m.y, 170, 0xffa040, 500);
      this.burst(m.x, m.y - 30, 0xffa040, { count: 50, speedMax: 360, scale: 1.6, gravity: -100 });
      this.floatText(m.x, m.y - 90, '🐦‍🔥 بُعِث!', '#ffa040', 24);
      this.shake(m.x, m.y, 250, 0.012);
    });
    r.onMessage('curse', (m) => {
      this.beam(m.x, m.y - 30, m.tx, m.ty - 20, 0xb0c0ff, 6, 600);
      this.playFx(17, m.tx, m.ty - 20, 5, 0x8a9aff); this.burst(m.tx, m.ty - 20, 0xb0c0ff, { count: 26, speedMax: 220 });
      this.floatText(m.tx, m.ty - 80, '👻 ملعون!', '#b0c0ff', 22);
      if (m.targetId === this.myId) this.toast(`👻 الشبح <b>${m.name}</b> لعنك!`, 2500);
      else if (m.fromId !== this.myId) this.pushFeed(`👻 ${m.name} لعن ${m.targetName}`);
    });
    r.onMessage('timeStop', (m) => {
      this.timeStop = { id: m.id, name: m.name, until: performance.now() + m.ms };
      const v = this.views.get(m.id);
      if (v) { this.shockwave(v.x, v.y, 900, 0xffe27a, 800); this.castCircle(v.x, v.y, 0xffe27a, 180); }
      this.cameras.main.flash(180, 255, 255, 255);
      this.shake(0, 0, 250, 0.01, true);
      this.punchZoom(0.1);
      playSfx('world_event');
    });
    r.onMessage('rewind', (m) => this.onRewind(m));
    r.onMessage('swap', (m) => this.onSwap(m));
    r.onMessage('zone', (m) => {
      const now = performance.now();
      this.zones.push({ ...m, start: now, until: now + m.ms });
      if (m.r > 70) {
        const c = this.familyColor(defOf(m.id)) || 0xffffff;
        this.shockwave(m.x, m.y, m.r, c, 450);
        if (m.zstyle === 'bubble' || m.zstyle === 'rift') this.playFx(m.zstyle === 'bubble' ? 3 : 17, m.x, m.y - 20, 6, c);
        playSfx('cast_control');
      }
    });
    r.onMessage('zoneEnd', (m) => { const z = this.zones.find((q) => q.zid === m.zid); if (z) z.until = Math.min(z.until, performance.now() + 250); });
    r.onMessage('flip', (m) => {
      const p = this.projectiles.find((q) => q.pid === m.pid);
      if (p) { p.dir.set(m.dx, m.dy); p.travelled = 0; p.img.setRotation(Math.atan2(m.dy, m.dx)); p.flipped = true; }
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
      }));
      this.showBanner('🫰 طقة القدر! الكل خسر ثلث صحته', 2600);
      playSfx('impact');
    });
    r.onMessage('summon', (m) => {
      const base = this.add.image(m.x, m.y + 10, 'village', 'pillar').setOrigin(0.5, 1).setScale(3).setTint(0xb8e090).setDepth(m.y);
      const bow = this.add.image(m.x, m.y - 64, 'bow').setScale(4).setDepth(m.y + 1);
      this.tweens.add({ targets: bow, angle: { from: -15, to: 15 }, yoyo: true, repeat: -1, duration: 500 });
      this.playFx(18, m.x, m.y - 10, 4, 0x9ccc65);
      this.summonViews.set(m.sid, { base, bow });
      this.time.delayedCall(m.ms + 200, () => this.removeSummon(m.sid));
    });
    r.onMessage('summonEnd', (m) => this.removeSummon(m.sid));
    r.onMessage('dropIncoming', (m) => {
      const crate = this.add.image(m.x, m.y - 600, 'tiles', 'crate').setOrigin(0.5, 1).setScale(4).setDepth(9000);
      const glow = this.add.image(m.x, m.y - 600, 'glow').setTint(0xffd166).setBlendMode(Phaser.BlendModes.ADD).setScale(2.5).setDepth(8999);
      this.tweens.add({ targets: [crate, glow], y: m.y, duration: m.ms, ease: 'Quad.in', onComplete: () => { crate.destroy(); glow.destroy(); } });
      this.pushFeed('🎁 صندوق قدرات نازل من السما!');
      const me = this.room.state.players.get(this.myId);
      if (me && me.alive && Math.hypot(me.x - m.x, me.y - m.y) < 900) this.showBanner('🎁 صندوق نازل قريب منك — الحقه!', 2200);
    });
    r.onMessage('dropTaken', (m) => {
      const def = LEGENDS[m.legendId];
      this.playFx(5, m.x, m.y - 20, 5, 0xffd166); this.burst(m.x, m.y - 20, 0xffd166, { count: 36, speedMax: 300, scale: 1.4 });
      if (m.playerId === this.myId && def) { this.toast(`<div style="${iconStyle(def.icon, 36)}"></div><div>🎁 كسبت <b>${def.nameAr}</b> لمرة وحدة!<br/>${this.touch ? 'الزر الذهبي الصغير' : 'اضغط F'}</div>`, 4500); playSfx('upgrade'); }
      else this.pushFeed(`🎁 ${m.name} أخذ الصندوق`);
    });
    r.onMessage('bossSpawn', (m) => {
      this.announce('👹 الغول العملاق ظهر!', 0xff5a1f);
      this.showBanner('👹 الغول العملاق بنص الخريطة — اللي بيقتله بياخد قوة دائمة!', 4000);
      this.shake(m.x, m.y, 500, 0.012, true);
      this.shockwave(m.x, m.y, 300, 0xff5a1f, 800);
      playSfx('boss_warning');
    });
    r.onMessage('bossRoar', () => this.shake(0, 0, 250, 0.006, true));
    r.onMessage('bossDown', (m) => {
      this.playFx(12, m.x, m.y - 40, 10, null); this.shockwave(m.x, m.y, 300, 0xffd166, 700);
      this.burst(m.x, m.y - 40, 0xffd166, { count: 60, speedMax: 420, scale: 1.8 });
      if (m.killerId === this.myId) { this.announce('👹 قتلت الغول!', 0xffd166); this.toast('💪 <b>قوة الغول معك:</b> ضرر +30% دائم + شفاء كامل + ترقية', 4500); this._bossKill = true; }
      else if (m.killerName) this.showBanner(`👹 ${m.killerName} قتل الغول وأخذ قوته!`, 3500);
      playSfx('victory');
    });
    r.onMessage('worldEvent', (m) => { this.announce(WORLD_EVENTS[m.id] || m.id, 0xffd166); playSfx('world_event'); });
    r.onMessage('finalDuel', (m) => this.showBanner(`🗡 المبارزة الأخيرة: ${m.a} ضد ${m.b}`, 3200));
    r.onMessage('matchStart', (m) => {
      this.myTraps = []; this.zones = [];
      if (!m.round || m.round === 1) this._bossKill = false;
      if (m.final) { this.announce('⚔ الحرب الأخيرة!', 0xff6b3d); this.showBanner('⚔ الكل بجيشه الكامل — آخر قوة صامدة بتفوز. جيشك بيطارد أهدافك 🎯', 4000); this.cameras.main.flash(400, 255, 90, 40); playSfx('boss_warning'); }
      else { this.announce(`⚔ الجولة ${m.round || 1}/${m.rounds || 5}`, 0xffd166); this.showBanner('⚔ ابدأ القتال! جيشك معك 🛡️', 2200); }
    });
    r.onMessage('roundEnd', (m) => this.showRoundEnd(m));
    r.onMessage('map', () => {});
  },

  removeSummon(sid) {
    const s = this.summonViews.get(sid);
    if (!s) return;
    this.playFx(18, s.base.x, s.base.y - 20, 3, 0x9ccc65);
    s.base.destroy(); s.bow.destroy(); this.summonViews.delete(sid);
  },

  nameOf(id) { const p = this.room.state.players.get(id); return p ? p.name : '???'; },

  onCast(m) {
    const def = defOf(m.abilityId);
    if (!def) return;
    const now = performance.now();
    const v = this.views.get(m.casterId);
    if (v && !m.noPose) {
      v.castUntil = now + 260;
      const dx = m.tx - m.x, dy = m.ty - m.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) v.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    }
    const color = this.familyColor(def);
    const id = m.abilityId;
    const mine = m.casterId === this.myId;
    const big = !!(LEGENDS[id] || MYTHICS[id] || FUSIONS[id]);
    if (big) {
      this.castCircle(m.x, m.y, color, MYTHICS[id] ? 130 : 95);
      this.floatText(m.x, m.y - 90, (m.bonus ? '🎁 ' : '') + def.nameAr, this.hexOf(color), MYTHICS[id] ? 24 : 19);
      if (mine) this.punchZoom(MYTHICS[id] ? 0.08 : 0.05);
    }
    switch (def.kind) {
      case 'proj':
        this.spawnProjectiles(m, def);
        if (v && id !== 'strike' && !m.noPose) this.playFx(8, m.x, m.y - 14, 1.6, color);
        playSfx(id === 'strike' || id === 'turret_shot' ? 'cast_mobility' : 'cast_offensive');
        return;
      case 'wave': {
        const dir = new Phaser.Math.Vector2(m.tx - m.x, m.ty - m.y);
        if (dir.lengthSq() === 0) dir.set(1, 0);
        dir.normalize();
        const style = def.applies === 'wet' ? 'water' : def.family === 'fire' ? 'fire' : 'wind';
        this.waves.push({ id, ox: m.x, oy: m.y, dir, speed: def.speed, width: def.width, length: def.length, color, start: now + (def.telegraph || 0), lastSpawn: 0, style, big: id === 'tsunami' });
        if (id === 'plasma_beam') this.beam(m.x, m.y - 20, m.x + dir.x * def.length, m.y - 20 + dir.y * def.length, 0xff9a3c, 14, 500);
        playSfx('cast_area');
        return;
      }
      case 'dash':
        this.playFx(def.blink ? 14 : 18, m.x, m.y - 16, 2.6, color);
        if (!def.blink) this.ghostTrail(v, m.x, m.y, m.tx, m.ty, color, 5);
        else this.playFx(14, m.tx, m.ty - 16, 3, color);
        if (def.damage) this.beam(m.x, m.y - 16, m.tx, m.ty - 16, color, 5, 300);
        if (v) { v.x = m.tx; v.y = m.ty; }
        playSfx('cast_mobility');
        return;
      case 'buff': {
        const dur = def.invulnMs || def.berserkMs || def.hasteMs || def.phoenixMs || def.lifestealMs || def.dmgBuffMs || def.hotMs || def.reflectMs || 1500;
        if (def.invulnMs) this.auras.push({ kind: 'bubble', followId: m.casterId, start: now, dur: def.invulnMs, color: 0xffd166, big: id === 'kings_fortress' });
        if (def.reflectMs || def.shieldAdd) this.auras.push({ kind: 'bubble', followId: m.casterId, start: now, dur: Math.max(def.reflectMs || 0, 1500), color: 0xaee8ff });
        if (def.hot || def.heal) this.auras.push({ kind: 'heal', followId: m.casterId, start: now, dur: def.hotMs || 1200, color: def.family === 'fire' ? 0xffb060 : 0x7dffb0 });
        if (def.berserkMs || def.dmgBuffMs || def.lifestealMs) this.auras.push({ kind: 'rage', followId: m.casterId, start: now, dur, color: id === 'blood_moon' ? 0xff3050 : 0xff4040 });
        if (def.hasteMs) this.auras.push({ kind: 'haste', followId: m.casterId, start: now, dur: def.hasteMs, color });
        if (def.phoenixMs) this.auras.push({ kind: 'phoenix', followId: m.casterId, start: now, dur: def.phoenixMs, color });
        this.playFx(def.family === 'fire' ? 12 : 5, m.x, m.y - 24, 4, color);
        this.shockwave(m.x, m.y, 90, color, 350);
        playSfx(def.invulnMs || def.heal || def.hot ? 'cast_defensive' : 'cast_offensive');
        return;
      }
      case 'special': this.onCastSpecial(m, def, v, now, color); return;
      default:
        playSfx(def.kind === 'zone' || def.kind === 'strike' ? 'cast_area' : 'cast_control');
    }
  },

  onCastSpecial(m, def, v, now, color) {
    switch (m.abilityId) {
      case 'black_hole': this.auras.push({ kind: 'vortex', x: m.tx, y: m.ty, start: now, dur: def.telegraph, color, r: def.pullRadius }); playSfx('cast_control'); break;
      case 'thunderstorm': this.auras.push({ kind: 'storm', followId: m.casterId, start: now, dur: def.telegraph, color, r: def.radius }); playSfx('cast_area'); break;
      case 'time_rewind': this.playFx(13, m.x, m.y - 20, 4, 0x7fe0ff); playSfx('cast_mobility'); break;
      case 'destiny_snap':
        this.auras.push({ kind: 'snap', followId: m.casterId, start: now, dur: 900, color: 0xffffff });
        this.showBanner(`🫰 ${this.nameOf(m.casterId)} رح يطقّ أصابعه...`, 1000);
        playSfx('boss_warning'); break;
      case 'space_portal':
        this.ghostTrail(v, m.x, m.y, m.tx, m.ty, 0x9d7bff, 3);
        if (v) { v.x = m.tx; v.y = m.ty; }
        playSfx('cast_mobility'); break;
      default: playSfx('cast_control');
    }
  },

  onImpact(m) {
    if (m.pid) this.removeProjectile(m.pid);
    const t = IMPACT_ALIAS[m.type] || m.type;
    if (t === 'poof') { this.playFx(18, m.x, m.y, 1.8, 0xcccccc); return; }
    if (t === 'ushot') { this.burst(m.x, m.y, 0xffffff, { count: 4, speedMax: 90, scale: 0.8 }); return; }
    const def = defOf(m.type);
    if (def && def.kind === 'proj') {
      const color = this.familyColor(def);
      const heavy = ['fate_arrow', 'death_mark', 'rock_throw', 'boss_rock', 'void_bolt'].includes(t);
      this.playFx(8, m.x, m.y, heavy ? 5 : t === 'strike' ? 2 : 3.2, color);
      this.burst(m.x, m.y, color, { count: heavy ? 26 : 12, speedMax: heavy ? 320 : 200, scale: heavy ? 1.6 : 1 });
      if (t === 'fireball' || t === 'hellfire_blades') { this.playFx(12, m.x, m.y - 10, 3.2, null); this.shockwave(m.x, m.y, 70, 0xff7a3c, 300); }
      if (def.applies === 'poison') this.burst(m.x, m.y, 0x9be25a, { count: 10, speedMax: 90, gravity: -80, life: 800 });
      if (def.applies === 'shock') this.drawBolt(m.x - 20, m.y - 30, m.x + 20, m.y + 10, 0xfff27a);
      if (t === 'rock_throw' || t === 'boss_rock') this.playFx(18, m.x, m.y, 4, 0xa0703f);
      if (t !== 'strike' && t !== 'turret_shot') this.shake(m.x, m.y, heavy ? 180 : 70, heavy ? 0.01 : 0.003);
      return;
    }
    const R = m.radius || 100;
    const mark = (color, dur = 2400, alpha = 0.45, vines = false) => this.groundMarks.push({ x: m.x, y: m.y, r: R * 0.85, color, start: performance.now(), dur, alpha, vines });
    switch (t) {
      case 'lightning':
        this.drawBolt(m.x, m.y - 520, m.x, m.y, 0xfff27a, true);
        this.playFx(19, m.x, m.y - 20, 6, 0xfff27a); this.shockwave(m.x, m.y, R, 0xfff27a, 300);
        this.burst(m.x, m.y, 0xfff27a, { count: 22, speedMax: 300 });
        this.shake(m.x, m.y, 140, 0.008); playSfx('impact'); break;
      case 'earth':
        this.playFx(18, m.x, m.y - 10, 10, 0xa0703f); this.shockwave(m.x, m.y, R, 0xc28e5c, 450);
        this.burst(m.x, m.y, 0x8a5a2b, { count: 40, speedMax: 360, scale: 1.6, gravity: 600, tex: 'pixel' }); mark(0x4f7a2a, 2400, 0.45, true);
        this.shake(m.x, m.y, 200, 0.011); playSfx('impact'); break;
      case 'slam': case 'spike':
        this.playFx(18, m.x, m.y - 10, t === 'spike' ? 4 : 9, 0xc9a06a);
        this.shockwave(m.x, m.y, R, 0xffe0a0, 380);
        this.burst(m.x, m.y, 0x8a5a2b, { count: t === 'spike' ? 14 : 36, speedMax: 340, scale: 1.5, gravity: 700, tex: 'pixel' });
        if (t === 'spike') { const g = this.add.image(m.x, m.y + 6, 'lance').setOrigin(0.5, 1).setScale(5).setAngle(-90).setDepth(m.y); this.tweens.add({ targets: g, y: m.y - 20, alpha: 0, duration: 500, onComplete: () => g.destroy() }); }
        mark(0x3a2814, 2200, 0.4);
        this.shake(m.x, m.y, t === 'spike' ? 90 : 220, t === 'spike' ? 0.005 : 0.013); playSfx('impact'); break;
      case 'meteor': case 'lava': {
        const small = t === 'lava';
        const rock = this.add.image(m.x + 140, m.y - 520, 'fireball').setScale(small ? 5 : 9).setDepth(5500).setRotation(Math.atan2(520, -140));
        this.tweens.add({ targets: rock, x: m.x, y: m.y, duration: 130, onComplete: () => rock.destroy() });
        this.time.delayedCall(130, () => {
          this.playFx(12, m.x, m.y - 30, small ? 4.5 : 7.5, null); this.shockwave(m.x, m.y, R, 0xff6a3d, 380);
          this.burst(m.x, m.y, 0xff6a3d, { count: small ? 16 : 34, speedMax: 380, scale: 1.8 }); mark(0x2a1a10, 4000);
          this.shake(m.x, m.y, small ? 120 : 230, small ? 0.006 : 0.015); playSfx('impact');
        });
        break;
      }
      case 'arrows': {
        for (let i = 0; i < 4; i++) { const a = this.add.image(m.x + (Math.random() - 0.5) * R, m.y - 300, 'arrow').setScale(3).setAngle(90).setDepth(5500); this.tweens.add({ targets: a, y: m.y + (Math.random() - 0.5) * R * 0.6, duration: 120 + i * 30, onComplete: () => a.destroy() }); }
        this.time.delayedCall(140, () => { this.playFx(8, m.x, m.y, 3, 0xffe27a); this.burst(m.x, m.y, 0xc28e5c, { count: 10, speedMax: 160, tex: 'pixel', gravity: 400 }); });
        break;
      }
      case 'ice':
        this.playFx(14, m.x, m.y - 20, Math.max(5, R / 22), 0x9fe8ff); this.shockwave(m.x, m.y, R, 0xcff6ff, 500);
        this.burst(m.x, m.y, 0xcff6ff, { count: 44, speedMax: 440, scale: 1.4 }); mark(0x9fe8ff, 2800, 0.32);
        this.shake(m.x, m.y, 190, 0.01); playSfx('impact'); break;
      case 'firering': case 'sunflare':
        this.playFx(12, m.x, m.y - 20, R / 18, null); this.shockwave(m.x, m.y, R, t === 'sunflare' ? 0xffd166 : 0xff7a3c, 420);
        for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; this.playFx(20, m.x + Math.cos(a) * R * 0.7, m.y + Math.sin(a) * R * 0.45 - 16, 3, null); }
        this.burst(m.x, m.y - 10, 0xff9a3c, { count: 36, speedMax: 360, scale: 1.5 }); mark(0x2a1a10, 2500, 0.35);
        if (t === 'sunflare') this.cameras.main.flash(160, 255, 220, 120);
        this.shake(m.x, m.y, 200, 0.011); playSfx('impact'); break;
      case 'steam':
        this.playFx(18, m.x, m.y - 20, R / 20, 0xffffff); this.shockwave(m.x, m.y, R, 0xe0f0ff, 450);
        this.burst(m.x, m.y - 10, 0xffffff, { count: 30, speedMin: 20, speedMax: 160, gravity: -120, life: 1000, scale: 3, tex: 'glow' });
        this.shake(m.x, m.y, 200, 0.01); playSfx('impact'); break;
      case 'magnet':
        this.shockwave(m.x, m.y, R, 0xc8b0ff, 350);
        for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; this.drawBolt(m.x + Math.cos(a) * R, m.y + Math.sin(a) * R * 0.6, m.x, m.y, 0xc8b0ff); }
        playSfx('impact'); break;
      case 'splash':
        this.playFx(15, m.x, m.y - 20, 7, null); this.shockwave(m.x, m.y, R, 0x4cb6ff, 380);
        this.burst(m.x, m.y, 0x4cb6ff, { count: 30, speedMax: 320, gravity: 400 });
        playSfx('cast_mobility'); break;
      case 'blackhole':
        this.playFx(1, m.x, m.y - 10, 13, 0xb388ff); this.shockwave(m.x, m.y, 300, 0xb388ff, 600);
        this.burst(m.x, m.y, 0xb388ff, { count: 50, speedMax: 440, scale: 1.6 });
        this.shake(m.x, m.y, 260, 0.015); playSfx('impact'); break;
      case 'volcano':
        this.playFx(12, m.x, m.y - 40, 10, null); this.shockwave(m.x, m.y, R, 0xff4a1a, 500);
        this.burst(m.x, m.y - 20, 0xff5a1f, { count: 60, speedMax: 460, scale: 2, gravity: 500 }); mark(0x2a1a10, 5000, 0.5);
        this.shake(m.x, m.y, 300, 0.016); playSfx('impact'); break;
      case 'cone': {
        const def2 = defOf(m.id) || {};
        const base = Math.atan2(m.dy, m.dx);
        const fire = def2.family === 'fire';
        const n = fire ? 8 : 6;
        for (let i = 0; i < n; i++) {
          const a = base + (Math.random() - 0.5) * (m.arc || 0.6) * 1.8, d = 50 + Math.random() * (m.radius - 50);
          if (fire) this.playFx(20, m.x + Math.cos(a) * d, m.y - 16 + Math.sin(a) * d, 3.5 + Math.random() * 2.5, null);
          else this.playFx(15, m.x + Math.cos(a) * d, m.y - 16 + Math.sin(a) * d, 3, 0xdff4ff);
        }
        const deg = Phaser.Math.RadToDeg(base), spread = Phaser.Math.RadToDeg(m.arc || 0.6);
        const e = this.add.particles(m.x, m.y - 16, 'spark', { angle: { min: deg - spread, max: deg + spread }, speed: { min: 300, max: 680 }, lifespan: m.radius / 1.2, scale: { start: 2, end: 0 }, tint: fire ? [0xffd166, 0xff7a3c, 0xff3d1f] : [0xffffff, 0xbfe8ff, 0x8ae8ff], blendMode: 'ADD', emitting: false }).setDepth(5000);
        e.explode(Math.round(45 * this.fxMul)); this.time.delayedCall(650, () => e.destroy());
        this.shake(m.x, m.y, 90, 0.004); playSfx('cast_area'); break;
      }
      case 'warp':
        this.shockwave(m.x, m.y, R, 0xff6bf0, 700); this.playFx(17, m.x, m.y - 20, 10, 0xff6bf0);
        for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; this.playFx(17, m.x + Math.cos(a) * 200, m.y + Math.sin(a) * 120, 4, 0xff9bf5); }
        this.burst(m.x, m.y - 20, 0xff6bf0, { count: 50, speedMax: 480, scale: 1.6 });
        this.cameras.main.flash(120, 255, 150, 240); this.shake(m.x, m.y, 220, 0.012); playSfx('impact'); break;
      case 'portal':
        this.playFx(14, m.x, m.y - 20, 8, 0x9d7bff);
        this.auras.push({ kind: 'portal', x: m.x, y: m.y, start: performance.now(), dur: 900, color: 0x9d7bff, r: R });
        this.shockwave(m.x, m.y, R, 0xc9b5ff, 420); this.burst(m.x, m.y - 20, 0x9d7bff, { count: 36, speedMax: 360, scale: 1.5 });
        this.shake(m.x, m.y, 180, 0.01); playSfx('impact'); break;
      case 'heal':
        this.playFx(5, m.x, m.y, 4, 0x7dffb0); this.burst(m.x, m.y, 0x7dffb0, { count: 16, speedMax: 140 }); break;
      case 'trap':
        this.playFx(16, m.x, m.y - 10, 4.5, 0x9ccc65); mark(0x4f7a2a, 1600, 0.45, true);
        this.myTraps = this.myTraps.filter((k) => Math.hypot(k.x - m.x, k.y - m.y) > 5);
        playSfx('impact'); break;
      case 'dropLand':
        this.playFx(18, m.x, m.y - 10, 6, 0xffd166); this.shockwave(m.x, m.y, 90, 0xffd166, 400);
        this.burst(m.x, m.y, 0xc28e5c, { count: 24, speedMax: 260, tex: 'pixel', gravity: 500 });
        this.shake(m.x, m.y, 160, 0.008); playSfx('impact'); break;
      default: {
        const c = this.familyColor(def);
        this.shockwave(m.x, m.y, R, c, 380);
        this.playFx(def && def.family === 'ice' ? 14 : def && def.family === 'storm' ? 19 : def && def.family === 'nature' ? 16 : 8, m.x, m.y - 16, Math.max(3, R / 30), c);
        this.burst(m.x, m.y - 10, c, { count: 24, speedMax: 300, scale: 1.3 });
        this.myTraps = this.myTraps.filter((k) => Math.hypot(k.x - m.x, k.y - m.y) > 5);
        this.shake(m.x, m.y, 140, 0.007); playSfx('impact');
      }
    }
  },

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
  },

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
  },

  onSwap(m) {
    const a = this.views.get(m.aId), b = this.views.get(m.bId);
    this.beam(m.ax, m.ay - 20, m.bx, m.by - 20, 0xd07bff, 5, 450);
    [[m.ax, m.ay], [m.bx, m.by]].forEach(([x, y]) => { this.playFx(5, x, y - 20, 5, 0xd07bff); this.shockwave(x, y, 80, 0xd07bff, 320); });
    if (a) { a.x = m.ax; a.y = m.ay; }
    if (b) { b.x = m.bx; b.y = m.by; }
    this.floatText((m.ax + m.bx) / 2, (m.ay + m.by) / 2 - 60, '🌀 تبديل!', '#d07bff', 22);
    if (m.aId === this.myId || m.bId === this.myId) { this.cameras.main.flash(160, 210, 120, 255); this.punchZoom(0.08); }
    playSfx('cast_control');
  },
};

export { ABILITIES, FAMILIES };
