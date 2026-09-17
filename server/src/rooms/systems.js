// Match systems: kill rewards (streaks, bounty, fusion, upgrades), supply drops, map boss, world events.
import { Player } from '../schema/state.js';
import { FUSION_BY_PAIR, FUSION_KILLS, ABILITIES, LEGEND_IDS, UPGRADES, UPGRADE_IDS, UPGRADE_EVERY } from '../abilities.js';
import { MAP_W, MAP_H, randomOpenPoint } from '../map.js';
import { dist, pick, shuffle, normalize, BOSS_HP } from './util.js';
import { ARMY } from '../army.js';

const EVENT_IDS = ['double_damage', 'chaos', 'meteor_shower', 'darkness', 'inverted_world', 'lava_rain', 'frozen_lake'];
const EVENT_MS = { double_damage: 8000, chaos: 10000, meteor_shower: 5000, darkness: 9000, inverted_world: 6000, lava_rain: 7000, frozen_lake: 10000 };
const DROP_EVERY_MS = 28000;
const DROP_FALL_MS = 3000;

export const systemsMixin = {
  // ---------------------------------------------------------------- kill rewards
  onKillRewards(caster, victim, victimBounty, now) {
    // multi-kill announcer
    caster._recentKills = caster._recentKills.filter((t) => now - t < 6000);
    caster._recentKills.push(now);
    if (caster._recentKills.length >= 2) this.broadcast('multikill', { id: caster.id, name: caster.name, n: caster._recentKills.length });
    // bounty: kill a wanted player for a reward
    if (victimBounty >= 3) {
      caster.score += 30; this.heal(caster, 30);
      this.broadcast('bountyClaim', { id: caster.id, name: caster.name, victimName: victim.name, bounty: victimBounty });
    }
    caster.bounty += 1;
    if (caster.bounty === 3) this.broadcast('wanted', { id: caster.id, name: caster.name });
    // kill streak auras
    if (caster.bounty === 3) { caster._st.onfire = now + 1e9; this.broadcast('streak', { id: caster.id, name: caster.name, level: 3 }); }
    if (caster.bounty === 5) { caster._st.rampage = now + 1e9; this.broadcast('streak', { id: caster.id, name: caster.name, level: 5 }); }
    // fusion
    if (caster.kills >= FUSION_KILLS && !caster.fusion) {
      const fams = [...caster.abilities].map((id) => ABILITIES[id] && ABILITIES[id].family).filter(Boolean);
      const counts = {};
      fams.forEach((f) => { counts[f] = (counts[f] || 0) + 1; });
      const sorted = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
      const pair = counts[sorted[0]] >= 2 && sorted.length === 1 ? `${sorted[0]}+${sorted[0]}` : [sorted[0], sorted[1] || sorted[0]].sort().join('+');
      const fid = FUSION_BY_PAIR[pair] || FUSION_BY_PAIR[`${sorted[0]}+${sorted[0]}`];
      if (fid) {
        caster.fusion = fid; caster.cooldowns.set(fid, 0);
        this.broadcast('fusion', { id: caster.id, name: caster.name, fusionId: fid });
      }
    }
    if (caster.kills % UPGRADE_EVERY === 0) this.offerUpgrade(caster);
  },

  // ---------------------------------------------------------------- upgrades
  offerUpgrade(p) {
    if (!p.alive) return;
    if (p.upgradeOffer) { p._pendingUpgrades += 1; return; }
    const opts = shuffle(UPGRADE_IDS.filter((id) => this.upLvl(p, id) < UPGRADES[id].max)).slice(0, 3);
    if (!opts.length) return;
    if (p.isBot) { this.applyUpgrade(p, pick(opts)); return; }
    p.upgradeOffer = opts.join(',');
    p._offerAt = Date.now();
  },
  applyUpgrade(p, id) {
    p._up[id] = (p._up[id] || 0) + 1;
    p.upgrades = Object.entries(p._up).map(([k, v]) => `${k}:${v}`).join(',');
    p.upgradeOffer = '';
    if (id === 'hp') { this.refreshMaxHp(p); this.heal(p, 25); }
    if (!p.isBot) this.broadcast('upgraded', { id: p.id, upgrade: id, lvl: p._up[id] });
    if (p._pendingUpgrades > 0) { p._pendingUpgrades -= 1; this.offerUpgrade(p); }
  },
  tickUpgrades(now) {
    this.state.players.forEach((p) => {
      if (p.upgradeOffer && now - p._offerAt > 12000) this.applyUpgrade(p, pick(p.upgradeOffer.split(',')));
    });
  },

  // ---------------------------------------------------------------- supply drops
  syncDrops() { this.state.drops = this.drops.map((d) => `${d.id}:${Math.round(d.x)}:${Math.round(d.y)}:${d.landAt}`).join(';'); },
  tickDrops(now) {
    if (now >= this.nextDropAt) {
      this.nextDropAt = now + DROP_EVERY_MS;
      const spot = randomOpenPoint(Math.random, MAP_W / 2, MAP_H / 2, Math.max(150, Math.min(this.state.safeRadius * 0.7, 620)));
      const d = { id: this.nextZid++, x: spot.x, y: spot.y, landAt: now + DROP_FALL_MS };
      this.drops.push(d); this.syncDrops();
      this.broadcast('dropIncoming', { id: d.id, x: d.x, y: d.y, ms: DROP_FALL_MS });
    }
    let changed = false;
    this.drops = this.drops.filter((d) => {
      if (now < d.landAt) return true;
      if (!d.landed) { d.landed = true; this.areaHit(d.x, d.y, 60, null, (e) => this.dealDamage(e, 15, null, 'drop')); this.broadcast('impact', { type: 'dropLand', x: d.x, y: d.y }); }
      const taker = this.fighters().find((p) => p.alive && !p.bonus && dist(p, d) < 38);
      if (!taker) return true;
      const legend = pick(LEGEND_IDS.filter((id) => id !== taker.legend));
      taker.bonus = legend;
      changed = true;
      this.broadcast('dropTaken', { id: d.id, playerId: taker.id, name: taker.name, legendId: legend, x: d.x, y: d.y });
      return false;
    });
    if (changed) this.syncDrops();
  },

  // ---------------------------------------------------------------- map boss
  tickBossSpawn(now) {
    if (this.bossSpawned || this.state.remaining > this.roundTime - 30) return;
    if (this.fighters().filter((p) => p.alive).length < 2) return;
    this.bossSpawned = true;
    const b = new Player();
    b.id = 'boss'; b.name = 'الغول العملاق'; b.isBot = true; b.kind = 'boss'; b.hero = 'golem';
    const spot = randomOpenPoint(Math.random, MAP_W / 2, MAP_H / 2, 160);
    b.x = spot.x; b.y = spot.y; b.hp = BOSS_HP; b.maxHp = BOSS_HP; b.shield = 0; b.maxShield = 0; b.alive = true; b.team = 0;
    b._st = {}; b._mx = 0; b._my = 0; b._kbx = 0; b._kby = 0; b._hist = []; b._up = {}; b._recentKills = [];
    b._lastHitAt = 0; b._healUntil = 0; b._speedUntil = 0; b._speedMult = 1; b._empowerUntil = 0; b._dmgBuffUntil = 0;
    b._nextSlam = now + 2000; b._nextNova = now + 6000; b._nextRock = now + 3500;
    this.state.players.set('boss', b);
    this.state.bossId = 'boss';
    this.broadcast('bossSpawn', { x: b.x, y: b.y, name: b.name });
  },
  updateBoss(b, now) {
    let target = this.state.players.get(b._lastHitBy);
    if (!target || !target.alive || now - b._lastHitAt > 5000 || dist(b, target) > 900) {
      target = null; let bd = 800;
      this.fighters().forEach((p) => { if (p.alive && !p.hidden) { const d = dist(b, p); if (d < bd) { bd = d; target = p; } } });
    }
    if (!target) { b._mx = 0; b._my = 0; return; }
    const d = dist(b, target);
    const to = normalize(target.x - b.x, target.y - b.y);
    b._mx = d > 90 ? to.x : 0; b._my = d > 90 ? to.y : 0;
    const bossAbility = (a) => ({ family: 'boss', kind: 'strike', ...a });
    if (now > b._nextSlam && d < 140) {
      b._nextSlam = now + 2200;
      const a = bossAbility({ at: 'self', telegraph: 450, radius: 140, damage: 22, knock: 230 });
      this.effects.push({ type: 'strike', id: 'boss_slam', x: b.x, y: b.y, r: 140, caster: b, at: now + 450, a: { ...a, impact: 'slam' } });
      this.broadcast('strikes', { id: 'boss_slam', casterId: 'boss', points: [{ x: Math.round(b.x), y: Math.round(b.y), r: 140, delay: 450 }] });
    }
    if (now > b._nextNova && d < 400) {
      b._nextNova = now + 7000;
      const a = bossAbility({ at: 'self', telegraph: 1000, radius: 280, damage: 18, applies: 'burn' });
      this.effects.push({ type: 'strike', id: 'boss_nova', x: b.x, y: b.y, r: 280, caster: b, at: now + 1000, a: { ...a, impact: 'meteor' } });
      this.broadcast('strikes', { id: 'boss_nova', casterId: 'boss', points: [{ x: Math.round(b.x), y: Math.round(b.y), r: 280, delay: 1000 }] });
      this.broadcast('bossRoar', {});
    }
    if (now > b._nextRock && d > 160 && d < 560) {
      b._nextRock = now + 3800;
      const pids = this.spawnProjectiles(b, 'boss_rock', { speed: 560, damage: 16, radius: 18, range: 600, knock: 200, stunMs: 400 }, b.x, b.y - 30, normalize(target.x - b.x, target.y - 10 - (b.y - 30)), now);
      this.broadcast('cast', { casterId: 'boss', abilityId: 'boss_rock', x: b.x, y: b.y - 20, tx: target.x, ty: target.y, pids });
    }
  },
  killBoss(b, caster) {
    b.alive = false; b.hp = 0; b.fx = '';
    this.state.bossId = '';
    if (caster && caster.alive && caster.kind !== 'boss') {
      caster._bossBuff = true; caster._bossKill = true;
      caster.hp = this.maxHpOf(caster); caster.shield = caster.maxShield;
      caster.score += 60;
      this.addPower(caster, ARMY.gains.bossKill, 'boss');
      this.offerUpgrade(caster);
    }
    this.broadcast('bossDown', { killerId: caster ? caster.id : '', killerName: caster ? caster.name : null, x: b.x, y: b.y });
    this.clock.setTimeout(() => { if (this.state.players.get('boss') === b) this.state.players.delete('boss'); }, 1500);
  },

  // ---------------------------------------------------------------- world events
  triggerWorldEvent() {
    const now = Date.now();
    const id = pick(EVENT_IDS.filter((e) => e !== this.lastEventId));
    this.lastEventId = id;
    const dur = EVENT_MS[id];
    this.state.eventId = id; this.state.eventUntil = now + dur;
    if (id === 'double_damage') this.eventDamageMult = 2;
    if (id === 'chaos') this.eventCooldownMult = 0.5;
    const rain = (n, gap, radius, damage, applies, impact) => {
      for (let i = 0; i < n; i++) {
        const spot = randomOpenPoint(Math.random, MAP_W / 2, MAP_H / 2, Math.min(this.state.safeRadius, 700));
        const delay = 900 + i * gap;
        const a = { kind: 'strike', damage, radius, applies, impact };
        this.effects.push({ type: 'strike', id: impact, x: spot.x, y: spot.y, r: radius, caster: null, at: now + delay, a });
        this.broadcast('strikes', { id: impact, casterId: '', points: [{ x: Math.round(spot.x), y: Math.round(spot.y), r: radius, delay }] });
      }
    };
    if (id === 'meteor_shower') rain(8, 450, 85, 20, 'burn', 'meteor');
    if (id === 'lava_rain') rain(16, 360, 60, 12, 'burn', 'lava');
    this.broadcast('worldEvent', { id, ms: dur });
    this.nextEventAt = now + dur + 35000;
  },
  tickWorldEvent(now) {
    if (!this.state.eventId) return;
    if (now > this.state.eventUntil) {
      this.eventDamageMult = 1; this.eventCooldownMult = 1; this.state.eventId = ''; this.state.eventUntil = 0;
      return;
    }
    if (this.state.eventId === 'inverted_world') this.fighters().forEach((p) => { if (p.alive) p._st.inverted = now + 200; });
  },
};
