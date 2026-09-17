// Bot brain: picks targets (players, boss, supply drops) and decides which ability fits the moment.
import { BASIC_ABILITY, PLAYER_RADIUS, defOf } from '../abilities.js';
import { MAP_W, MAP_H, pointBlocked, randomOpenPoint } from '../map.js';
import { dist, rand, pick, normalize } from './util.js';

const SPECIAL_WANTS = {
  time_rewind: (d, hp) => hp < 0.45,
  reality_swap: (d, hp) => d < 600 && hp < 0.5,
  time_stop: (d) => d < 450,
  destiny_snap: (d) => d < 450,
  reality_warp: (d) => d < 200,
  space_portal: (d) => d > 320,
  black_hole: (d) => d < 560,
  thunderstorm: (d) => d < 460,
};

export const botMixin = {
  steer(p, dir) {
    const base = Math.atan2(dir.y, dir.x);
    for (const da of [0, 0.7, -0.7, 1.3, -1.3, 2.0, -2.0]) {
      const a = base + da;
      if (!pointBlocked(p.x + Math.cos(a) * 46, p.y + Math.sin(a) * 46, PLAYER_RADIUS)) return { x: Math.cos(a), y: Math.sin(a) };
    }
    return { x: -dir.x, y: -dir.y };
  },

  botWants(p, id, d, hpFrac) {
    const a = defOf(id);
    if (!a) return false;
    switch (a.kind) {
      case 'buff':
        if (a.invulnMs || a.heal || a.hot || a.phoenixMs || a.shieldAdd) return hpFrac < 0.5;
        return d < 320;
      case 'dash':
        if (a.behindTarget) return d > 140 && d < a.range;
        if (a.damage) return d < a.range;
        return d > 380 || hpFrac < 0.25;
      case 'strike':
        if (a.at === 'self') return d < a.radius * 0.9;
        if (a.at === 'front') return d < 200;
        if (a.at === 'rings') return d < 320;
        return d < (a.range || 500);
      case 'zone':
        if (a.stealthOwner) return hpFrac < 0.5 && d < 260;
        if (a.at === 'self') return d < Math.max(180, a.radius);
        return d < (a.range || 500);
      case 'cone': return d < a.radius * 0.8;
      case 'wave': return d < Math.min(560, a.length * 0.8);
      case 'summon': return d < 560;
      case 'chain': return d < a.range;
      case 'hop': return d < a.radius;
      case 'trap': return d < 300;
      case 'special': return (SPECIAL_WANTS[id] || (() => d < 500))(d, hpFrac);
      case 'proj': return d < a.range * 0.8;
      default: return d < 500;
    }
  },

  updateBot(p, bs, now) {
    if (!p.alive || !bs) return;
    const center = { x: MAP_W / 2, y: MAP_H / 2 };
    const visible = (e) => e.alive && this.isEnemy(p, e) && (!e.hidden || dist(p, e) < 150);
    let move = { x: 0, y: 0 }, speedFrac = 1;
    const hpFrac = p.hp / this.maxHpOf(p);

    if (dist(p, center) > this.state.safeRadius * 0.82) {
      move = normalize(center.x - p.x, center.y - p.y);
    } else {
      const drop = !p.bonus && this.drops.find((dd) => now > dd.landAt - 800 && dist(p, dd) < 420);
      const champ = this.state.players.get(this.state.championId);
      if (champ && champ.alive && this.isEnemy(p, champ) && dist(p, champ) < 700 && Math.random() < 0.02) bs.targetId = champ.id;
      if (this.state.stage === 'final' && p.targets && Math.random() < 0.05) {
        const pref = p.targets.split(',').map((id) => this.state.players.get(id)).find((t) => t && t.alive && dist(p, t) < 900);
        if (pref) { bs.targetId = pref.id; bs.retargetAt = Date.now() + 4000; }
      }
      const inRange = [...this.state.players.values()].filter((e) => visible(e) && dist(p, e) < 600 && (e.kind !== 'boss' || dist(p, e) < 320));
      if (!bs.targetId || now > bs.retargetAt || (!inRange.some((e) => e.id === bs.targetId) && !this.unitById.has(bs.targetId))) {
        const t = inRange.sort((a, b) => dist(p, a) - dist(p, b))[Math.random() < 0.7 ? 0 : Math.floor(Math.random() * inRange.length)];
        bs.targetId = t ? t.id : null; bs.retargetAt = now + rand(2500, 4500);
      }
      let target = bs.targetId ? this.entityById(bs.targetId) : null;
      if (!target || !target.alive) {
        const soldier = this.nearestHostile(p, p.x, p.y, 380, false);
        if (soldier && soldier.kind === 'unit') { target = soldier; bs.targetId = soldier.id; bs.retargetAt = now + 1500; }
      }
      if (drop && (!target || dist(p, target) > 250)) {
        move = normalize(drop.x - p.x, drop.y - p.y);
      } else if (target && target.alive) {
        const d = dist(p, target);
        const to = normalize(target.x - p.x, target.y - p.y);
        const ideal = target.kind === 'boss' ? 260 : bs.style === 'aggressive' ? 170 : 300;
        if (d > ideal + 60) move = to;
        else if (d < ideal - 60) move = { x: -to.x, y: -to.y };
        else { move = { x: -to.y * bs.strafe, y: to.x * bs.strafe }; speedFrac = 0.7; if (Math.random() < 0.01) bs.strafe *= -1; }

        if (now > bs.decisionAt) {
          bs.decisionAt = now + rand(420, 760);
          const ready = (id) => id && (p.cooldowns.get(id) || 0) <= now;
          const lx = target.x + target.vx * 0.25, ly = target.y + target.vy * 0.25;
          const order = [
            [p.mythic, 0.5], [p.bonus, 0.4], [p.fusion, 0.45], [p.legend, 0.25],
          ];
          let cast = false;
          if (this.canActivateDomain(p, now) && target.kind !== 'unit' && d < 500 && Math.random() < 0.18) cast = this.tryDomain(p);
          for (const slot of [1, 2]) if (!cast && ready('summon' + slot) && d < 560 && Math.random() < 0.3) cast = this.trySummon(p, slot);
          for (const [id, chance] of order) {
            if (!cast && id && (id === p.bonus || ready(id)) && this.botWants(p, id, d, hpFrac) && Math.random() < chance) cast = this.tryCast(p, id, lx, ly);
          }
          if (!cast) {
            const opts = p.abilities.filter((id) => ready(id) && this.botWants(p, id, d, hpFrac));
            if (opts.length && Math.random() < 0.35) {
              const id = pick(opts);
              const a = defOf(id);
              const flee = a.kind === 'dash' && !a.damage && !a.behindTarget && hpFrac < 0.25;
              this.tryCast(p, id, flee ? p.x - to.x * 200 : lx, flee ? p.y - to.y * 200 : ly);
            } else if (d < 620 && ready(BASIC_ABILITY.id)) this.tryCast(p, BASIC_ABILITY.id, lx, ly);
          }
        }
      } else {
        if (!bs.wander || now > bs.wanderUntil || dist(p, bs.wander) < 30) {
          bs.wander = randomOpenPoint(Math.random, center.x, center.y, Math.min(this.state.safeRadius * 0.7, 560));
          bs.wanderUntil = now + rand(2000, 3500);
        }
        move = normalize(bs.wander.x - p.x, bs.wander.y - p.y); speedFrac = 0.6;
      }
    }
    if (hpFrac < 0.5) { const k = this.pickups.find((q) => dist(p, q) < 260); if (k) move = normalize(k.x - p.x, k.y - p.y); }
    if (move.x || move.y) move = this.steer(p, move);
    p._mx = move.x * speedFrac; p._my = move.y * speedFrac;
  },
};
