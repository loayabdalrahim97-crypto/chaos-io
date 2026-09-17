// Casting: turns an ability definition (kind + params) into projectiles, strikes, zones, etc.
import { PLAYER_RADIUS, STATUS_MS } from '../abilities.js';
import { MAP_W, MAP_H, resolveCircle, pointBlocked } from '../map.js';
import { dist, clamp, rand, normalize } from './util.js';

export const castMixin = {
  spawnProjectiles(p, id, a, ox, oy, dir, now, extra = {}) {
    const n = a.count || 1;
    const base = Math.atan2(dir.y, dir.x);
    const full = (a.spread || 0) >= 6.2;
    const pids = [];
    for (let i = 0; i < n; i++) {
      const ang = n === 1 ? base : full ? base + i * (Math.PI * 2 / n) : base + (i - (n - 1) / 2) * ((a.spread || 0) / (n - 1));
      const pid = this.nextPid++;
      pids.push(pid);
      this.projectiles.push({
        pid, x: ox, y: oy, dir: { x: Math.cos(ang), y: Math.sin(ang) }, travelled: 0, caster: p, abilityId: id,
        speed: a.speed, damage: a.damage, radius: a.radius, range: a.range, applies: a.applies,
        pierce: !!a.pierce, hit: a.pierce ? new Set() : null, splash: a.splash, knock: a.knock, pull: a.pull, rootMs: a.rootMs,
        boomerang: !!a.boomerang, returning: false, homing: a.homing, lifesteal: a.lifesteal,
        stunMs: a.stunMs, silenceMs: a.silenceMs, weakMs: a.weakMs, delayUntil: a.delay ? now + a.delay : 0, ...extra,
      });
    }
    return pids;
  },

  // strike points for count/line/rings shapes
  strikePoints(p, a, tx, ty, dir) {
    const pts = [];
    const n = a.count || 1;
    if (a.at === 'line') {
      const step = (a.range || 400) / n;
      for (let i = 0; i < n; i++) pts.push({ x: p.x + dir.x * step * (i + 1), y: p.y + dir.y * step * (i + 1), r: a.radius, delay: (a.telegraph || 0) + i * (a.stagger || 0) });
    } else if (a.at === 'rings') {
      for (let i = 0; i < n; i++) pts.push({ x: p.x, y: p.y, r: a.ringStep * (i + 1), inner: a.ringStep * i, delay: (a.telegraph || 0) + i * (a.stagger || 0) });
    } else {
      const cx = a.at === 'self' ? p.x : a.at === 'front' ? p.x + dir.x * (a.reach || 60) : tx;
      const cy = a.at === 'self' ? p.y : a.at === 'front' ? p.y + dir.y * (a.reach || 60) : ty;
      for (let i = 0; i < n; i++) {
        const ang = Math.random() * Math.PI * 2, r = i === 0 || !a.spread ? 0 : rand(30, a.spread);
        pts.push({ x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r, r: a.radius, delay: (a.telegraph || 0) + i * (a.stagger || 0) });
      }
    }
    return pts.map((q) => ({ ...q, x: clamp(q.x, 0, MAP_W), y: clamp(q.y, 0, MAP_H) }));
  },

  addZone(p, id, a, x, y, now, over = {}) {
    const z = {
      zid: this.nextZid++, id, x, y, r: a.radius, until: now + a.duration, caster: p, follow: !!a.follow,
      tickMs: a.tickMs || 500, nextTick: now + 150, damage: a.damage || 0, applies: a.applies, applyChance: a.applyChance ?? 1,
      slow: !!a.slow, invert: !!a.invert, pull: a.pull || 0, slowProjectiles: a.slowProjectiles, flipProjectiles: !!a.flipProjectiles,
      stealthOwner: !!a.stealthOwner, healOwner: a.healOwner || 0, mark: !!a.mark, finalBurst: a.finalBurst, zstyle: a.zstyle, ...over,
    };
    this.zones.push(z);
    this.broadcast('zone', { zid: z.zid, id, ownerId: p ? p.id : '', followId: z.follow && p ? p.id : '', x: z.x, y: z.y, r: z.r, ms: a.duration, zstyle: z.zstyle });
    return z;
  },

  applyHitExtras(e, src, caster) {
    if (src.applies) this.applyStatus(e, src.applies, caster, src.statusMs);
    if (src.stunMs && e.kind !== 'boss') e._st.stun = Math.max(e._st.stun || 0, Date.now() + src.stunMs);
    if (src.silenceMs) this.applyStatus(e, 'silence', caster, src.silenceMs);
    if (src.weakMs) this.applyStatus(e, 'weak', caster, src.weakMs);
    if (src.rootMs && !src.pull) this.applyStatus(e, 'root', caster, src.rootMs);
  },

  performCast(p, id, a, tx, ty, now) {
    const dir = normalize(tx - p.x, ty - p.y);
    switch (a.kind) {
      case 'proj': {
        const pids = this.spawnProjectiles(p, id, a, p.x, p.y - 10, dir, now);
        return { pids };
      }
      case 'strike': {
        const pts = this.strikePoints(p, a, tx, ty, dir);
        pts.forEach((q) => this.effects.push({ type: 'strike', id, x: q.x, y: q.y, r: q.r, inner: q.inner || 0, caster: p, at: now + q.delay, a }));
        this.broadcast('strikes', { id, casterId: p.id, points: pts.map((q) => ({ x: Math.round(q.x), y: Math.round(q.y), r: q.r, inner: q.inner || 0, delay: q.delay })) });
        return { tx: pts[0].x, ty: pts[0].y };
      }
      case 'wave':
        this.effects.push({ type: 'wave', id, ox: p.x, oy: p.y, dir, caster: p, at: now + (a.telegraph || 0), a, hit: new Set() });
        return null;
      case 'cone':
        this.effects.push({ type: 'cone', id, caster: p, dir, at: now, ticksLeft: a.ticks, a });
        return null;
      case 'dash': return this.castDash(p, id, a, tx, ty, dir, now);
      case 'buff': return this.castBuff(p, id, a, now);
      case 'zone': {
        const x = a.at === 'self' ? p.x : tx, y = a.at === 'self' ? p.y : ty;
        this.addZone(p, id, a, x, y, now);
        if (a.hasteMs) { p._speedUntil = now + a.hasteMs; p._speedMult = a.hasteMult; p._st.haste = now + a.hasteMs; }
        if (a.stealthOwner) p._st.stealth = now + a.duration;
        return { tx: x, ty: y };
      }
      case 'chain': {
        let cur = this.nearestEnemyTo(p, tx, ty, a.range);
        if (!cur) return null;
        const points = [{ x: p.x, y: p.y - 20 }];
        const hit = new Set();
        for (let i = 0; i < a.bounces && cur; i++) {
          hit.add(cur.id);
          points.push({ x: cur.x, y: cur.y - 20 });
          const target = cur;
          if (this.dealDamage(target, a.damage, p, id)) this.applyStatus(target, a.applies, p);
          let next = null, nd = a.bounceRange;
          this.forTargets((e) => { if (e.alive && this.isEnemy(p, e) && !hit.has(e.id)) { const d = dist(e, target); if (d < nd) { nd = d; next = e; } } });
          cur = next;
        }
        this.broadcast('chain', { id, points });
        return { tx: points[1].x, ty: points[1].y };
      }
      case 'hop': {
        const targets = this.enemiesNear(p, p.x, p.y, a.radius).sort((m, n) => dist(m, p) - dist(n, p)).slice(0, a.targets);
        p.invulnUntil = Math.max(p.invulnUntil, now + targets.length * a.hopMs + 350);
        targets.forEach((t, i) => this.effects.push({ type: 'hop', id, caster: p, target: t, at: now + i * a.hopMs, a }));
        return { tx: p.x, ty: p.y };
      }
      case 'trap': {
        let x = tx, y = ty;
        const d = Math.hypot(tx - p.x, ty - p.y);
        if (d > a.range) { x = p.x + dir.x * a.range; y = p.y + dir.y * a.range; }
        if (pointBlocked(x, y, 10)) { x = p.x; y = p.y; }
        this.traps.push({ id, x, y, caster: p, expiresAt: now + a.lifetime, a });
        const c = this.clients.find((cl) => cl.sessionId === p.id);
        if (c) c.send('trapPlaced', { id, x, y, expiresAt: now + a.lifetime });
        if (p.team) this.clients.forEach((cl) => { const mate = this.state.players.get(cl.sessionId); if (mate && mate !== p && mate.team === p.team) cl.send('trapPlaced', { id, x, y, expiresAt: now + a.lifetime }); });
        return { tx: x, ty: y };
      }
      case 'summon': {
        let x = tx, y = ty;
        const d = Math.hypot(tx - p.x, ty - p.y);
        if (d > a.range) { x = p.x + dir.x * a.range; y = p.y + dir.y * a.range; }
        if (pointBlocked(x, y, 16)) { x = p.x; y = p.y; }
        const sid = this.nextZid++;
        this.summons.push({ sid, id, x, y, owner: p, until: now + a.duration, nextFire: now + 400, a });
        this.broadcast('summon', { sid, id, ownerId: p.id, x, y, ms: a.duration });
        return { tx: x, ty: y };
      }
      case 'special': return this.castSpecial(p, id, a, tx, ty, dir, now);
      default: return null;
    }
  },

  castDash(p, id, a, tx, ty, dir, now) {
    const ox = p.x, oy = p.y;
    if (a.startNova) this.areaHit(ox, oy, a.startNova.radius, p, (e) => { if (this.dealDamage(e, a.startNova.damage, p, id)) this.applyStatus(e, a.startNova.applies, p); });
    let target = null;
    if (a.behindTarget) {
      target = this.nearestEnemyTo(p, tx, ty, a.range);
      if (target) {
        const n = normalize(target.x - p.x, target.y - p.y);
        const bx = target.x + n.x * 40, by = target.y + n.y * 40;
        if (!pointBlocked(bx, by, PLAYER_RADIUS)) { p.x = bx; p.y = by; } else { p.x = target.x - n.x * 40; p.y = target.y - n.y * 40; }
      }
    }
    if (!target) {
      const d = a.blink ? Math.min(a.range, Math.hypot(tx - p.x, ty - p.y) || a.range) : a.range;
      if (a.blink) {
        let bx = p.x + dir.x * d, by = p.y + dir.y * d;
        for (let i = 0; i < 10 && pointBlocked(bx, by, PLAYER_RADIUS); i++) { bx -= dir.x * d / 10; by -= dir.y * d / 10; }
        p.x = clamp(bx, 20, MAP_W - 20); p.y = clamp(by, 20, MAP_H - 20);
      } else {
        for (let i = 0; i < 12; i++) {
          const nx = p.x + dir.x * d / 12, ny = p.y + dir.y * d / 12;
          if (pointBlocked(nx, ny, PLAYER_RADIUS)) break;
          p.x = nx; p.y = ny;
        }
      }
    }
    resolveCircle(p, PLAYER_RADIUS, this.liveProps());
    p.invulnUntil = Math.max(p.invulnUntil, now + 350);
    if (a.empower) { p._empowerUntil = now + 2500; p._st.empower = now + 2500; }
    if (a.damage) {
      const hitOne = (e) => { if (this.dealDamage(e, a.damage, p, id)) this.applyHitExtras(e, a, p); };
      if (target) hitOne(target);
      else {
        const sx = p.x - ox, sy = p.y - oy, len2 = sx * sx + sy * sy || 1;
        this.forTargets((e) => {
          if (!e.alive || !this.isEnemy(p, e)) return;
          const t = clamp(((e.x - ox) * sx + (e.y - oy) * sy) / len2, 0, 1);
          if (Math.hypot(e.x - (ox + sx * t), e.y - (oy + sy * t)) < 44) hitOne(e);
        });
      }
    }
    if (a.trail) {
      for (let i = 1; i <= 3; i++) {
        const fx = ox + (p.x - ox) * i / 3, fy = oy + (p.y - oy) * i / 3;
        this.addZone(p, id, { radius: 55, duration: 2500, tickMs: 500, damage: 3, applies: 'burn', zstyle: 'fire' }, fx, fy, now);
      }
    }
    return { tx: p.x, ty: p.y };
  },

  castBuff(p, id, a, now) {
    if (a.invulnMs) p.invulnUntil = Math.max(p.invulnUntil, now + a.invulnMs);
    if (a.cleanse) ['burn', 'chill', 'wet', 'root', 'stun', 'mark', 'shock', 'poison', 'inverted', 'weak', 'silence', 'slowtime'].forEach((s) => { p._st[s] = 0; });
    if (a.heal) this.heal(p, a.heal);
    if (a.hot) { p._healUntil = now + a.hotMs; p._healRate = a.hot / (a.hotMs / 1000); }
    if (a.berserkMs) p._st.berserk = now + a.berserkMs;
    if (a.hasteMs) { p._speedUntil = now + a.hasteMs; p._speedMult = a.hasteMult; p._st.haste = now + a.hasteMs; }
    if (a.shieldAdd) p.shield = Math.min(p.maxShield + a.shieldAdd, p.shield + a.shieldAdd);
    if (a.reflectMs) p._st.reflect = now + a.reflectMs;
    if (a.phoenixMs) p._st.phoenix = now + a.phoenixMs;
    if (a.lifestealMs) p._st.lifesteal = now + a.lifestealMs;
    if (a.dmgBuffMs) { p._dmgBuffUntil = now + a.dmgBuffMs; p._dmgBuffMult = a.dmgBuffMult; p._st.berserk = Math.max(p._st.berserk || 0, now + a.dmgBuffMs); }
    if (a.nova) {
      this.areaHit(p.x, p.y, a.nova.radius, p, (e) => { if (this.dealDamage(e, a.nova.damage, p, id)) this.applyStatus(e, a.nova.applies, p); });
      this.broadcast('impact', { type: id, id, x: p.x, y: p.y, radius: a.nova.radius });
    }
    return { tx: p.x, ty: p.y };
  },

  castSpecial(p, id, a, tx, ty, dir, now) {
    switch (id) {
      case 'black_hole':
        this.effects.push({ type: 'blackhole', id, x: tx, y: ty, caster: p, at: now + a.telegraph, a });
        return null;
      case 'thunderstorm':
        this.effects.push({ type: 'storm', id, caster: p, at: now + a.telegraph, a });
        return { tx: p.x, ty: p.y };
      case 'time_rewind': {
        const cutoff = now - a.seconds * 1000;
        const snap = p._hist.find((h) => h.t >= cutoff) || p._hist[0];
        if (!snap) return null;
        const path = p._hist.filter((h) => h.t >= snap.t).filter((_, i) => i % 3 === 0).map((h) => ({ x: Math.round(h.x), y: Math.round(h.y) })).reverse();
        p.x = snap.x; p.y = snap.y;
        p.hp = Math.max(p.hp, snap.hp); p.shield = Math.max(p.shield, snap.shield);
        ['burn', 'chill', 'wet', 'root', 'stun', 'mark', 'shock', 'poison', 'inverted', 'slowtime', 'weak', 'silence'].forEach((s) => { p._st[s] = 0; });
        p.invulnUntil = Math.max(p.invulnUntil, now + 450);
        p._kbx = 0; p._kby = 0;
        this.broadcast('rewind', { id: p.id, path });
        return { tx: p.x, ty: p.y };
      }
      case 'reality_swap': {
        const t = this.nearestEnemyTo(p, tx, ty, a.range, true);
        if (!t) return null;
        const ax = p.x, ay = p.y;
        p.x = t.x; p.y = t.y; t.x = ax; t.y = ay;
        const pr = p.hp / this.maxHpOf(p), trr = t.hp / this.maxHpOf(t);
        if (trr > pr && t.invulnUntil <= now && t.kind !== 'boss') { p.hp = trr * this.maxHpOf(p); t.hp = Math.max(1, pr * this.maxHpOf(t)); }
        if (t.kind !== 'boss') t._st.stun = now + 700;
        resolveCircle(p, PLAYER_RADIUS, this.liveProps()); resolveCircle(t, PLAYER_RADIUS, this.liveProps());
        this.broadcast('swap', { aId: p.id, bId: t.id, ax: p.x, ay: p.y, bx: t.x, by: t.y });
        return { tx: t.x, ty: t.y };
      }
      case 'time_stop':
        this.state.timeStopBy = p.id; this.state.timeStopUntil = now + a.duration;
        this.forTargets((e) => { if (e !== p && e.alive && this.isEnemy(p, e)) e._st.timestop = now + a.duration; });
        this.broadcast('timeStop', { id: p.id, name: p.name, ms: a.duration });
        return { tx: p.x, ty: p.y };
      case 'reality_warp':
        this.enemiesNear(p, p.x, p.y, a.radius, true).forEach((e) => { if (e.invulnUntil <= now && e.kind !== 'boss') e._st.polymorph = now + a.duration; });
        this.broadcast('impact', { type: 'warp', x: p.x, y: p.y, radius: a.radius });
        return { tx: p.x, ty: p.y };
      case 'destiny_snap':
        this.effects.push({ type: 'snap', id, caster: p, at: now + a.telegraph, a });
        return { tx: p.x, ty: p.y };
      case 'space_portal': {
        const ox = p.x, oy = p.y;
        const d = Math.min(a.range, Math.hypot(tx - p.x, ty - p.y));
        p.x = clamp(p.x + dir.x * d, 20, MAP_W - 20); p.y = clamp(p.y + dir.y * d, 20, MAP_H - 20);
        resolveCircle(p, PLAYER_RADIUS, this.liveProps());
        p.invulnUntil = Math.max(p.invulnUntil, now + 400);
        [[ox, oy], [p.x, p.y]].forEach(([x, y]) => {
          this.areaHit(x, y, a.radius, p, (e) => { if (this.dealDamage(e, a.damage, p, id)) this.knock(e, normalize(e.x - x, e.y - y), 160); });
          this.broadcast('impact', { type: 'portal', x, y, radius: a.radius });
        });
        return { tx: p.x, ty: p.y };
      }
      default: return null;
    }
  },

  castCurse(p) {
    const now = Date.now();
    let t = this.state.players.get(p._killerId);
    if (!t || !t.alive || t.kind === 'boss' || Math.hypot(t.x - p.x, t.y - p.y) > 380) {
      t = null; let bd = 380;
      this.state.players.forEach((e) => { if (e.alive && e.kind !== 'boss' && this.isEnemy(p, e)) { const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < bd) { bd = d; t = e; } } });
    }
    if (!t) return;
    p.curseReady = false;
    this.dealDamage(t, 10, null, 'curse');
    if (t.alive) { this.applyStatus(t, 'root', null, 1200); this.applyStatus(t, 'weak', null, 3000); }
    this.broadcast('curse', { fromId: p.id, x: p.x, y: p.y, targetId: t.id, tx: t.x, ty: t.y, name: p.name, targetName: t.name });
  },
};

export { STATUS_MS };
