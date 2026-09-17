// Character Domains: the whole battlefield temporarily becomes the activating hero's world.
// Global, server-authoritative, and strictly ONE domain at a time
// (state.activeDomainPlayer / activeDomainType / activeDomainEndTime).
import { DOMAIN, DOMAINS } from '../army.js';
import { MAP_W, MAP_H, randomOpenPoint, pointBlocked, inWater } from '../map.js';
import { dist, pick, normalize, clamp } from './util.js';

export const domainMixin = {
  activeDomain() {
    const id = this.state.activeDomainPlayer;
    if (!id) return null;
    if (this._dom && this._dom.owner.id === id) return this._dom;
    return null;
  },
  domainOwnerOf(e) { const d = this.activeDomain(); return d ? d.owner : null; },
  isDomainOwner(p) { const d = this.activeDomain(); return !!d && d.owner === p; },

  canActivateDomain(p, now) {
    if (!p || !p.alive || p.kind || this.state.phase !== 'playing') return false;
    if (this.state.activeDomainPlayer) return false;           // one domain at a time
    if (now < this.state.matchReadyAt) return false;
    if ((p.cooldowns.get('domain') || 0) > now) return false;
    if (['stun', 'airborne', 'timestop', 'polymorph', 'silence'].some((s) => this.has(p, s, now))) return false;
    return !!DOMAINS[p.hero];
  },

  tryDomain(p) {
    const now = Date.now();
    if (!this.canActivateDomain(p, now)) return false;
    const def = DOMAINS[p.hero];
    const end = now + DOMAIN.duration;
    this.state.activeDomainPlayer = p.id;
    this.state.activeDomainType = def.id;
    this.state.activeDomainEndTime = end;
    this._dom = { owner: p, def, start: now, nextPulse: now + 400, nextHazard: now + 600, current: Math.random() * Math.PI * 2 };
    p.cooldowns.set('domain', end + DOMAIN.cooldown);
    // a domain overrides any running world event
    if (this.state.eventId) { this.state.eventUntil = now; this.tickWorldEvent(now); }
    this.nextEventAt = Math.max(this.nextEventAt, end + 15000);
    if (def.portals) {
      const pts = [];
      for (let i = 0; i < def.portals * 2; i++) pts.push(randomOpenPoint(Math.random, MAP_W / 2, MAP_H / 2, Math.min(this.state.safeRadius * 0.8, 620)));
      this._dom.portals = pts;
      this.state.portals = pts.map((q) => `${Math.round(q.x)}:${Math.round(q.y)}`).join(';');
    }
    this.broadcast('domain', { id: p.id, name: p.name, hero: p.hero, type: def.id, ms: DOMAIN.duration, x: Math.round(p.x), y: Math.round(p.y) });
    return true;
  },

  endDomain(reason) {
    if (!this.state.activeDomainPlayer) return;
    const id = this.state.activeDomainPlayer, type = this.state.activeDomainType;
    this.state.activeDomainPlayer = ''; this.state.activeDomainType = ''; this.state.activeDomainEndTime = 0; this.state.portals = '';
    this._dom = null;
    this.broadcast('domainEnd', { id, type, reason: reason || 'time' });
  },

  // domain-driven modifiers used by the core simulation
  domainSpeedMult(e) {
    const d = this.activeDomain();
    if (!d || e === d.owner) return 1;
    return this.isEnemy(d.owner, e) ? d.def.enemySlow || 1 : 1;
  },
  pondsFrozen() { return this.state.eventId === 'frozen_lake' || (this.activeDomain() || { def: {} }).def.frozenPonds; },

  tickDomain(now, dt) {
    const d = this.activeDomain();
    if (!d) { if (this.state.activeDomainPlayer) this.endDomain('lost'); return; }
    const o = d.owner, def = d.def;
    if (now >= this.state.activeDomainEndTime) { this.endDomain('time'); return; }
    if (!o.alive || !this.state.players.has(o.id)) { this.endDomain('owner'); return; }

    const enemyHeroes = this.fighters().filter((e) => e.alive && this.isEnemy(o, e));
    if (def.ownerShieldRegen) o.shield = Math.min(o.maxShield, o.shield + def.ownerShieldRegen * dt);

    // continuous world mechanics
    if (def.flood || def.voidPull || def.noWater) {
      if (def.flood) d.current += dt * 0.25;
      const cur = { x: Math.cos(d.current), y: Math.sin(d.current) };
      this.forTargets((e) => {
        if (!e.alive || e.kind === 'boss' || !this.isEnemy(o, e) || e.invulnUntil > now) return;
        if (def.flood) { e.x = clamp(e.x + cur.x * def.current * dt, 60, MAP_W - 60); e.y = clamp(e.y + cur.y * def.current * dt, 70, MAP_H - 60); }
        if (def.voidPull && d.portals) {
          for (const q of d.portals) { const dd = Math.hypot(q.x - e.x, q.y - e.y); if (dd < 170 && dd > 30) { const n = normalize(q.x - e.x, q.y - e.y); e.x += n.x * def.voidPull * dt; e.y += n.y * def.voidPull * dt; } }
        }
      });
    }
    // void portals: any hero stepping in is thrown to the paired portal
    if (d.portals) {
      this.fighters().forEach((p) => {
        if (!p.alive || now < (p._portalAt || 0)) return;
        for (let i = 0; i < d.portals.length; i++) {
          const q = d.portals[i];
          if (Math.hypot(q.x - p.x, q.y - p.y) < 34) {
            const to = d.portals[i % 2 === 0 ? i + 1 : i - 1];
            p._portalAt = now + 1800;
            const ox = p.x, oy = p.y;
            p.x = to.x + 40; p.y = to.y + 10;
            if (pointBlocked(p.x, p.y, 14)) { p.x = to.x; p.y = to.y + 40; }
            this.broadcast('portal', { id: p.id, x1: Math.round(ox), y1: Math.round(oy), x2: Math.round(p.x), y2: Math.round(p.y) });
            break;
          }
        }
      });
    }

    if (now >= d.nextPulse) {
      d.nextPulse = now + DOMAIN.pulseMs;
      this.forTargets((e) => {
        if (!e.alive || e.kind === 'boss' || !this.isEnemy(o, e)) return;
        if (def.pulse && Math.random() < def.pulse.chance) this.applyStatus(e, def.pulse.status, o);
        if (def.flood && !this.has(e, 'wet', now)) this.applyStatus(e, 'wet', o);
        if (def.noWater && e.kind !== 'unit' && inWater(e.x, e.y)) { if (this.dealDamage(e, 6, o, 'zone')) this.applyStatus(e, 'burn', o); }
      });
    }

    if (def.hazard && now >= d.nextHazard) {
      const hz = def.hazard;
      d.nextHazard = now + hz.every;
      let pool = enemyHeroes;
      if (!pool.length) pool = this.units.filter((u) => u.alive && this.isEnemy(o, u));
      const points = [];
      for (let i = 0; i < hz.count && pool.length; i++) {
        const t = pick(pool);
        const a = Math.random() * Math.PI * 2, r = 30 + Math.random() * 80;
        const x = clamp(t.x + Math.cos(a) * r, 60, MAP_W - 60), y = clamp(t.y + Math.sin(a) * r, 70, MAP_H - 60);
        const ab = { kind: 'strike', damage: hz.damage, radius: hz.radius, applies: hz.applies, statusMs: hz.statusMs, knock: hz.knock, impact: hz.impact };
        this.effects.push({ type: 'strike', id: 'domain_' + def.id, x, y, r: hz.radius, caster: o, at: now + hz.delay, a: ab });
        points.push({ x: Math.round(x), y: Math.round(y), r: hz.radius, delay: hz.delay });
      }
      if (points.length) this.broadcast('strikes', { id: 'domain_' + def.id, casterId: o.id, points });
    }
  },
};
