// AI armies: soldiers + special companions. Server-authoritative spawning, AI, combat and cleanup.
// Performance: soldiers think every ARMY.aiMs (staggered), use a uniform spatial grid for target search,
// and every army is capped (ARMY.capacity + 2 companions + a few domain skeletons).
import { Unit } from '../schema/state.js';
import { PLAYER_RADIUS, BURN_DPS, POISON_DPS, CHILL_SLOW } from '../abilities.js';
import {
  ARMY, UNITS, HERO_ARMY, SUMMON, COMPANION_ROLES, COMPANIONS, DOMAINS, UNIT_TYPES,
  statMult, compositionFor, tierIndex,
} from '../army.js';
import { MAP_W, MAP_H, resolveCircle, pointBlocked } from '../map.js';
import { dist, clamp, rand, normalize } from './util.js';

const CELL = 200;
const HALT = ['stun', 'root', 'airborne', 'timestop'];
const TYPE_INDEX = Object.fromEntries(UNIT_TYPES.map((t, i) => [t, i]));

export const armyMixin = {
  initArmy() {
    this.units = [];
    this.unitById = new Map();
    this.nextUid = 1;
    this.grid = new Map();
  },

  // ---------------------------------------------------------------- lookup helpers
  ownerOf(e) { return e && (e.kind === 'unit' || e.kind === 'summon') ? e.owner : e; },
  entityById(id) { return id ? (this.state.players.get(id) || this.unitById.get(id) || null) : null; },
  forTargets(fn) {
    this.state.players.forEach(fn);
    for (let i = 0; i < this.units.length; i++) { const u = this.units[i]; if (u.alive) fn(u); }
  },
  unitsOf(p) { return this.units.filter((u) => u.alive && u.owner === p); },
  radiusOf(e) { return e.kind === 'boss' ? 30 : e.kind === 'unit' ? e.radius : PLAYER_RADIUS; },

  rebuildGrid() {
    this.grid.clear();
    const add = (e) => {
      if (!e.alive) return;
      const k = Math.floor(e.x / CELL) + ',' + Math.floor(e.y / CELL);
      let c = this.grid.get(k); if (!c) { c = []; this.grid.set(k, c); }
      c.push(e);
    };
    this.state.players.forEach(add);
    this.units.forEach(add);
  },
  queryGrid(x, y, r, fn) {
    const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
    const y0 = Math.floor((y - r) / CELL), y1 = Math.floor((y + r) / CELL);
    for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) {
      const c = this.grid.get(gx + ',' + gy);
      if (c) for (let i = 0; i < c.length; i++) fn(c[i]);
    }
  },
  // nearest hostile to (x,y) within r; optional leash around an anchor; heroes can be preferred
  nearestHostile(u, x, y, r, preferHeroes, anchor, leash) {
    let best = null, bs = Infinity;
    this.queryGrid(x, y, r, (e) => {
      if (!e.alive || !this.isEnemy(u, e)) return;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d > r) return;
      if (e.hidden && e.kind !== 'unit' && d > 150) return;
      if (anchor && Math.hypot(e.x - anchor.x, e.y - anchor.y) > leash) return;
      const score = d - (preferHeroes && e.kind !== 'unit' ? 220 : 0) + (e.kind === 'boss' ? 250 : 0);
      if (score < bs) { bs = score; best = e; }
    });
    return best;
  },

  // ---------------------------------------------------------------- Army Power
  addPower(p, amount, reason) {
    if (!p || p.kind || !amount || !this.state.players.has(p.id)) return;
    const before = tierIndex(p.power);
    p.power = Math.min(ARMY.maxPower, p.power + amount);
    p._roundGain = (p._roundGain || 0) + amount;
    const after = tierIndex(p.power);
    if (after > before) {
      const prev = compositionFor(ARMY.tiers[before].power), next = compositionFor(p.power);
      const unlocked = next.commander > 0 && prev.commander === 0 ? 'commander' : next.elite > 0 && prev.elite === 0 ? 'elite' : '';
      if (unlocked) (p._roundUnlocks = p._roundUnlocks || []).push(unlocked);
      this.broadcast('armyTier', { id: p.id, name: p.name, power: p.power, comp: next, unlocked });
    }
    if (!p.isBot) this.sendTo(p.id, 'armyPower', { gain: amount, reason, power: p.power });
  },
  sendTo(id, type, msg) { const c = this.clients.find((cl) => cl.sessionId === id); if (c) c.send(type, msg); },

  // ---------------------------------------------------------------- spawning
  makeUnit(owner, type, x, y, extra = {}) {
    const style = HERO_ARMY[owner.hero] || {};
    const comp = extra.compDef || null;
    const base = comp ? COMPANION_ROLES[comp.role] : UNITS[type];
    const power = comp ? owner.power * SUMMON.powerScale : owner.power;
    const m = statMult(power);
    const champ = this.isChampion(owner) && !comp;
    const hp = Math.round(base.hp * m * (style.hp || 1) * (champ ? ARMY.championHp : 1));
    const u = {
      id: 'u' + (this.nextUid++), kind: 'unit', type, owner, ownerId: owner.id, team: owner.team, name: owner.name,
      def: base, compDef: comp, role: comp ? comp.role : type, style,
      x, y, vx: 0, vy: 0, hp, maxHp: hp, alive: true,
      dmg: base.dmg * m * (style.dmg || 1), range: base.range, atkMs: base.atkMs / (style.atkSpeed || 1),
      speed: base.speed * (style.speed || 1), radius: base.radius, aggro: base.aggro, armor: style.armor || 0,
      passives: [], _st: {}, shield: 0, maxShield: 0, invulnUntil: 0, hidden: false,
      _nextAi: Date.now() + Math.random() * ARMY.aiMs, _nextAtk: 0, _nextSlam: Date.now() + 2500, _nextBlink: 0, _nextHeal: 0,
      _lastDot: 0, target: null, goal: null, slotIdx: extra.slotIdx || 0, lingerUntil: 0, anchor: null, expiresAt: extra.expiresAt || 0,
      _kbx: 0, _kby: 0,
    };
    const s = new Unit();
    s.id = u.id; s.o = owner.id; s.t = TYPE_INDEX[type]; s.x = Math.round(x); s.y = Math.round(y); s.hp = hp; s.mhp = hp;
    u.s = s;
    this.units.push(u); this.unitById.set(u.id, u);
    this.state.units.set(u.id, s);
    return u;
  },

  spawnPoint(owner, i, n, r = 70) {
    const a = (i / Math.max(1, n)) * Math.PI * 2 + Math.random() * 0.3;
    let x = clamp(owner.x + Math.cos(a) * r, 70, MAP_W - 70), y = clamp(owner.y + Math.sin(a) * r * 0.8, 80, MAP_H - 70);
    if (pointBlocked(x, y, 12)) { x = owner.x; y = owner.y; }
    return { x, y };
  },

  spawnArmy(p) {
    this.units.filter((u) => u.owner === p).forEach((u) => this.removeUnit(u));
    const comp = compositionFor(p.power);
    const list = [...Array(comp.commander).fill('commander'), ...Array(comp.elite).fill('elite'), ...Array(comp.basic).fill('basic')];
    list.forEach((type, i) => { const pt = this.spawnPoint(p, i, list.length); this.makeUnit(p, type, pt.x, pt.y, { slotIdx: i }); });
    p._nextReinforce = Date.now() + ARMY.reinforceMs;
  },

  reinforce(p, now) {
    if (!p.alive || now < (p._nextReinforce || 0)) return;
    p._nextReinforce = now + ARMY.reinforceMs * (this.isChampion(p) ? 0.75 : 1);
    const comp = compositionFor(p.power);
    const have = { basic: 0, elite: 0, commander: 0 };
    this.units.forEach((u) => { if (u.alive && u.owner === p && have[u.type] !== undefined) have[u.type]++; });
    const missing = ['commander', 'elite', 'basic'].find((t) => have[t] < comp[t]);
    if (!missing) return;
    const n = have.basic + have.elite + have.commander;
    const pt = this.spawnPoint(p, n, n + 1, 50);
    const u = this.makeUnit(p, missing, pt.x, pt.y, { slotIdx: n });
    this.broadcast('ureinforce', { u: u.id, x: Math.round(u.x), y: Math.round(u.y) });
  },

  removeUnit(u) {
    if (!u) return;
    u.alive = false;
    this.unitById.delete(u.id);
    const i = this.units.indexOf(u); if (i >= 0) this.units.splice(i, 1);
    if (this.state.units.has(u.id)) this.state.units.delete(u.id);
  },
  clearAllUnits() {
    this.units.slice().forEach((u) => this.removeUnit(u));
    this.units = []; this.unitById.clear();
  },
  removeUnitsOf(p) { this.units.filter((u) => u.owner === p).forEach((u) => this.removeUnit(u)); },

  // hero died: army lingers and defends the fallen position, then fades
  onOwnerDown(p, now) {
    const ms = this.state.stage === 'final' ? ARMY.finalLingerMs : ARMY.lingerMs;
    this.units.forEach((u) => {
      if (u.owner !== p || !u.alive) return;
      u.lingerUntil = now + ms; u.anchor = { x: p.x, y: p.y }; u.s.lg = true;
      if (u.expiresAt) u.expiresAt = Math.min(u.expiresAt, now + ms);
    });
  },

  killUnit(u, caster) {
    if (!u.alive) return;
    const credit = this.ownerOf(caster);
    this.broadcast('udie', { u: u.id, x: Math.round(u.x), y: Math.round(u.y), t: TYPE_INDEX[u.type] });
    this.removeUnit(u);
    if (credit && credit.kind !== 'boss' && credit !== u.owner) {
      this.addPower(credit, u.type === 'commander' ? ARMY.gains.commanderKill : ARMY.gains.unitKill, 'unit');
    }
    // necropolis domain: fallen enemy soldiers rise for the domain owner
    const dom = this.activeDomain();
    if (dom && dom.def.necroRise && u.owner !== dom.owner && dom.owner.alive && u.type !== 'skeleton') {
      const skel = this.units.filter((x) => x.alive && x.owner === dom.owner && x.type === 'skeleton').length;
      if (skel < dom.def.necroRise) {
        const s = this.makeUnit(dom.owner, 'skeleton', u.x, u.y, { expiresAt: this.state.activeDomainEndTime + 3000, slotIdx: 20 + skel });
        this.broadcast('ureinforce', { u: s.id, x: Math.round(s.x), y: Math.round(s.y), rise: true });
      }
    }
  },

  // ---------------------------------------------------------------- special summons (2 per hero)
  trySummon(p, slot) {
    if (!p || !p.alive || this.state.phase !== 'playing' || p.kind) return false;
    const now = Date.now();
    if (now < this.state.matchReadyAt) return false;
    const key = 'summon' + slot;
    if ((p.cooldowns.get(key) || 0) > now) return false;
    if (['stun', 'airborne', 'timestop', 'polymorph', 'silence'].some((s) => this.has(p, s, now))) return false;
    const type = 'comp' + slot;
    if (this.units.some((u) => u.alive && u.owner === p && u.type === type)) return false;
    const def = (COMPANIONS[p.hero] || COMPANIONS.shadow)[slot - 1];
    const pt = this.spawnPoint(p, slot, 2, 55);
    const u = this.makeUnit(p, type, pt.x, pt.y, { compDef: def, expiresAt: now + SUMMON.lifetime, slotIdx: 30 + slot });
    p.cooldowns.set(key, now + SUMMON.cooldown * this.cooldownMult(p));
    this.broadcast('usummon', { u: u.id, o: p.id, slot, id: def.id, x: Math.round(u.x), y: Math.round(u.y) });
    return true;
  },

  // ---------------------------------------------------------------- combat math
  unitDamageMult(u, now) {
    let m = 1;
    const o = u.owner;
    if (!u.compDef && this.isChampion(o)) m *= ARMY.championDmg;
    const dom = this.activeDomain();
    if (dom && dom.owner === o) m *= dom.def.unitDmg || 1;
    if (u.type !== 'commander' && o._rallyUntil > now) {
      const cmd = this.units.find((c) => c.alive && c.owner === o && c.type === 'commander' && Math.hypot(c.x - u.x, c.y - u.y) < UNITS.commander.rallyR);
      if (cmd) m *= UNITS.commander.rallyMult;
    }
    const crit = (u.style.crit || 0) + (dom && dom.owner === o ? dom.def.unitCrit || 0 : 0);
    if (crit && Math.random() < crit) m *= 1.6;
    return m;
  },
  unitArmor(u) {
    const dom = this.activeDomain();
    return Math.min(0.6, (u.armor || 0) + (dom && dom.owner === u.owner ? dom.def.unitArmor || 0 : 0));
  },

  unitStrike(u, t, now) {
    const status = u.compDef ? u.compDef.applies : u.style.onHit;
    const chance = u.compDef ? 0.6 : (u.style.chance || 0);
    const statusMs = u.compDef ? u.compDef.statusMs : undefined;
    if (u.def.ranged) {
      const dir = normalize(t.x - u.x, t.y - 10 - (u.y - 12));
      const spec = { speed: u.def.ranged.speed, damage: u.dmg, radius: u.def.ranged.radius, range: u.range + 90 };
      if (status && Math.random() < chance) { spec.applies = status; spec.statusMs = statusMs; }
      const pids = this.spawnProjectiles(u, 'ushot', spec, u.x, u.y - 12, dir, now);
      this.broadcast('ushot', { u: u.id, p: pids[0], x: Math.round(u.x), y: Math.round(u.y - 12), dx: +dir.x.toFixed(3), dy: +dir.y.toFixed(3), s: spec.speed, r: spec.range });
    } else {
      const hpBefore = t.hp;
      const alive = this.dealDamage(t, u.dmg, u, 'unit');
      const lifesteal = (u.style.lifesteal || 0) + ((this.activeDomain() || {}).owner === u.owner ? (this.activeDomain().def.unitLifesteal || 0) : 0);
      if (lifesteal) this.heal(u, Math.max(0, hpBefore - t.hp) * lifesteal);
      if (alive) {
        if (status && Math.random() < chance) this.applyStatus(t, status, u, statusMs);
        const knock = (u.def.knock || 0) + (u.style.knock || 0);
        if (knock) this.knock(t, normalize(t.x - u.x, t.y - u.y), knock * 0.5);
      }
    }
    u.s.a = (u.s.a + 1) % 250;
  },

  // ---------------------------------------------------------------- per-tick update
  tickArmy(now, dt) {
    this.rebuildGrid();
    const solids = this._solids;
    const stage = this.state.stage;
    // reinforcements
    this.state.players.forEach((p) => { if (!p.kind && p.alive) this.reinforce(p, now); });

    const list = this.units.slice();
    for (let i = 0; i < list.length; i++) {
      const u = list[i];
      if (this.state.phase !== 'playing') break;
      if (!u.alive) continue;
      const o = u.owner;
      if (!this.state.players.has(o.id)) { this.removeUnit(u); continue; }
      if ((u.expiresAt && now > u.expiresAt) || (u.lingerUntil && now > u.lingerUntil)) {
        this.broadcast('udie', { u: u.id, x: Math.round(u.x), y: Math.round(u.y), t: TYPE_INDEX[u.type], fade: true });
        this.removeUnit(u); continue;
      }
      if (!o.alive && !u.lingerUntil) this.onOwnerDown(o, now);
      const frozen = this.timeStopped(u, now);

      // status damage
      if (now - u._lastDot > 500) {
        u._lastDot = now;
        if (this.has(u, 'burn', now) && !this.dealDamage(u, BURN_DPS / 2, u._burnBy, 'burn')) continue;
        if (this.has(u, 'poison', now) && !this.dealDamage(u, POISON_DPS / 2, u._dotBy, 'poison')) continue;
        const dom = this.activeDomain();
        const regen = (u.style.regen || 0) + (dom && dom.owner === o ? dom.def.unitRegen || 0 : 0);
        if (regen) this.heal(u, regen * 0.5);
      }
      if (frozen) continue;

      if (now >= u._nextAi) { u._nextAi = now + ARMY.aiMs; this.thinkUnit(u, now, stage); }

      // movement
      let sp = u.speed;
      if (HALT.some((s) => this.has(u, s, now))) sp = 0;
      else {
        if (this.has(u, 'chill', now)) sp *= CHILL_SLOW;
        if (this.has(u, 'slowtime', now)) sp *= 0.3;
        const dom = this.activeDomain();
        if (dom) sp *= dom.owner === o ? (dom.def.unitSpeed || 1) : (this.isEnemy(dom.owner, u) ? dom.def.enemySlow || 1 : 1);
        if (u.catchUp) sp *= 1.35;
      }
      const g = u.goal;
      if (g && sp > 0) {
        const dx = g.x - u.x, dy = g.y - u.y, d = Math.hypot(dx, dy);
        if (d > 6) { const step = Math.min(d, sp * dt); u.vx = dx / d * sp; u.vy = dy / d * sp; u.x += dx / d * step; u.y += dy / d * step; }
        else { u.vx = 0; u.vy = 0; }
      } else { u.vx = 0; u.vy = 0; }
      if (u._kbx || u._kby) {
        u.x += u._kbx * dt; u.y += u._kby * dt; u._kbx *= 0.72; u._kby *= 0.72;
        if (Math.abs(u._kbx) < 5) u._kbx = 0; if (Math.abs(u._kby) < 5) u._kby = 0;
      }
      // light separation within the same army
      for (let j = 0; j < this.units.length; j++) {
        const w = this.units[j];
        if (w === u || !w.alive || w.owner !== o) continue;
        const dx = u.x - w.x, dy = u.y - w.y, d2 = dx * dx + dy * dy, min = u.radius + w.radius;
        if (d2 < min * min && d2 > 0.01) { const d = Math.sqrt(d2), push = (min - d) * 0.5; u.x += dx / d * push; u.y += dy / d * push; }
      }
      resolveCircle(u, u.radius, null, solids);

      // attack
      const t = u.target;
      if (t && t.alive && sp >= 0 && !this.has(u, 'stun', now) && !this.has(u, 'polymorph', now) && now >= u._nextAtk && now >= this.state.matchReadyAt) {
        const reach = u.range + this.radiusOf(t) + 4;
        if (Math.hypot(t.x - u.x, t.y - u.y) <= reach) {
          u._nextAtk = now + u.atkMs * rand(0.9, 1.1);
          this.unitStrike(u, t, now);
        }
      }
      // sync (only on change keeps patches small)
      const s = u.s;
      const rx = Math.round(u.x), ry = Math.round(u.y), rh = Math.max(0, Math.ceil(u.hp));
      if (s.x !== rx) s.x = rx;
      if (s.y !== ry) s.y = ry;
      if (s.hp !== rh) s.hp = rh;
    }
    if (now - (this._unitFxAt || 0) > 200) {
      this._unitFxAt = now;
      this.units.forEach((u) => { const fx = ['burn', 'chill', 'shock', 'poison', 'stun', 'root', 'weak', 'mark', 'wet'].filter((k) => this.has(u, k, now)).join(','); if (u.s.fx !== fx) u.s.fx = fx; });
    }
    if (stage === 'final' && now - (this._forceCheckAt || 0) > 1000) { this._forceCheckAt = now; this.checkRoundEnd(); }
  },

  // AI priorities: 1) protect a threatened owner  2) Final War assigned targets  3) nearby threats  4) follow formation
  thinkUnit(u, now, stage) {
    const o = u.owner;
    const ownerAlive = o.alive;
    const anchor = ownerAlive ? o : (u.anchor || o);
    const final = stage === 'final';
    const leash = u.compDef ? (final ? ARMY.finalLeash * 0.6 : SUMMON.leash) : final ? ARMY.finalLeash : ARMY.leash;
    const def = u.def;
    let target = null;
    u.catchUp = false;

    // too far from the hero: regroup first
    const fromAnchor = Math.hypot(u.x - anchor.x, u.y - anchor.y);
    if (ownerAlive && fromAnchor > leash * 1.5) { u.target = null; u.catchUp = true; u.goal = this.formationGoal(u, anchor, now); return; }

    // 1. protect owner
    if (ownerAlive) {
      const threatened = o.hp / this.maxHpOf(o) < ARMY.dangerHpFrac || now - (o._lastHitAt || 0) < 1500;
      if (threatened) {
        const att = this.entityById(o._lastHitBy);
        if (att && att.alive && this.isEnemy(u, att) && Math.hypot(att.x - o.x, att.y - o.y) < 600 && now - (o._lastHitAt || 0) < 3000) target = att;
        else if (o.hp / this.maxHpOf(o) < ARMY.dangerHpFrac) target = this.nearestHostile(u, o.x, o.y, 320, false);
      }
    } else if (u.anchor) {
      // lingering: defend the fallen position
      target = this.nearestHostile(u, u.anchor.x, u.anchor.y, 420, false);
    }
    // 2. Final War: assigned targets
    if (!target && final && o.targets) {
      let best = null, bd = Infinity;
      o.targets.split(',').forEach((tid) => {
        const th = this.state.players.get(tid);
        if (!th || !th.alive || Math.hypot(th.x - anchor.x, th.y - anchor.y) > leash) return;
        const d = Math.hypot(th.x - u.x, th.y - u.y);
        if (d < bd) { bd = d; best = th; }
      });
      if (best) {
        target = best;
        const blocker = this.nearestHostile(u, u.x, u.y, 80, false);
        if (blocker && blocker.kind === 'unit' && bd > u.range + 40) target = blocker;
      }
    }
    // 3. keep a valid current target, otherwise nearest threat
    if (!target && u.target && u.target.alive && this.isEnemy(u, u.target)
      && Math.hypot(u.target.x - u.x, u.target.y - u.y) < u.aggro * 1.3
      && Math.hypot(u.target.x - anchor.x, u.target.y - anchor.y) < leash) target = u.target;
    if (!target) target = this.nearestHostile(u, u.x, u.y, u.aggro, !!def.prefersHeroes, anchor, leash);
    u.target = target;

    // role behaviours
    if (u.type === 'commander' && now > u._nextSlam) {
      const sl = def.slam;
      let n = 0; let hero = false;
      this.queryGrid(u.x, u.y, sl.radius, (e) => { if (e.alive && this.isEnemy(u, e) && Math.hypot(e.x - u.x, e.y - u.y) < sl.radius + this.radiusOf(e)) { n++; if (e.kind !== 'unit') hero = true; } });
      if (n >= 2 || hero) {
        u._nextSlam = now + def.slamMs;
        this.areaHit(u.x, u.y, sl.radius, u, (e) => { if (this.dealDamage(e, sl.damage * statMult(o.power), u, 'unit')) this.knock(e, normalize(e.x - u.x, e.y - u.y), sl.knock); });
        this.broadcast('impact', { type: 'slam', x: Math.round(u.x), y: Math.round(u.y), radius: sl.radius });
        o._rallyUntil = now + 5000;
        this.broadcast('urally', { u: u.id });
      }
    }
    if (def.blinkMs && target && now > u._nextBlink) {
      const d = Math.hypot(target.x - u.x, target.y - u.y);
      if (d > 110 && d < def.blinkRange) {
        u._nextBlink = now + def.blinkMs;
        const n = normalize(target.x - u.x, target.y - u.y);
        const bx = target.x + n.x * 34, by = target.y + n.y * 34;
        if (!pointBlocked(bx, by, u.radius)) {
          this.broadcast('ublink', { u: u.id, x1: Math.round(u.x), y1: Math.round(u.y), x2: Math.round(bx), y2: Math.round(by) });
          u.x = bx; u.y = by; u._nextAtk = 0;
        }
      }
    }
    if (def.heal && now > u._nextHeal) {
      let low = null, lf = 0.92;
      const consider = (e) => { if (!e.alive) return; const f = e.hp / this.maxHpOf(e); if (f < lf && Math.hypot(e.x - u.x, e.y - u.y) < def.range) { lf = f; low = e; } };
      if (ownerAlive) consider(o);
      this.units.forEach((w) => { if (w.owner === o && w !== u) consider(w); });
      if (low) {
        u._nextHeal = now + def.healMs;
        this.heal(low, def.heal * statMult(o.power * SUMMON.powerScale));
        this.broadcast('uheal', { u: u.id, x: Math.round(low.x), y: Math.round(low.y) });
      }
    }

    // movement goal
    if (target) {
      const d = Math.hypot(target.x - u.x, target.y - u.y);
      const want = def.ranged ? u.range * 0.8 : u.range * 0.6;
      if (d > want) u.goal = { x: target.x, y: target.y };
      else if (def.ranged && d < 90) { const n = normalize(u.x - target.x, u.y - target.y); u.goal = { x: u.x + n.x * 60, y: u.y + n.y * 60 }; }
      else u.goal = null;
    } else u.goal = this.formationGoal(u, anchor, now);
  },

  formationGoal(u, anchor, now) {
    const ring = u.compDef ? 60 : u.type === 'commander' ? 55 : u.type === 'elite' ? 105 : 80;
    const a = u.slotIdx * 2.399 + (anchor.vx || anchor.vy ? Math.atan2(anchor.vy, anchor.vx) + Math.PI : 0) * 0.3;
    const gx = anchor.x + Math.cos(a) * ring, gy = anchor.y + Math.sin(a) * ring * 0.7;
    if (Math.hypot(gx - u.x, gy - u.y) < 16) return null;
    return { x: gx, y: gy };
  },

  armyComp(p) {
    const c = { basic: 0, elite: 0, commander: 0 };
    this.units.forEach((u) => { if (u.alive && u.owner === p && c[u.type] !== undefined) c[u.type]++; });
    return c;
  },
};

export { DOMAINS };
