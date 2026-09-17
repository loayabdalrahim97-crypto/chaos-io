// Visual helpers + per-frame world drawing (projectiles, waves, zones, telegraphs, auras, screen overlays).
import Phaser from 'phaser';
import { defOf, FAMILIES } from '../gameData.js';

export const clampNum = (v, a, b) => Math.max(a, Math.min(b, v));

// projectile look per ability (fallback: glowing orb in the ability colour)
const PROJ_STYLE = {
  strike:         { tex: 'shuriken', scale: 2.6, spin: true, glow: 0xffffff, glowScale: 0.7 },
  fireball:       { tex: 'fireball', scale: 4.2, trail: 0xff7a3c, glowScale: 1.6 },
  ember_fan:      { tex: 'fireball', scale: 3, trail: 0xffa040, glowScale: 1.1 },
  hellfire_blades:{ tex: 'fireball', scale: 3.4, trail: 0xff5a1f, glowScale: 1.2 },
  ice_shard:      { tex: 'icespike', scale: 4, trail: 0x8ae8ff, glowScale: 1.3 },
  glacial_spike:  { tex: 'icespike', scale: 5.5, trail: 0xbff4ff, glowScale: 1.6 },
  snow_barrage:   { tex: 'spark', scale: 2.2, tint: 0xffffff, trail: 0xdff4ff, glowScale: 0.8 },
  hunter_mark:    { tex: 'arrow', scale: 4, trail: 0xff5e7a, glowScale: 1.1 },
  turret_shot:    { tex: 'arrow', scale: 3, trail: 0x9ccc65, glowScale: 0.8 },
  fate_arrow:     { tex: 'arrow', scale: 9, tint: 0xffe27a, trail: 0xffe27a, glowScale: 3 },
  poison_dagger:  { tex: 'sai', scale: 4.5, spin: true, trail: 0x9be25a, glowScale: 1.2 },
  stun_bolt:      { tex: 'kunai', scale: 4, trail: 0xfff27a, glowScale: 1 },
  death_mark:     { tex: 'kunai', scale: 5, tint: 0xd8a0ff, trail: 0xb05bff, glowScale: 1.6 },
  shuriken_storm: { tex: 'shuriken', scale: 2.6, spin: true, trail: 0xdddddd, glowScale: 0.8 },
  boomerang:      { tex: 'axe', scale: 5, spin: true, trail: 0xffc36b, glowScale: 1.4 },
  vine_pull:      { tex: 'spark', scale: 3, tint: 0x7ccf4a, trail: 0x7ccf4a, glowScale: 1.2, vine: true },
  rock_throw:     { tex: 'rock', scale: 1.6, spin: true, trail: 0xa0703f, glowScale: 0.1 },
  boss_rock:      { tex: 'rock', scale: 2.2, spin: true, trail: 0xa0703f, glowScale: 0.1 },
  thunder_orb:    { tex: 'spark', scale: 6, tint: 0xfff9b0, trail: 0xfff27a, glowScale: 2.6, zap: true },
  ball_lightning: { tex: 'spark', scale: 4, tint: 0xfff9b0, trail: 0xfff27a, glowScale: 2, zap: true },
  spark_fan:      { tex: 'spark', scale: 2.2, tint: 0xfff27a, trail: 0xfff27a, glowScale: 1 },
  void_bolt:      { tex: 'spark', scale: 4, tint: 0x2a0a3a, trail: 0xb05bff, glowScale: 2.2 },
  plague_swarm:   { tex: 'spark', scale: 2.4, tint: 0x9be25a, trail: 0x5a8a2a, glowScale: 1 },
  soul_drain:     { tex: 'spark', scale: 3.4, tint: 0xff6bd8, trail: 0xff6bd8, glowScale: 1.6 },
  silence_seal:   { tex: 'spark', scale: 3.4, tint: 0xd0a0ff, trail: 0xd0a0ff, glowScale: 1.6 },
};
export function projStyle(id) {
  const d = defOf(id) || {};
  const s = PROJ_STYLE[id] || { tex: 'spark', scale: 3, tint: d.color, trail: d.color, glowScale: 1.3 };
  return { glow: s.glow ?? s.trail ?? d.color ?? 0xffffff, ...s, pierce: !!d.pierce, boomerang: !!d.boomerang, homing: d.homing || 0, delay: d.delay || 0 };
}

