// Simulation of live things: projectiles, delayed effects, traps, zones, summons.
import { PLAYER_RADIUS, STATUS_MS } from '../abilities.js';
import { MAP_W, MAP_H, resolveCircle, pointBlocked, propAt } from '../map.js';
import { dist, normalize } from './util.js';

export const simMixin = {
  processProjectiles(now, dt) {
    const props = this.liveProps();
    this.projectiles = this.projectiles.filter((pr) => {
      if (!pr.caster.alive && !pr.boomerang && pr.caster.kind !== 'summon') return false;
      if (this.timeStopped(pr.caster, now)) return true;
      if (pr.delayUntil && now < pr.delayUntil) { pr.x = pr.caster.x; pr.y = pr.caster.y - 10; return true; }
      let speed = pr.speed;
      for (const z of this.zones) {
        if (Math.hypot(pr.x - z.x, pr.y - z.y) > z.r || z.caster === pr.caster) continue;
        if (z.caster && pr.caster && !this.isEnemy(z.caster, pr.caster)) continue;
        if (z.slowProjectiles) speed *= z.slowProjectiles;
        else if (z.flipProjectiles && !pr.flipped) this.flipProjectile(pr, z.caster);
      }
      if (pr.homing) {
        const t = this.nearestEnemyTo(pr.caster, pr.x, pr.y, 99999);
        if (t && Math.hypot(t.x - pr.x, t.y - 10 - pr.y) < 520) {
          const want = Math.atan2(t.y - 10 - pr.y, t.x - pr.x), cur = Math.atan2(pr.dir.y, pr.dir.x);
          let da = Math.atan2(Math.sin(want - cur), Math.cos(want - cur));
          const maxTurn = pr.homing * dt; da = Math.max(-maxTurn, Math.min(maxTurn, da));
          pr.dir = { x: Math.cos(cur + da), y: Math.sin(cur + da) };
        }
      }
      if (pr.boomerang && pr.returning) {
        pr.dir = normalize(pr.caster.x - pr.x, pr.caster.y - 10 - pr.y);
        if (Math.hypot(pr.caster.x - pr.x, pr.caster.y - 10 - pr.y) < 30) return false;
      }
      const step = speed * dt;
      pr.x += pr.dir.x * step; pr.y += pr.dir.y * step; pr.travelled += step;
      if (pr.boomerang && !pr.returning && pr.travelled > pr.range) { pr.returning = true; pr.hit.clear(); }
      if (!pr.boomerang && (pr.travelled > pr.range || pr.x < 0 || pr.y < 0 || pr.x > MAP_W || pr.y > MAP_H)) return false;
      if (pr.boomerang && pr.travelled > pr.range * 3) return false;
      if (!pr.pierce) {
        if (pointBlocked(pr.x, pr.y, 2)) { this.broadcast('impact', { type: 'poof', pid: pr.pid, x: pr.x, y: pr.y }); return false; }
        const hitProp = propAt(pr.x, pr.y, props, pr.radius);
        if (hitProp) { this.damageProp(hitProp, pr.abilityId === 'strike' ? 12 : 30); this.broadcast('impact', { type: 'poof', pid: pr.pid, x: pr.x, y: pr.y }); return false; }
      }
      let consumed = false;
      const owner = pr.caster;
      this.forTargets((e) => {
        if (consumed || !e.alive || e === owner || !this.isEnemy(owner, e) || (pr.hit && pr.hit.has(e.id))) return;
        const rad = this.radiusOf(e);
        if (Math.hypot(e.x - pr.x, e.y - 10 - pr.y) < pr.radius + rad + 4) {
          if (this.has(e, 'reflect', now) && !pr.flipped) { this.flipProjectile(pr, e); consumed = false; return; }
          if (pr.hit) pr.hit.add(e.id); else consumed = true;
          const hpBefore = e.hp + e.shield;
          const alive = this.dealDamage(e, pr.damage, owner.kind === 'summon' ? owner.owner : owner, pr.abilityId);
          const realOwner = owner.kind === 'summon' ? owner.owner : owner;
          if (pr.lifesteal && realOwner.alive) this.heal(realOwner, Math.max(0, hpBefore - (e.hp + e.shield)) * pr.lifesteal);
          if (alive) {
            this.applyHitExtras(e, pr, realOwner);
            if (pr.knock) this.knock(e, pr.dir, pr.knock);
            if (pr.pull) { this.knock(e, normalize(realOwner.x - e.x, realOwner.y - e.y), pr.pull * 1.4); this.applyStatus(e, 'root', realOwner, pr.rootMs); }
          }
          if (pr.splash) this.areaHit(pr.x, pr.y, pr.splash, realOwner, (o) => { if (o !== e) this.dealDamage(o, pr.damage * 0.4, realOwner, 'combo'); });
          this.broadcast('impact', { type: pr.abilityId, pid: consumed ? pr.pid : 0, x: e.x, y: e.y - 10 });
        }
      });
      return !consumed;
    });
  },

  flipProjectile(pr, newOwner) {
    pr.flipped = true; pr.dir = { x: -pr.dir.x, y: -pr.dir.y }; pr.caster = newOwner; pr.travelled = 0; pr.homing = 0;
    if (pr.hit) pr.hit.clear();
    this.broadcast('flip', { pid: pr.pid, x: pr.x, y: pr.y, abilityId: pr.abilityId, dx: pr.dir.x, dy: pr.dir.y });
  },

  processTraps(now) {
    this.traps = this.traps.filter((t) => {
      if (now > t.expiresAt) return false;
      let fired = false;
      this.forTargets((e) => {
        if (fired || !e.alive || !this.isEnemy(t.caster, e)) return;
        if (Math.hypot(e.x - t.x, e.y - t.y) < t.a.radius) {
          fired = true;
          const a = t.a;
          const hitOne = (o) => { if (this.dealDamage(o, a.damage, t.caster, t.id)) this.applyHitExtras(o, a, t.caster); };
          if (a.explodeR) this.areaHit(t.x, t.y, a.explodeR, t.caster, hitOne); else hitOne(e);
          this.broadcast('impact', { type: t.id === 'trap' ? 'trap' : t.id, id: t.id, x: t.x, y: t.y, radius: a.explodeR || a.radius });
        }
      });
      return !fired;
    });
  },

  resolveStrike(fx, now) {
    const a = fx.a;
    const c = fx.caster && fx.caster.alive ? fx.caster : fx.caster;
    this.areaHit(fx.x, fx.y, fx.r, c, (e) => {
      if (fx.inner && Math.hypot(e.x - fx.x, e.y - fx.y) < fx.inner) return;
      if (!this.dealDamage(e, a.damage, c, fx.id)) return;
      if (a.knock) this.knock(e, normalize(e.x - fx.x, e.y - fx.y), a.knock);
      if (a.pull) this.knock(e, normalize(fx.x - e.x, fx.y - e.y), 180);
      this.applyHitExtras(e, a, c);
    });
    this.broadcast('impact', { type: a.impact || fx.id, id: fx.id, x: fx.x, y: fx.y, radius: fx.r });
  },

  processEffects(now, dtMs) {
    const dt = dtMs / 1000;
    this.effects = this.effects.filter((fx) => {
      if (fx.caster && !fx.caster.alive && fx.type !== 'strike') return false;
      if (fx.caster && this.timeStopped(fx.caster, now)) { fx.at += dtMs; return true; }
      if (now < fx.at && fx.type !== 'blackhole') return true;
      const a = fx.a;
      switch (fx.type) {
        case 'strike': this.resolveStrike(fx, now); return false;
        case 'wave': {
          const front = a.speed * (now - fx.at) / 1000;
          const nx = -fx.dir.y, ny = fx.dir.x;
          this.forTargets((e) => {
            if (!e.alive || !this.isEnemy(fx.caster, e) || fx.hit.has(e.id)) return;
            const s = (e.x - fx.ox) * fx.dir.x + (e.y - fx.oy) * fx.dir.y;
            const lat = Math.abs((e.x - fx.ox) * nx + (e.y - fx.oy) * ny);
            if (s > 0 && Math.abs(s - front) < Math.max(44, a.speed * dt) && lat < a.width / 2) {
              fx.hit.add(e.id);
              if (this.dealDamage(e, a.damage, fx.caster, fx.id)) { this.knock(e, fx.dir, a.knock); this.applyStatus(e, a.applies, fx.caster); }
            }
          });
          return front < a.length;
        }
        case 'cone': {
          const c = fx.caster;
          const base = Math.atan2(fx.dir.y, fx.dir.x);
          this.forTargets((e) => {
            if (!e.alive || !this.isEnemy(c, e)) return;
            let da = Math.atan2(e.y - c.y, e.x - c.x) - base;
            da = Math.atan2(Math.sin(da), Math.cos(da));
            if (dist(e, c) < a.radius && Math.abs(da) < a.arc) {
              if (this.dealDamage(e, a.damage, c, fx.id)) { this.applyStatus(e, a.applies, c); if (a.knock) this.knock(e, normalize(e.x - c.x, e.y - c.y), a.knock); }
            }
          });
          this.broadcast('impact', { type: 'cone', id: fx.id, x: c.x, y: c.y, dx: fx.dir.x, dy: fx.dir.y, radius: a.radius, arc: a.arc });
          fx.ticksLeft -= 1; fx.at = now + (a.tickMs || 0);
          return fx.ticksLeft > 0;
        }
        case 'blackhole':
          if (now < fx.at) {
            this.forTargets((e) => {
              if (!e.alive || !this.isEnemy(fx.caster, e) || e.invulnUntil > now || e.kind === 'boss') return;
              const d = Math.hypot(e.x - fx.x, e.y - fx.y);
              if (d < a.pullRadius && d > 8) { const n = normalize(fx.x - e.x, fx.y - e.y); e.x += n.x * 190 * dt; e.y += n.y * 190 * dt; }
            });
            return true;
          }
          this.areaHit(fx.x, fx.y, a.radius, fx.caster, (e) => this.dealDamage(e, a.damage, fx.caster, 'black_hole'));
          this.broadcast('impact', { type: 'blackhole', x: fx.x, y: fx.y, radius: a.radius });
          return false;
        case 'storm': {
          const c = fx.caster;
          const points = [];
          this.enemiesNear(c, c.x, c.y, a.radius).forEach((e) => {
            points.push({ x: e.x, y: e.y });
            if (this.dealDamage(e, a.damage, c, 'thunderstorm')) this.applyStatus(e, 'shock', c);
          });
          this.broadcast('bolts', { x: c.x, y: c.y, points, radius: a.radius });
          return false;
        }
        case 'hop': {
          const c = fx.caster, t = fx.target;
          if (!t.alive) return false;
          const n = normalize(t.x - c.x, t.y - c.y);
          c.x = t.x + n.x * 30; c.y = t.y + n.y * 30;
          resolveCircle(c, PLAYER_RADIUS, this.liveProps());
          this.broadcast('hop', { casterId: c.id, x: c.x, y: c.y, tx: t.x, ty: t.y });
          this.dealDamage(t, a.damage, c, 'shadow_strike');
          return false;
        }
        case 'snap': {
          const c = fx.caster;
          const points = [];
          this.state.players.forEach((e) => {
            if (!e.alive || !this.isEnemy(c, e)) return;
            points.push({ x: e.x, y: e.y });
            this.dealDamage(e, Math.max(a.min, e.hp * (e.kind === 'boss' ? 0.12 : a.fraction)), c, 'snap');
          });
          this.broadcast('snap', { x: c.x, y: c.y, points });
          return false;
        }
        default: return false;
      }
    });
  },

  // every tick: follow, slow, invert, pull, stealth
  tickZonesContinuous(now, dt) {
    this.zones = this.zones.filter((z) => {
      if (now >= z.until) {
        if (z.finalBurst && z.caster) {
          const b = z.finalBurst;
          this.areaHit(z.x, z.y, b.radius, z.caster, (e) => { if (this.dealDamage(e, b.damage, z.caster, z.id)) { if (b.knock) this.knock(e, normalize(e.x - z.x, e.y - z.y), b.knock); this.applyStatus(e, z.applies, z.caster); } });
          this.broadcast('impact', { type: 'volcano', id: z.id, x: z.x, y: z.y, radius: b.radius });
        }
        this.broadcast('zoneEnd', { zid: z.zid });
        return false;
      }
      if (z.follow && z.caster) {
        if (!z.caster.alive) return false;
        z.x = z.caster.x; z.y = z.caster.y;
      }
      if (z.stealthOwner && z.caster && z.caster.alive && Math.hypot(z.caster.x - z.x, z.caster.y - z.y) < z.r) z.caster._st.stealth = Math.max(z.caster._st.stealth || 0, now + 300);
      if (z.slow || z.invert || z.pull) {
        this.forTargets((e) => {
          if (!e.alive || (z.caster && !this.isEnemy(z.caster, e))) return;
          const d = Math.hypot(e.x - z.x, e.y - z.y);
          if (d > z.r) return;
          if (z.slow && e.kind !== 'boss') e._st.slowtime = now + STATUS_MS.slowtime;
          if (z.invert && e.kind !== 'boss') e._st.inverted = now + STATUS_MS.inverted;
          if (z.pull && d > 20 && e.kind !== 'boss' && e.invulnUntil <= now) { const n = normalize(z.x - e.x, z.y - e.y); e.x += n.x * z.pull * dt; e.y += n.y * z.pull * dt; }
        });
      }
      return true;
    });
  },

  tickZonesDamage(now) {
    this.zones.forEach((z) => {
      if (now < z.nextTick) return;
      z.nextTick = now + z.tickMs;
      if (z.healOwner && z.caster && z.caster.alive) this.heal(z.caster, z.healOwner);
      if (!z.damage && !z.applies && !z.mark) return;
      this.forTargets((e) => {
        if (!e.alive || (z.caster && !this.isEnemy(z.caster, e))) return;
        if (Math.hypot(e.x - z.x, e.y - z.y) > z.r + PLAYER_RADIUS) return;
        const alive = z.damage ? this.dealDamage(e, z.damage, z.caster, 'zone') : true;
        if (!alive) return;
        if (z.applies && Math.random() < z.applyChance) this.applyStatus(e, z.applies, z.caster, z.applies === 'root' ? 700 : undefined);
        if (z.mark && !this.has(e, 'mark', now)) this.applyStatus(e, 'mark', z.caster);
      });
    });
  },

  processSummons(now) {
    this.summons = this.summons.filter((s) => {
      if (now >= s.until || !s.owner.alive) { this.broadcast('summonEnd', { sid: s.sid }); return false; }
      if (this.timeStopped(s.owner, now) || now < s.nextFire) return true;
      const shooter = { kind: 'summon', owner: s.owner, alive: true, x: s.x, y: s.y, team: s.owner.team, id: s.owner.id };
      const t = this.nearestEnemyTo(s.owner, s.x, s.y, 99999);
      if (!t || Math.hypot(t.x - s.x, t.y - s.y) > s.a.targetRange) return true;
      s.nextFire = now + s.a.fireMs;
      const dir = normalize(t.x - s.x, t.y - 10 - (s.y - 24));
      const pids = this.spawnProjectiles(shooter, 'turret_shot', s.a.shot, s.x, s.y - 24, dir, now);
      this.broadcast('cast', { casterId: s.owner.id, abilityId: 'turret_shot', x: s.x, y: s.y - 14, tx: t.x, ty: t.y, pids, noPose: true });
      return true;
    });
  },
};