const ZONE_COLORS = {
  fire: 0xff6a2a, ice: 0x9fe8ff, shock: 0xfff27a, smoke: 0x8a8a98, curse: 0xb05bff, poison: 0x9be25a,
  thorn: 0x6fae3a, holy: 0x9dffb0, vortex: 0xe8f4ff, bubble: 0x8fd0ff, rift: 0xff5bd8,
};

export const fxMixin = {
  playFx(n, x, y, scale = 2, tint = null, depth = 5200) {
    const s = this.add.sprite(x, y, 'fx' + n).setScale(scale).setDepth(depth);
    if (tint !== null && tint !== undefined) s.setTint(tint);
    s.play('fx' + n);
    s.once('animationcomplete', () => s.destroy());
    return s;
  },

  burst(x, y, color, o = {}) {
    const count = Math.max(1, Math.round((o.count ?? 12) * (o.count > 1 ? this.fxMul : 1)));
    const life = o.life ?? 560;
    const e = this.add.particles(x, y, o.tex || 'spark', {
      lifespan: life, speed: { min: o.speedMin ?? 40, max: o.speedMax ?? 200 }, scale: { start: o.scale ?? 1, end: 0 },
      alpha: { start: 1, end: 0 }, tint: color, gravityY: o.gravity || 0, blendMode: o.tex === 'pixel' ? 'NORMAL' : 'ADD', emitting: false,
    }).setDepth(5100);
    e.explode(count);
    this.time.delayedCall(life + 80, () => e.destroy());
  },

  shockwave(x, y, r, color, dur = 400) {
    const g = this.add.graphics().setDepth(4950).setPosition(x, y);
    g.lineStyle(10, color, 0.35); g.strokeEllipse(0, 0, 2, 1.3);
    g.lineStyle(4, color, 1); g.strokeEllipse(0, 0, 2, 1.3);
    g.fillStyle(color, 0.12); g.fillEllipse(0, 0, 2, 1.3);
    g.setScale(0.1);
    this.tweens.add({ targets: g, scaleX: r, scaleY: r, alpha: { from: 1, to: 0 }, duration: dur, ease: 'Cubic.out', onComplete: () => g.destroy() });
  },

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
  },

  ghostTrail(v, x1, y1, x2, y2, color, n) {
    if (!v) return;
    for (let i = 1; i <= n; i++) {
      const gx = x1 + (x2 - x1) * i / (n + 1), gy = y1 + (y2 - y1) * i / (n + 1);
      const ghost = this.add.image(gx, gy + 8, v.sprite.texture.key, v.sprite.frame.name).setOrigin(0.5, 1).setScale(v.sprite.scaleX).setTintFill(color).setAlpha(0.5).setDepth(gy);
      this.tweens.add({ targets: ghost, alpha: 0, duration: 420, delay: i * 30, onComplete: () => ghost.destroy() });
    }
  },

  shake(x, y, ms, k, global = false) {
    const me = this.room.state.players.get(this.myId);
    const d = global || !me ? 0 : Math.hypot(me.x - x, me.y - y);
    const f = clampNum(1 - d / 700, 0, 1);
    if (f > 0) this.cameras.main.shake(ms, k * f);
  },

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
  },

  floatText(x, y, text, color = '#ffffff', size = 16) {
    const t = this.add.text(x, y, text, { fontFamily: 'Tahoma, Segoe UI', fontSize: size + 'px', fontStyle: 'bold', color, stroke: '#000000', strokeThickness: 5 }).setOrigin(0.5).setDepth(7000).setScale(0.6);
    this.tweens.add({ targets: t, scale: 1, duration: 140, ease: 'Back.out' });
    this.tweens.add({ targets: t, y: y - 50, alpha: { from: 1, to: 0 }, delay: 250, duration: 1000, ease: 'Cubic.out', onComplete: () => t.destroy() });
  },

  beam(x1, y1, x2, y2, color, width = 6, dur = 400) {
    const g = this.add.graphics().setDepth(5400);
    [[width * 2.4, color, 0.3], [width, color, 1], [Math.max(2, width / 3), 0xffffff, 1]].forEach(([w, c, al]) => { g.lineStyle(w, c, al); g.lineBetween(x1, y1, x2, y2); });
    this.tweens.add({ targets: g, alpha: 0, duration: dur, onComplete: () => g.destroy() });
  },

  hexOf(color) { return '#' + (color >>> 0).toString(16).padStart(6, '0').slice(-6); },

  // ---------------------------------------------------------------- projectiles
  spawnProjectiles(m, def) {
    const style = projStyle(m.abilityId);
    const n = def.count || 1;
    const base = Math.atan2(m.ty - m.y, m.tx - m.x) || 0;
    const full = (def.spread || 0) >= 6.2;
    const now = performance.now();
    const pids = m.pids || [0];
    for (let i = 0; i < Math.max(n, pids.length); i++) {
      const ang = n === 1 ? base : full ? base + i * (Math.PI * 2 / n) : base + (i - (n - 1) / 2) * ((def.spread || 0) / (n - 1));
      const dir = new Phaser.Math.Vector2(Math.cos(ang), Math.sin(ang));
      const oy = m.noPose ? m.y : m.y - 10;
      const img = this.add.image(m.x, oy, this.textures.exists(style.tex) ? style.tex : 'spark').setScale(style.scale).setDepth(4000).setRotation(ang);
      if (style.tint) img.setTint(style.tint);
      const glow = style.glowScale > 0.2 ? this.add.image(m.x, oy, 'glow').setTint(style.glow).setBlendMode(Phaser.BlendModes.ADD).setScale(style.glowScale).setAlpha(0.8).setDepth(3999) : null;
      if (style.delay) { img.setVisible(false); if (glow) glow.setVisible(false); this.telegraphLine = { casterId: m.casterId, dir, until: now + style.delay, color: def.color || 0xffffff }; }
      this.projectiles.push({ pid: pids[i] || 0, id: m.abilityId, img, glow, x: m.x, y: oy, dir, speed: def.speed || 700, range: def.range || 700, travelled: 0, style, startAt: now + style.delay, casterId: m.casterId, returning: false, turret: !!m.noPose });
    }
  },

  killProjectile(p) { p.img.destroy(); if (p.glow) p.glow.destroy(); },
  removeProjectile(pid) {
    const i = this.projectiles.findIndex((p) => p.pid === pid);
    if (i >= 0) { this.killProjectile(this.projectiles[i]); this.projectiles.splice(i, 1); return true; }
    return false;
  },

  updateProjectiles(state, now, dt) {
    const stopped = state.timeStopUntil > Date.now() ? state.timeStopBy : null;
    const caster = (id) => this.views.get(id);
    this.projectiles = this.projectiles.filter((p) => {
      if (stopped && p.casterId !== stopped && !p.flipped) return true;
      const cv = caster(p.casterId);
      if (now < p.startAt) {
        if (cv) { p.x = cv.x; p.y = cv.y - 10; p.img.setPosition(p.x, p.y); if (p.glow) p.glow.setPosition(p.x, p.y); }
        return true;
      }
      p.img.setVisible(true); if (p.glow) p.glow.setVisible(true);
      let speed = p.speed;
      for (const z of this.zones) {
        if (z.zstyle === 'bubble' && z.ownerId !== p.casterId && Math.hypot(p.x - z.x, p.y - z.y) < z.r) speed *= 0.25;
      }
      if (p.style.homing && !p.flipped) {
        const owner = state.players.get(p.casterId);
        let best = null, bd = 520;
        state.players.forEach((e, id) => {
          if (id === p.casterId || !e.alive || (owner && owner.team && e.team === owner.team)) return;
          const v = this.views.get(id); if (!v) return;
          const d = Math.hypot(v.x - p.x, v.y - 10 - p.y); if (d < bd) { bd = d; best = v; }
        });
        if (best) {
          const want = Math.atan2(best.y - 10 - p.y, best.x - p.x), cur = Math.atan2(p.dir.y, p.dir.x);
          let da = Math.atan2(Math.sin(want - cur), Math.cos(want - cur));
          const mt = p.style.homing * dt; da = clampNum(da, -mt, mt);
          p.dir.set(Math.cos(cur + da), Math.sin(cur + da)); p.img.setRotation(cur + da);
        }
      }
      if (p.style.boomerang && p.returning && cv) {
        const dx = cv.x - p.x, dy = cv.y - 10 - p.y, d = Math.hypot(dx, dy);
        if (d < 30) { this.killProjectile(p); return false; }
        p.dir.set(dx / d, dy / d);
      }
      const step = speed * dt;
      p.x += p.dir.x * step; p.y += p.dir.y * step; p.travelled += step;
      p.img.setPosition(p.x, p.y);
      if (p.glow) p.glow.setPosition(p.x, p.y).setScale(p.style.glowScale * (0.9 + Math.random() * 0.2));
      if (p.style.spin) p.img.rotation += dt * 20;
      if (p.style.trail && Math.random() < 0.8) this.burst(p.x, p.y, p.style.trail, { count: 1, speedMin: 5, speedMax: 35, life: 340, scale: p.id === 'fate_arrow' ? 2.4 : 1.1 });
      if (p.style.zap && Math.random() < 0.15) this.drawBolt(p.x - 18, p.y - 14, p.x + 18, p.y + 14, 0xfff27a);
      if (p.style.vine && cv) {
        this.gfxFx.lineStyle(6, 0x3e7a22, 0.9); this.gfxFx.lineBetween(cv.x, cv.y - 14, p.x, p.y);
        this.gfxFx.lineStyle(2, 0x9ccc65, 1); this.gfxFx.lineBetween(cv.x, cv.y - 14, p.x, p.y);
      }
      if (p.style.boomerang) {
        if (!p.returning && p.travelled > p.range) p.returning = true;
        if (p.travelled > p.range * 3) { this.killProjectile(p); return false; }
        return true;
      }
      if (p.travelled > p.range) { this.killProjectile(p); return false; }
      return true;
    });
  },

  updateWaves(now) {
    this.waves = this.waves.filter((w) => {
      if (now < w.start) return true;
      const front = w.speed * (now - w.start) / 1000;
      if (front > w.length) return false;
      if (now - w.lastSpawn > (w.big ? 80 : 60)) {
        w.lastSpawn = now;
        const nx = -w.dir.y, ny = w.dir.x;
        const n = w.big ? 6 : w.width < 90 ? 2 : 4;
        for (let i = 0; i < n; i++) {
          const off = n === 1 ? 0 : (i / (n - 1) - 0.5) * w.width;
          const x = w.ox + w.dir.x * front + nx * off, y = w.oy + w.dir.y * front + ny * off;
          if (w.style === 'water') this.playFx(15, x, y - 20, w.big ? 6.5 : 4, null);
          else if (w.style === 'fire') { this.playFx(20, x, y - 20, 3.2, null); this.burst(x, y, 0xff9a3c, { count: 2, speedMax: 90 }); }
          else this.playFx(13, x, y - 20, 3.8, 0xffffff);
        }
      }
      return true;
    });
  },

  // ---------------------------------------------------------------- world drawing
  drawWorldFx(state, me, now) {
    const gg = this.gfxGround, gf = this.gfxFx, gz = this.gfxZone;
    if (state.eventId === 'frozen_lake') this.map.ponds.forEach((p) => { gg.fillStyle(0xe8f8ff, 0.55); gg.fillRect(p.x * 48 + 6, p.y * 48 + 6, p.w * 48 - 12, p.h * 48 - 12); gg.lineStyle(2, 0xffffff, 0.6); gg.strokeRect(p.x * 48 + 6, p.y * 48 + 6, p.w * 48 - 12, p.h * 48 - 12); });
    this.groundMarks = this.groundMarks.filter((m) => now - m.start < m.dur);
    this.groundMarks.forEach((m) => {
      const t = (now - m.start) / m.dur;
      gg.fillStyle(m.color, (1 - t) * (m.alpha || 0.45)); gg.fillEllipse(m.x, m.y, m.r * 2, m.r * 1.2);
      if (m.vines) { gg.lineStyle(3, 0x6fae3a, 1 - t); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; gg.lineBetween(m.x, m.y, m.x + Math.cos(a) * m.r * 0.9, m.y + Math.sin(a) * m.r * 0.5); } }
    });
    const tnow = Date.now();
    this.myTraps = this.myTraps.filter((k) => k.expiresAt > tnow);
    this.myTraps.forEach((k) => {
      const c = (defOf(k.id) || {}).color || 0x9ccc65;
      gg.lineStyle(2, c, 0.7); gg.strokeEllipse(k.x, k.y, 60, 30); gg.fillStyle(c, 0.25); gg.fillEllipse(k.x, k.y, 60, 30);
    });

    this.zones = this.zones.filter((z) => now < z.until);
    this.zones.forEach((z) => this.drawZone(z, now, gg, gf));

    this.telegraphs = this.telegraphs.filter((t) => now - t.start < t.dur);
    this.telegraphs.forEach((t) => {
      const k = (now - t.start) / t.dur;
      const pulse = 0.5 + 0.5 * Math.sin(k * Math.PI * 8);
      gg.fillStyle(t.color, 0.14 + pulse * 0.1); gg.fillEllipse(t.x, t.y, t.r * 2, t.r * 1.4);
      gg.lineStyle(4, t.color, 0.7 + pulse * 0.3); gg.strokeEllipse(t.x, t.y, t.r * 2, t.r * 1.4);
      if (t.inner) { gg.lineStyle(3, t.color, 0.5); gg.strokeEllipse(t.x, t.y, t.inner * 2, t.inner * 1.4); }
      gg.fillStyle(t.color, 0.3); gg.fillEllipse(t.x, t.y, t.r * 2 * k, t.r * 1.4 * k);
    });
    if (this.telegraphLine && now < this.telegraphLine.until) {
      const cv = this.views.get(this.telegraphLine.casterId);
      if (cv) { const d = this.telegraphLine.dir; gg.lineStyle(10, this.telegraphLine.color, 0.35 + 0.3 * Math.sin(now / 40)); gg.lineBetween(cv.x, cv.y, cv.x + d.x * 900, cv.y + d.y * 900); }
    }

    // supply drops: beacon + crate
    this.dropViews.forEach((dv) => {
      const falling = Date.now() < dv.landAt;
      if (falling) {
        const k = 1 - (dv.landAt - Date.now()) / 3000;
        gg.lineStyle(3, 0xffd166, 0.5 + 0.4 * Math.sin(now / 80)); gg.strokeEllipse(dv.x, dv.y, 70, 30);
        gg.fillStyle(0xffd166, 0.2 * k); gg.fillEllipse(dv.x, dv.y, 70 * k, 30 * k);
      } else {
        gf.fillStyle(0xffd166, 0.08 + 0.06 * Math.sin(now / 200)); gf.fillRect(dv.x - 8, dv.y - 420, 16, 400);
      }
    });

    this.auras = this.auras.filter((a) => now - a.start < a.dur);
    this.auras.forEach((a) => this.drawAura(a, now, gg, gf));

    // shrinking safe zone
    const cx = this.W / 2, cy = this.H / 2, r = state.safeRadius;
    gz.lineStyle(3000, 0x2a0010, 0.35); gz.strokeCircle(cx, cy, r + 1500);
    const pulse = 0.5 + 0.5 * Math.sin(now / 250);
    gz.lineStyle(10, 0xff3d3d, 0.25 + pulse * 0.2); gz.strokeCircle(cx, cy, r + 4);
    gz.lineStyle(3, 0xff7070, 0.9); gz.strokeCircle(cx, cy, r);
    const rot = now / 3000;
    gz.lineStyle(4, 0xffc4a0, 0.6);
    for (let i = 0; i < 36; i += 2) { gz.beginPath(); gz.arc(cx, cy, r - 6, rot + i / 36 * Math.PI * 2, rot + (i + 0.7) / 36 * Math.PI * 2); gz.strokePath(); }
  },

  drawZone(z, now, gg, gf) {
    if (z.followId) { const v = this.views.get(z.followId); if (v) { z.x = v.x; z.y = v.y; } }
    const life = clampNum((now - z.start) / 250, 0, 1) * clampNum((z.until - now) / 300, 0, 1);
    const c = ZONE_COLORS[z.zstyle] || 0xffffff;
    const rnd = (k = 1) => (Math.random() - 0.5) * z.r * 1.6 * k;
    switch (z.zstyle) {
      case 'bubble': {
        gg.fillStyle(c, 0.16 * life); gg.fillCircle(z.x, z.y, z.r);
        gf.lineStyle(4, c, 0.8 * life); gf.strokeCircle(z.x, z.y, z.r);
        for (let i = 0; i < 12; i++) {
          const a = i / 12 * Math.PI * 2, r1 = z.r - (i % 3 === 0 ? 26 : 14);
          gf.lineStyle(i % 3 === 0 ? 4 : 2, 0xdff4ff, 0.8 * life);
          gf.lineBetween(z.x + Math.cos(a) * r1, z.y + Math.sin(a) * r1, z.x + Math.cos(a) * (z.r - 4), z.y + Math.sin(a) * (z.r - 4));
        }
        const h1 = now / 2400, h2 = now / 300;
        gf.lineStyle(6, 0xdff4ff, 0.7 * life); gf.lineBetween(z.x, z.y, z.x + Math.cos(h1) * z.r * 0.5, z.y + Math.sin(h1) * z.r * 0.5);
        gf.lineStyle(3, 0xdff4ff, 0.7 * life); gf.lineBetween(z.x, z.y, z.x + Math.cos(h2) * z.r * 0.8, z.y + Math.sin(h2) * z.r * 0.8);
        break;
      }
      case 'rift': {
        gg.fillStyle(0x3a0a3a, 0.28 * life); gg.fillCircle(z.x, z.y, z.r);
        const pts = [];
        for (let i = 0; i <= 28; i++) { const a = i / 28 * Math.PI * 2; const rr = z.r + (Math.random() - 0.5) * 16; pts.push({ x: z.x + Math.cos(a) * rr, y: z.y + Math.sin(a) * rr }); }
        gf.lineStyle(4, 0xff5bd8, 0.9 * life); gf.strokePoints(pts, true);
        gf.lineStyle(2, 0x5bf0ff, 0.7 * life); gf.strokePoints(pts.map((p) => ({ x: p.x + 4, y: p.y - 3 })), true);
        for (let i = 0; i < 5; i++) { const w = z.r * (0.4 + Math.random() * 0.8); gf.fillStyle(Math.random() < 0.5 ? 0xff5bd8 : 0x5bf0ff, 0.25 * life); gf.fillRect(z.x - w / 2, z.y + rnd(), w, 3 + Math.random() * 5); }
        break;
      }
      case 'vortex': {
        gg.fillStyle(0x10202a, 0.25 * life); gg.fillCircle(z.x, z.y, z.r);
        for (let i = 0; i < 6; i++) {
          const ang = now / 140 + i * 1.047, rr = z.r * (1 - ((now / 900 + i * 0.17) % 1));
          gf.lineStyle(4, c, 0.7 * life); gf.beginPath(); gf.arc(z.x, z.y - 10, rr, ang, ang + 1.2); gf.strokePath();
        }
        if (Math.random() < 0.3) this.drawBolt(z.x + rnd(0.5), z.y + rnd(0.5), z.x + rnd(0.5), z.y + rnd(0.5), 0xfff27a);
        break;
      }
      default: {
        gg.fillStyle(c, (z.zstyle === 'smoke' ? 0.45 : 0.2) * life); gg.fillCircle(z.x, z.y, z.r);
        gg.lineStyle(3, c, 0.7 * life); gg.strokeCircle(z.x, z.y, z.r + Math.sin(now / 120) * 3);
        const chance = this.fxMul * 0.5;
        if (z.zstyle === 'fire' && Math.random() < chance) this.burst(z.x + rnd(0.9), z.y + rnd(0.6), 0xff7a3c, { count: 2, speedMin: 10, speedMax: 50, gravity: -160, life: 600, scale: 1.4 });
        if (z.zstyle === 'fire' && Math.random() < 0.08) this.playFx(20, z.x + rnd(0.7), z.y + rnd(0.5) - 16, 2.5, null, 4900);
        if (z.zstyle === 'ice' && Math.random() < chance) this.burst(z.x + rnd(0.9), z.y + rnd(0.6), 0xffffff, { count: 1, speedMin: 5, speedMax: 25, life: 800, scale: 1.1 });
        if (z.zstyle === 'shock' && Math.random() < 0.18) { const x = z.x + rnd(0.8), y = z.y + rnd(0.6); this.drawBolt(x - 20, y - 30, x + 20, y + 10, 0xfff27a); }
        if (z.zstyle === 'poison' && Math.random() < chance) this.burst(z.x + rnd(0.9), z.y + rnd(0.6), 0x9be25a, { count: 1, speedMin: 5, speedMax: 25, gravity: -80, life: 900, scale: 1.4 });
        if (z.zstyle === 'smoke' && Math.random() < chance) this.burst(z.x + rnd(0.8), z.y + rnd(0.6), 0xb0b0c0, { count: 1, speedMin: 5, speedMax: 25, gravity: -30, life: 1200, scale: 3, tex: 'glow' });
        if (z.zstyle === 'curse') { gf.lineStyle(2, c, 0.6 * life); for (let i = 0; i < 5; i++) { const a = now / 800 + i * 1.256; gf.strokeCircle(z.x + Math.cos(a) * z.r * 0.6, z.y + Math.sin(a) * z.r * 0.6, 8); } }
        if (z.zstyle === 'thorn') { gg.lineStyle(3, 0x3e7a22, 0.9 * life); for (let i = 0; i < 14; i++) { const a = i * 2.4, rr = (i % 4 + 1) / 5 * z.r; const x = z.x + Math.cos(a) * rr, y = z.y + Math.sin(a) * rr; gg.lineBetween(x - 6, y + 6, x, y - 10); gg.lineBetween(x + 6, y + 6, x, y - 10); } }
        if (z.zstyle === 'holy' && Math.random() < chance) this.burst(z.x + rnd(0.8), z.y + rnd(0.5), 0x9dffb0, { count: 1, speedMin: 10, speedMax: 30, gravity: -150, life: 700, scale: 1.2 });
      }
    }
  },

  drawAura(a, now, gg, gf) {
    const k = (now - a.start) / a.dur;
    const v = a.followId ? this.views.get(a.followId) : null;
    if (a.followId && !v) return;
    const x = v ? v.x : a.x, y = v ? v.y : a.y;
    switch (a.kind) {
      case 'bubble': {
        const r = a.big ? 58 : 44;
        gf.fillStyle(a.color, 0.16); gf.fillCircle(x, y - 22, r);
        gf.lineStyle(4, a.color, 0.85 - k * 0.3); gf.strokeCircle(x, y - 22, r + Math.sin(now / 90) * 3);
        gf.lineStyle(2, 0xffffff, 0.5); gf.beginPath(); gf.arc(x, y - 22, r - 8, -2.4, -1.6); gf.strokePath();
        break;
      }
      case 'heal':
        if (Math.random() < 0.5) this.burst(x + (Math.random() - 0.5) * 50, y - 10, a.color, { count: 1, speedMin: 10, speedMax: 30, life: 700, gravity: -180, scale: 1.3 });
        gg.lineStyle(3, a.color, 0.7); gg.strokeEllipse(x, y + 6, 84, 32);
        break;
      case 'rage':
        gg.fillStyle(a.color, 0.14 + 0.08 * Math.sin(now / 80)); gg.fillEllipse(x, y + 6, 80, 30);
        gg.lineStyle(3, a.color, 0.8); gg.strokeEllipse(x, y + 6, 70 + 6 * Math.sin(now / 70), 26);
        break;
      case 'haste':
        if (Math.random() < 0.6) this.burst(x + (Math.random() - 0.5) * 30, y - 10 + (Math.random() - 0.5) * 30, a.color, { count: 1, speedMin: 40, speedMax: 90, life: 250, scale: 0.9 });
        gg.lineStyle(2, a.color, 0.6); gg.strokeEllipse(x, y + 6, 60, 22);
        break;
      case 'phoenix':
        gg.lineStyle(3, 0xffa040, 0.5 + 0.3 * Math.sin(now / 90)); gg.strokeEllipse(x, y + 6, 76, 30);
        if (Math.random() < 0.3) this.burst(x + (Math.random() - 0.5) * 40, y - 20, 0xffa040, { count: 1, speedMin: 10, speedMax: 40, gravity: -120, life: 500, scale: 1.2 });
        break;
      case 'snap': {
        const rr = 120 * (1 - k) + 10;
        gf.lineStyle(3, 0xffffff, 0.9); gf.strokeCircle(x, y - 30, rr);
        gf.fillStyle(0xffffff, 0.15 + k * 0.5); gf.fillCircle(x, y - 30, 14 + k * 20);
        break;
      }
      case 'vortex': case 'portal': {
        const shrink = a.kind === 'vortex' ? 1 - k * 0.5 : 1;
        gg.fillStyle(0x1a0a2a, 0.4 + k * 0.25); gg.fillEllipse(x, y, a.r * 2 * shrink, a.r * 1.3 * shrink);
        for (let i = 0; i < 6; i++) {
          const ang = now / 140 + i * 1.047, rr = a.r * shrink * (1 - ((now / 900 + i * 0.17) % 1));
          gf.lineStyle(4, a.color, 0.85); gf.beginPath(); gf.arc(x, y, rr, ang, ang + 1.2); gf.strokePath();
        }
        gf.fillStyle(0x000000, 1); gf.fillCircle(x, y, 20 + k * 12); gf.lineStyle(4, a.color, 1); gf.strokeCircle(x, y, 22 + k * 12);
        break;
      }
      case 'storm':
        gg.lineStyle(4, a.color, 0.35 + 0.35 * Math.sin(now / 60)); gg.strokeEllipse(x, y, a.r * 2, a.r * 1.4);
        gf.fillStyle(0x10102a, 0.25 * k); gf.fillCircle(x, y, a.r);
        break;
      default: break;
    }
  },

  // DOM overlays: time stop, darkness, champion arrow
  drawScreenFx(state, me, now) {
    const ts = this.hud.timeStopFx;
    const stopping = this.timeStop && now < this.timeStop.until;
    if (stopping !== this._tsOn) {
      this._tsOn = stopping;
      ts.classList.toggle('show', !!stopping);
      if (stopping) ts.querySelector('.lbl').textContent = this.timeStop.id === this.myId ? '⏸️ أوقفت الزمن — تحرك واضرب!' : `⏸️ ${this.timeStop.name} أوقف الزمن`;
    }
    const cam = this.cameras.main, wv = cam.worldView;
    const toScreen = (wx, wy) => ({ x: (wx - wv.x) * cam.zoom, y: (wy - wv.y) * cam.zoom });
    const dark = this.visionLimited(state, me);
    const dk = this.hud.darkFx;
    if (dark !== this._darkOn) { this._darkOn = dark; dk.classList.toggle('show', dark); }
    if (dark) {
      const mv = this.views.get(this.myId);
      const s = mv ? toScreen(mv.x, mv.y - 20) : { x: this.scale.width / 2, y: this.scale.height / 2 };
      const r = 230 * cam.zoom;
      dk.style.background = `radial-gradient(circle at ${s.x}px ${s.y}px, rgba(0,0,10,0) ${r * 0.55}px, rgba(0,0,10,0.93) ${r}px)`;
    }
    const arrow = this.hud.champArrow;
    const champ = state.championId ? state.players.get(state.championId) : null;
    const hideArrow = () => { if (this._arrowOn) { arrow.classList.remove('show'); this._arrowOn = false; } };
    if (!champ || !champ.alive || champ.id === this.myId || !me || !me.alive || dark) { hideArrow(); return; }
    const cv = this.views.get(champ.id);
    const s = toScreen(cv ? cv.x : champ.x, cv ? cv.y : champ.y);
    const sw = this.scale.width, sh = this.scale.height;
    if ((s.x > 20 && s.x < sw - 20 && s.y > 40 && s.y < sh - 20) || champ.hidden) { hideArrow(); return; }
    const cx = sw / 2, cy = sh / 2, dx = s.x - cx, dy = s.y - cy;
    const k = Math.min((sw / 2 - 46) / Math.abs(dx || 1), (sh / 2 - 60) / Math.abs(dy || 1));
    arrow.style.left = `${cx + dx * k}px`; arrow.style.top = `${cy + dy * k}px`;
    arrow.querySelector('.ar').style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
    if (!this._arrowOn) { arrow.classList.add('show'); this._arrowOn = true; }
  },

  familyColor(def) { return (def && (def.color || (FAMILIES[def.family] || {}).color)) || 0xffffff; },
};
