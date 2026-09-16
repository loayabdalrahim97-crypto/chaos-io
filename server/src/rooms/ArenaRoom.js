import colyseus from 'colyseus';
const { Room } = colyseus;
import { ArenaState, Player } from '../schema/state.js';
import {
  ABILITIES, ABILITY_IDS, STARTER_ABILITIES, MAX_ABILITY_SLOTS,
  PASSIVES, PASSIVE_IDS, MAX_PASSIVE_SLOTS, BOSS_ABILITIES,
  MAX_HP, MAX_SHIELD, SHIELD_REGEN_DELAY, SHIELD_REGEN_RATE, PLAYER_SPEED,
} from '../abilities.js';

const TICK_MS = 50; // 20Hz server simulation — plenty for an arena this size
const ROUND_TIME = 150; // seconds
const GRACE_MS = 5000;
const BOT_FILL_WAIT_MS = 7000;
const RESTART_DELAY_MS = 9000;
const UPGRADE_INTERVAL_MS = 65000;
const UPGRADE_OFFER_TIMEOUT_MS = 9000;
const ORB_INTERVAL_MS = 20000;
const ORB_LIFETIME_MS = 14000;
const BOSS_FIRST_MS = 34000;
const BOSS_COOLDOWN_MS = 60000;
const BOSS_DURATION_MS = 20000;
const BOSS_HP_BONUS = 90;
const EVENT_FIRST_MS = 20000;
const EVENT_COOLDOWN_MS = 34000;
const SAFE_START_FRAC = 0.95;
const SAFE_END_FRAC = 0.32;
const SAFE_TICK_DMG = 6;
const SAFE_TICK_MS = 700;

const RINGS = ['#ffe27a', '#c9d6ff', '#ffc9de', '#c9ffe0', '#e0c9ff', '#fff3c9'];
const BOT_NAMES = ['المارد', 'الشبح', 'الغول', 'الفينيق', 'الذئب', 'الفارس', 'الكاهن', 'الصياد'];
const EVENT_IDS = ['double_damage', 'chaos', 'no_abilities', 'meteor_shower'];

function dist(a, b) { const dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function normalize(dx, dy) { const l = Math.sqrt(dx * dx + dy * dy); return l < 0.0001 ? { x: 1, y: 0 } : { x: dx / l, y: dy / l }; }
function rand(a, b) { return a + Math.random() * (b - a); }
function pointToSegmentDist(p, a, b) {
  const abx = b.x - a.x, aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  const t = len2 > 0 ? clamp(((p.x - a.x) * abx + (p.y - a.y) * aby) / len2, 0, 1) : 0;
  const cx = a.x + abx * t, cy = a.y + aby * t;
  return Math.sqrt((p.x - cx) * (p.x - cx) + (p.y - cy) * (p.y - cy));
}

export class ArenaRoom extends Room {
  maxClients = 5;

  onCreate() {
    this.setState(new ArenaState());
    this.state.arenaW = 1600;
    this.state.arenaH = 1000;

    this.botState = new Map();   // sessionId -> AI runtime state (not synced)
    this.effects = [];           // transient server-side effects being processed
    this.mines = [];             // placed traps {x,y,caster,expiresAt,triggered}
    this.pendingUpgrades = new Map(); // sessionId -> {options, timeout}
    this.botFillTimer = null;
    this.restartTimer = null;
    this.nextUpgradeAt = 0;
    this.nextOrbAt = 0;
    this.nextBossAt = 0;
    this.bossEndAt = 0;
    this.eventDamageMult = 1;
    this.eventCooldownMult = 1;
    this.eventNoAbilitiesUntil = 0;
    this.finalDuelAt = 0;

    this.onMessage('input', (client, msg) => this.handleInput(client, msg));
    this.onMessage('cast', (client, msg) => this.handleCast(client, msg));
    this.onMessage('upgradeChoice', (client, msg) => this.handleUpgradeChoice(client, msg));

    this.setSimulationInterval((dt) => this.update(dt), TICK_MS);
  }

  onJoin(client, options) {
    const p = new Player();
    p.id = client.sessionId;
    p.name = (options && options.name ? String(options.name).slice(0, 16) : 'Player') || 'Player';
    p.isBot = false;
    p.ring = RINGS[this.state.players.size % RINGS.length];
    this.spawnPosition(p);
    p.abilities.push(...STARTER_ABILITIES);
    this.state.players.set(client.sessionId, p);

    this.broadcast('toast', { text: `${p.name} joined the arena` });

    if (this.state.phase === 'waiting') this.checkStart();
  }

  onLeave(client) {
    const p = this.state.players.get(client.sessionId);
    if (p) {
      this.broadcast('toast', { text: `${p.name} left` });
      this.state.players.delete(client.sessionId);
    }
    this.pendingUpgrades.delete(client.sessionId);
    if (this.state.phase === 'waiting') this.checkStart();
  }

  // ---------------------------------------------------------------- lobby
  checkStart() {
    const humanCount = [...this.state.players.values()].filter((p) => !p.isBot).length;
    if (humanCount === 0) return;
    if (this.state.players.size >= this.maxClients) {
      this.beginCountdown(1500);
      return;
    }
    if (!this.botFillTimer) {
      this.state.countdown = Math.ceil(BOT_FILL_WAIT_MS / 1000);
      this.botFillTimer = setTimeout(() => this.fillWithBotsAndStart(), BOT_FILL_WAIT_MS);
    }
  }
  beginCountdown(ms) {
    if (this.botFillTimer) { clearTimeout(this.botFillTimer); this.botFillTimer = null; }
    this.state.countdown = Math.ceil(ms / 1000);
    setTimeout(() => this.startMatch(), ms);
  }
  fillWithBotsAndStart() {
    this.botFillTimer = null;
    if (this.state.phase !== 'waiting') return;
    const names = BOT_NAMES.slice().sort(() => Math.random() - 0.5);
    let i = 0;
    while (this.state.players.size < this.maxClients) {
      const id = 'bot_' + (i++) + '_' + Math.floor(Math.random() * 1e6);
      const p = new Player();
      p.id = id;
      p.name = names[i % names.length];
      p.isBot = true;
      p.ring = RINGS[this.state.players.size % RINGS.length];
      this.spawnPosition(p);
      p.abilities.push(...STARTER_ABILITIES);
      this.state.players.set(id, p);
      this.botState.set(id, { decisionAt: 0, decisionInterval: rand(220, 420), targetId: null, retargetAt: 0, wanderTarget: null, wanderUntil: 0, style: Math.random() < 0.5 ? 'aggressive' : 'cautious' });
    }
    this.startMatch();
  }
  spawnPosition(p) {
    const W = this.state.arenaW, H = this.state.arenaH;
    const ang = rand(0, Math.PI * 2);
    const rad = Math.min(W, H) * rand(0.15, 0.4);
    p.x = clamp(W / 2 + Math.cos(ang) * rad, 60, W - 60);
    p.y = clamp(H / 2 + Math.sin(ang) * rad, 60, H - 60);
  }

  // ---------------------------------------------------------------- match lifecycle
  startMatch() {
    if (this.restartTimer) { clearTimeout(this.restartTimer); this.restartTimer = null; }
    const now = Date.now();
    this.state.phase = 'playing';
    this.state.remaining = ROUND_TIME;
    this.state.matchReadyAt = now + GRACE_MS;
    this.state.safeRadius = Math.min(this.state.arenaW, this.state.arenaH) / 2 * SAFE_START_FRAC;
    this.state.orbActive = false;
    this.state.bossId = '';
    this.state.bossHuntEndAt = 0;
    this.state.eventId = '';
    this.state.eventUntil = 0;
    this.state.winnerId = '';
    this.state.winnerName = '';
    this.effects = [];
    this.mines = [];
    this.eventDamageMult = 1;
    this.eventCooldownMult = 1;
    this.eventNoAbilitiesUntil = 0;
    this.finalDuelAt = 0;
    this.nextOrbAt = now + ORB_INTERVAL_MS;
    this.nextBossAt = now + BOSS_FIRST_MS;
    this.nextUpgradeAt = now + UPGRADE_INTERVAL_MS;
    this.nextEventAt = now + EVENT_FIRST_MS;

    this.state.players.forEach((p) => {
      p.hp = MAX_HP; p.maxHp = MAX_HP; p.shield = MAX_SHIELD; p.maxShield = MAX_SHIELD;
      p.alive = true; p.kills = 0; p.score = 0; p.isBoss = false; p.invulnUntil = 0;
      p.abilities.splice(0, p.abilities.length, ...STARTER_ABILITIES);
      p.passives.splice(0, p.passives.length);
      Array.from(p.cooldowns.keys()).forEach((k) => p.cooldowns.delete(k));
      this.spawnPosition(p);
      p.vx = 0; p.vy = 0;
      if (this.botState.has(p.id)) {
        const bs = this.botState.get(p.id);
        bs.decisionAt = 0; bs.retargetAt = 0; bs.targetId = null; bs.wanderTarget = null;
      } else if (p.isBot) {
        this.botState.set(p.id, { decisionAt: 0, decisionInterval: rand(220, 420), targetId: null, retargetAt: 0, wanderTarget: null, wanderUntil: 0, style: Math.random() < 0.5 ? 'aggressive' : 'cautious' });
      }
    });

    this.broadcast('matchStart', { readyInMs: GRACE_MS });
  }

  endMatch(winner) {
    this.state.phase = 'ended';
    this.state.winnerId = winner ? winner.id : '';
    this.state.winnerName = winner ? winner.name : '';
    const results = [...this.state.players.values()].map((p) => {
      const status = winner && p.id === winner.id ? 'winner' : p.alive ? 'survivor' : 'eliminated';
      const pts = status === 'winner' ? 100 + p.kills * 20 : status === 'survivor' ? 40 + p.kills * 20 : p.kills * 20;
      return { id: p.id, name: p.name, status, kills: p.kills, pts, isBot: p.isBot };
    }).sort((a, b) => b.pts - a.pts);
    this.broadcast('roundEnd', { results, winnerName: winner ? winner.name : null });

    this.restartTimer = setTimeout(() => {
      // drop bots, refill, and go again — a real multiplayer room just keeps looping
      [...this.state.players.entries()].forEach(([id, p]) => { if (p.isBot) { this.state.players.delete(id); this.botState.delete(id); } });
      this.state.phase = 'waiting';
      if (this.state.players.size > 0) this.fillWithBotsAndStart();
    }, RESTART_DELAY_MS);
  }

  // ---------------------------------------------------------------- input / casting
  handleInput(client, msg) {
    const p = this.state.players.get(client.sessionId);
    if (!p || !p.alive || this.state.phase !== 'playing') return;
    const mx = clamp(Number(msg.mx) || 0, -1, 1);
    const my = clamp(Number(msg.my) || 0, -1, 1);
    const n = (mx || my) ? normalize(mx, my) : { x: 0, y: 0 };
    const speed = this.effSpeed(p);
    p.vx = n.x * speed; p.vy = n.y * speed;
    if (typeof msg.aimX === 'number') p._aimX = msg.aimX;
    if (typeof msg.aimY === 'number') p._aimY = msg.aimY;
  }

  handleCast(client, msg) {
    const p = this.state.players.get(client.sessionId);
    if (!p || !p.alive || this.state.phase !== 'playing') return;
    this.tryCast(p, msg.abilityId, Number(msg.tx) || p.x, Number(msg.ty) || p.y);
  }

  effSpeed(p) {
    let mult = 1;
    if (p._speedBoostUntil > Date.now()) mult *= p._speedBoostMult || 1;
    if (p.passives.includes('laststand') && p.hp / this.maxHpOf(p) < 0.3) mult *= 1.25;
    return PLAYER_SPEED * mult;
  }
  maxHpOf(p) { return MAX_HP + (p.isBoss ? BOSS_HP_BONUS : 0); }

  tryCast(entity, abilityId, tx, ty) {
    const a = ABILITIES[abilityId] || BOSS_ABILITIES[abilityId];
    if (!a) return false;
    if (BOSS_ABILITIES[abilityId]) {
      if (!entity.isBoss) return false; // boss-only ability, never part of a loadout
    } else if (!entity.abilities.includes(abilityId)) {
      return false; // server-authoritative: reject casts for abilities the caster hasn't unlocked
    }
    const now = Date.now();
    if (now < this.state.matchReadyAt) return false;
    if (now < this.eventNoAbilitiesUntil) return false;
    if ((entity.cooldowns.get(abilityId) || 0) > now) return false;
    const cdMult = this.eventCooldownMult * (entity.passives.includes('quickhands') ? 0.85 : 1);
    entity.cooldowns.set(abilityId, now + a.cooldown * cdMult);
    this.performCast(entity, abilityId, tx, ty);
    this.broadcast('cast', { casterId: entity.id, abilityId, x: entity.x, y: entity.y, tx, ty, ts: now });
    return true;
  }

  performCast(entity, id, tx, ty) {
    const now = Date.now();
    const a = ABILITIES[id] || BOSS_ABILITIES[id];
    if (id === 'boss_nova') {
      this.effects.push({ type: 'meteor', x: entity.x, y: entity.y, caster: entity, createdAt: now, telegraph: a.telegraph, impacted: false, damage: a.damage, radius: a.radius });
    } else if (id === 'dash' || id === 'teleport') {
      const dir = normalize(tx - entity.x, ty - entity.y);
      const dist_ = id === 'dash' ? a.range : a.range;
      entity.x = clamp(entity.x + dir.x * dist_, 20, this.state.arenaW - 20);
      entity.y = clamp(entity.y + dir.y * dist_, 20, this.state.arenaH - 20);
      entity.invulnUntil = Math.max(entity.invulnUntil, now + (id === 'dash' ? 400 : 550));
    } else if (id === 'shield') {
      entity.invulnUntil = now + a.duration;
    } else if (id === 'fireball') {
      this.effects.push({ type: 'fireball', x: entity.x, y: entity.y, vx: 0, vy: 0, dir: normalize(tx - entity.x, ty - entity.y), speed: a.speed, caster: entity, createdAt: now, maxLife: 1500, damage: a.damage, radius: a.radius });
    } else if (id === 'meteor') {
      this.effects.push({ type: 'meteor', x: tx, y: ty, caster: entity, createdAt: now, telegraph: a.telegraph, impacted: false, damage: a.damage, radius: a.radius });
    } else if (id === 'lightning') {
      let best = null, bd = Infinity;
      this.state.players.forEach((e) => { if (e.alive && e !== entity && !this.isDisconnectedGhost(e)) { const d = dist(entity, e); if (d < bd) { bd = d; best = e; } } });
      const tx2 = best ? best.x : tx, ty2 = best ? best.y : ty;
      this.effects.push({ type: 'lightning', x: tx2, y: ty2, caster: entity, createdAt: now, telegraph: a.telegraph, impacted: false, damage: a.damage, radius: a.radius });
    } else if (id === 'blackhole') {
      this.effects.push({ type: 'blackhole', x: tx, y: ty, caster: entity, createdAt: now, telegraph: a.telegraph, pull: a.pull, exploded: false, damage: a.damage, radius: a.radius });
    } else if (id === 'freeze') {
      this.effects.push({ type: 'freeze', x: tx, y: ty, caster: entity, createdAt: now, telegraph: a.telegraph, active: a.duration, tickInterval: 500, lastTick: -1, damage: a.damage, radius: a.radius, slowMult: a.slowMult });
    } else if (id === 'firewave' || id === 'tsunami') {
      const dir = normalize(tx - entity.x, ty - entity.y);
      this.effects.push({ type: 'wave', originX: entity.x, originY: entity.y, dirX: dir.x, dirY: dir.y, caster: entity, createdAt: now, telegraph: a.telegraph, speed: a.speed, width: a.width, damage: a.damage, hitSet: new Set() });
    } else if (id === 'mine') {
      this.mines.push({ x: tx, y: ty, caster: entity, createdAt: now, expiresAt: now + a.lifetime, damage: a.damage, radius: a.radius, triggered: false });
    }
  }

  isDisconnectedGhost() { return false; }

  // ---------------------------------------------------------------- damage
  applyDamage(entity, amount, caster, abilityId) {
    if (!entity.alive) return;
    const now = Date.now();
    if (entity.invulnUntil > now) return;
    amount *= this.eventDamageMult;
    amount = Math.max(0, amount);

    entity._lastHitAt = now;
    const absorbed = Math.min(entity.shield, amount);
    entity.shield -= absorbed;
    const toHp = amount - absorbed;
    if (toHp > 0) entity.hp -= toHp;

    if (caster && caster !== entity) {
      if (caster.passives.includes('vampiric')) caster.hp = Math.min(this.maxHpOf(caster), caster.hp + amount * 0.12);
      if (entity.id === this.state.bossId) { if (!this._bossDamagers) this._bossDamagers = new Set(); this._bossDamagers.add(caster.id); }
    }
    if (entity.passives.includes('thorns') && caster && caster !== entity && caster.alive) {
      caster.hp = Math.max(1, caster.hp - amount * 0.15);
    }

    if (entity.hp <= 0 && entity.alive) {
      entity.alive = false;
      entity.hp = 0;
      if (caster && caster !== entity) {
        caster.kills += 1;
        caster.score += 20;
        if (caster.passives.includes('bloodlust')) { caster._speedBoostUntil = now + 5000; caster._speedBoostMult = 1.15; }
        this.grantRandomPassive(caster);
        this.broadcast('killfeed', { killer: caster.name, victim: entity.name, abilityId: abilityId || null });
      }
      this.broadcast('death', { victimId: entity.id, killerName: caster ? caster.name : null, abilityId: abilityId || null });
      if (entity.id === this.state.bossId) this.resolveBossHunt(caster);
      this.checkRoundEnd();
    }
  }

  grantRandomPassive(entity) {
    const missing = PASSIVE_IDS.filter((id) => !entity.passives.includes(id));
    if (entity.passives.length >= MAX_PASSIVE_SLOTS || !missing.length) {
      entity.hp = Math.min(MAX_HP, entity.hp + 12);
      return;
    }
    const pick = missing[Math.floor(Math.random() * missing.length)];
    entity.passives.push(pick);
    this.broadcast('passiveAcquired', { playerId: entity.id, playerName: entity.name, passiveId: pick });
  }

  // ---------------------------------------------------------------- ability upgrade offers
  offerUpgrades() {
    this.state.players.forEach((p) => {
      if (!p.alive || p.abilities.length >= MAX_ABILITY_SLOTS) return;
      const missing = ABILITY_IDS.filter((id) => !p.abilities.includes(id));
      if (!missing.length) return;
      const options = missing.sort(() => Math.random() - 0.5).slice(0, 3);
      if (p.isBot) {
        p.abilities.push(options[Math.floor(Math.random() * options.length)]);
        return;
      }
      const client = this.clients.find((c) => c.sessionId === p.id);
      if (!client) return;
      client.send('upgradeOffer', { options });
      const timeout = setTimeout(() => {
        if (this.pendingUpgrades.has(p.id)) {
          const opts = this.pendingUpgrades.get(p.id).options;
          if (p.abilities.length < MAX_ABILITY_SLOTS) p.abilities.push(opts[0]);
          this.pendingUpgrades.delete(p.id);
        }
      }, UPGRADE_OFFER_TIMEOUT_MS);
      this.pendingUpgrades.set(p.id, { options, timeout });
    });
  }
  handleUpgradeChoice(client, msg) {
    const pending = this.pendingUpgrades.get(client.sessionId);
    const p = this.state.players.get(client.sessionId);
    if (!pending || !p) return;
    clearTimeout(pending.timeout);
    this.pendingUpgrades.delete(client.sessionId);
    const pick = pending.options.includes(msg.id) ? msg.id : pending.options[0];
    if (p.abilities.length < MAX_ABILITY_SLOTS && !p.abilities.includes(pick)) p.abilities.push(pick);
  }

  // ---------------------------------------------------------------- boss hunt
  pickBossCandidate() {
    const alive = [...this.state.players.values()].filter((p) => p.alive);
    if (alive.length < 3) return null;
    let best = null;
    alive.forEach((p) => { if (!best || p.kills > best.kills || (p.kills === best.kills && p.hp > best.hp)) best = p; });
    return best;
  }
  triggerBossHunt() {
    const cand = this.pickBossCandidate();
    if (!cand) { this.nextBossAt = Date.now() + 8000; return; }
    const now = Date.now();
    this.state.bossId = cand.id;
    this.state.bossHuntEndAt = now + BOSS_DURATION_MS;
    this._bossDamagers = new Set();
    cand.isBoss = true;
    cand.hp = Math.min(this.maxHpOf(cand), cand.hp + BOSS_HP_BONUS * 0.6);
    cand.shield = cand.maxShield;
    cand.cooldowns.set('boss_nova', 0);
    this.broadcast('bossHunt', { name: cand.name, id: cand.id });
  }
  resolveBossHunt(killer) {
    const boss = this.state.players.get(this.state.bossId);
    if (boss) boss.isBoss = false;
    if (killer && this._bossDamagers) {
      this._bossDamagers.forEach((id) => { const e = this.state.players.get(id); if (e && e.alive) e.hp = Math.min(this.maxHpOf(e), e.hp + 8); });
      this.broadcast('bossResolved', { survived: false, name: killer.name });
    }
    this.state.bossId = ''; this.state.bossHuntEndAt = 0; this._bossDamagers = null;
    this.nextBossAt = Date.now() + BOSS_COOLDOWN_MS;
  }
  bossHuntSurvived() {
    const boss = this.state.players.get(this.state.bossId);
    if (boss) { boss.isBoss = false; boss.hp = MAX_HP; boss.shield = boss.maxShield; this.broadcast('bossResolved', { survived: true, name: boss.name }); }
    this.state.bossId = ''; this.state.bossHuntEndAt = 0; this._bossDamagers = null;
    this.nextBossAt = Date.now() + BOSS_COOLDOWN_MS;
  }

  // ---------------------------------------------------------------- world events
  triggerWorldEvent() {
    if (this.state.bossId) { this.nextEventAt = Date.now() + 8000; return; }
    const id = EVENT_IDS[Math.floor(Math.random() * EVENT_IDS.length)];
    const now = Date.now();
    const durations = { double_damage: 8000, chaos: 10000, no_abilities: 4000, meteor_shower: 4500 };
    const dur = durations[id];
    this.state.eventId = id; this.state.eventUntil = now + dur;
    if (id === 'double_damage') this.eventDamageMult = 2;
    else if (id === 'chaos') this.eventCooldownMult = 0.5;
    else if (id === 'no_abilities') this.eventNoAbilitiesUntil = now + dur;
    else if (id === 'meteor_shower') {
      for (let i = 0; i < 6; i++) {
        setTimeout(() => {
          if (this.state.phase !== 'playing') return;
          this.effects.push({ type: 'meteor', x: rand(80, this.state.arenaW - 80), y: rand(80, this.state.arenaH - 80), caster: null, createdAt: Date.now(), telegraph: 900, impacted: false, damage: 24, radius: 80 });
        }, i * 550);
      }
    }
    this.broadcast('worldEvent', { id });
    this.nextEventAt = now + dur + EVENT_COOLDOWN_MS;
  }
  endEventIfDone(now) {
    if (this.state.eventId && now > this.state.eventUntil) {
      if (this.state.eventId === 'double_damage') this.eventDamageMult = 1;
      if (this.state.eventId === 'chaos') this.eventCooldownMult = 1;
      this.state.eventId = ''; this.state.eventUntil = 0;
    }
  }

  // ---------------------------------------------------------------- round end
  checkRoundEnd() {
    if (this.state.phase !== 'playing') return;
    const alive = [...this.state.players.values()].filter((p) => p.alive);
    if (alive.length <= 1) this.endMatch(alive[0] || null);
  }

  // ---------------------------------------------------------------- bots
  updateBot(p, bs, dtSec, now) {
    if (!p.alive) return;
    if (p.isBoss) {
      let target = null, bd = Infinity;
      this.state.players.forEach((e) => { if (e.alive && e !== p) { const d = dist(p, e); if (d < bd) { bd = d; target = e; } } });
      if (target) {
        const dir = normalize(target.x - p.x, target.y - p.y);
        const sp = this.effSpeed(p);
        p.vx = dir.x * sp * 0.5; p.vy = dir.y * sp * 0.5; // boss holds ground more than it chases
        if (now - bs.decisionAt > bs.decisionInterval) {
          bs.decisionAt = now;
          if (bd < 170 && (p.cooldowns.get('boss_nova') || 0) <= now) {
            this.tryCast(p, 'boss_nova', p.x, p.y);
          } else if (Math.random() < 0.14) {
            const opts = p.abilities.filter((id) => (p.cooldowns.get(id) || 0) <= now);
            if (opts.length) this.tryCast(p, opts[Math.floor(Math.random() * opts.length)], target.x, target.y);
          }
        }
      }
      return;
    }
    if (this.state.bossId && p.id !== this.state.bossId) {
      const boss = this.state.players.get(this.state.bossId);
      if (boss && boss.alive) {
        const dir = normalize(boss.x - p.x, boss.y - p.y);
        const sp = this.effSpeed(p);
        p.vx = dir.x * sp; p.vy = dir.y * sp;
        if (now - bs.decisionAt > bs.decisionInterval) {
          bs.decisionAt = now;
          if (Math.random() < 0.16) {
            const bd = dist(p, boss);
            const opts = p.abilities.filter((id) => (p.cooldowns.get(id) || 0) <= now && bd < 420);
            if (opts.length) this.tryCast(p, opts[Math.floor(Math.random() * opts.length)], boss.x, boss.y);
          }
        }
        return;
      }
    }

    const inRange = [...this.state.players.values()].filter((e) => e.alive && e !== p && dist(p, e) < 520);
    const stillValid = bs.targetId && inRange.some((e) => e.id === bs.targetId);
    if (!stillValid || !bs.retargetAt || now > bs.retargetAt) {
      bs.targetId = inRange.length ? inRange[Math.floor(Math.random() * inRange.length)].id : null;
      bs.retargetAt = now + rand(2500, 4500);
    }
    const target = bs.targetId ? inRange.find((e) => e.id === bs.targetId) : null;
    const bd = target ? dist(p, target) : Infinity;

    if (target) {
      const dir = normalize(target.x - p.x, target.y - p.y);
      const sp = this.effSpeed(p);
      if (bs.style === 'aggressive' || bd > 220) { p.vx = dir.x * sp; p.vy = dir.y * sp; }
      else { p.vx = -dir.x * sp * 0.6; p.vy = -dir.y * sp * 0.6; }

      if (now - bs.decisionAt > bs.decisionInterval) {
        bs.decisionAt = now;
        if (Math.random() < 0.14) {
          const options = p.abilities.filter((id) => {
            if ((p.cooldowns.get(id) || 0) > now) return false;
            if (id === 'shield') return p.hp < 40;
            if (id === 'freeze' || id === 'blackhole' || id === 'meteor' || id === 'lightning' || id === 'fireball' || id === 'mine') return bd < 460;
            return true;
          });
          if (options.length) {
            const pick = options[Math.floor(Math.random() * options.length)];
            let tx = target.x, ty = target.y;
            if (pick === 'shield') { tx = p.x; ty = p.y; }
            this.tryCast(p, pick, tx, ty);
          }
        }
      }
    } else {
      if (!bs.wanderTarget || now > bs.wanderUntil || dist(p, bs.wanderTarget) < 20) {
        // stay biased toward the (possibly shrinking) safe zone instead of wandering the
        // full map at random — otherwise bots walk themselves into zone damage constantly
        // and matches end from attrition instead of combat.
        const cx = this.state.arenaW / 2, cy = this.state.arenaH / 2;
        const ang = rand(0, Math.PI * 2);
        const rad = this.state.safeRadius * rand(0, 0.75);
        bs.wanderTarget = {
          x: clamp(cx + Math.cos(ang) * rad, 80, this.state.arenaW - 80),
          y: clamp(cy + Math.sin(ang) * rad, 80, this.state.arenaH - 80),
        };
        bs.wanderUntil = now + rand(1500, 3000);
      }
      const wd = normalize(bs.wanderTarget.x - p.x, bs.wanderTarget.y - p.y);
      const sp = this.effSpeed(p);
      p.vx = wd.x * sp * 0.55; p.vy = wd.y * sp * 0.55;
    }
  }

  // ---------------------------------------------------------------- main tick
  update(dtMs) {
    const now = Date.now();
    const dt = dtMs / 1000;
    if (this.state.phase !== 'playing') return;

    this.state.players.forEach((p) => {
      if (!p.alive) return;
      if (p.isBot) this.updateBot(p, this.botState.get(p.id), dt, now);
      p.x = clamp(p.x + p.vx * dt, 20, this.state.arenaW - 20);
      p.y = clamp(p.y + p.vy * dt, 20, this.state.arenaH - 20);
      if (p.shield < p.maxShield && now - (p._lastHitAt || 0) > SHIELD_REGEN_DELAY) {
        p.shield = Math.min(p.maxShield, p.shield + SHIELD_REGEN_RATE * dt);
      }
    });

    this.processEffects(now, dt);
    this.processMines(now);

    // arena shrink
    const aliveNow = [...this.state.players.values()].filter((p) => p.alive);
    if (aliveNow.length === 2 && !this.finalDuelAt) {
      this.finalDuelAt = now;
      this.broadcast('finalDuel', { a: aliveNow[0].name, b: aliveNow[1].name });
    }
    const elapsedFrac = clamp(1 - this.state.remaining / ROUND_TIME, 0, 1);
    let targetFrac = SAFE_START_FRAC + (SAFE_END_FRAC - SAFE_START_FRAC) * elapsedFrac;
    if (this.finalDuelAt) targetFrac = Math.min(targetFrac, SAFE_END_FRAC * 0.7);
    const targetRadius = Math.min(this.state.arenaW, this.state.arenaH) / 2 * targetFrac;
    this.state.safeRadius += (targetRadius - this.state.safeRadius) * Math.min(1, dt * (this.finalDuelAt ? 1.1 : 0.6));
    const center = { x: this.state.arenaW / 2, y: this.state.arenaH / 2 };
    this.state.players.forEach((p) => {
      if (!p.alive) return;
      if (dist(p, center) > this.state.safeRadius && now - (p._lastSafeTick || 0) > SAFE_TICK_MS) {
        p._lastSafeTick = now;
        this.applyDamage(p, SAFE_TICK_DMG, null);
      }
    });

    // boss hunt / events
    if (!this.state.bossId && now >= this.nextBossAt) this.triggerBossHunt();
    else if (this.state.bossId && now >= this.state.bossHuntEndAt) this.bossHuntSurvived();
    if (!this.state.eventId && !this.state.bossId && now >= this.nextEventAt) this.triggerWorldEvent();
    this.endEventIfDone(now);

    // orb
    if (this.state.orbActive) {
      this.state.players.forEach((p) => {
        if (!this.state.orbActive || !p.alive) return;
        if (dist(p, { x: this.state.orbX, y: this.state.orbY }) < 36) {
          this.grantOrbAbilities(p);
          this.state.orbActive = false;
          this.nextOrbAt = now + ORB_INTERVAL_MS;
        }
      });
      if (this.state.orbActive && now - this._orbCreatedAt > ORB_LIFETIME_MS) { this.state.orbActive = false; this.nextOrbAt = now + ORB_INTERVAL_MS; }
    } else if (now >= this.nextOrbAt) {
      this.state.orbX = rand(120, this.state.arenaW - 120);
      this.state.orbY = rand(120, this.state.arenaH - 120);
      this.state.orbActive = true;
      this._orbCreatedAt = now;
    }

    // ability upgrade offers
    if (now >= this.nextUpgradeAt) { this.offerUpgrades(); this.nextUpgradeAt = now + UPGRADE_INTERVAL_MS; }

    this.state.remaining = Math.max(0, this.state.remaining - dt);
    if (this.state.remaining <= 0) { this.checkTimeoutEnd(); }
  }

  grantOrbAbilities(p) {
    const missing = ABILITY_IDS.filter((id) => !p.abilities.includes(id));
    const room = MAX_ABILITY_SLOTS - p.abilities.length;
    if (room <= 0 || !missing.length) { p.hp = Math.min(this.maxHpOf(p), p.hp + 15); return; }
    const grant = missing.sort(() => Math.random() - 0.5).slice(0, Math.min(1, room));
    grant.forEach((id) => { p.abilities.push(id); p.cooldowns.set(id, 0); });
  }

  checkTimeoutEnd() {
    if (this.state.phase !== 'playing') return;
    const alive = [...this.state.players.values()].filter((p) => p.alive);
    const winner = alive.length === 1 ? alive[0] : null;
    this.endMatch(winner);
  }

  processMines(now) {
    this.mines = this.mines.filter((m) => {
      if (now > m.expiresAt) return false;
      if (!m.triggered) {
        this.state.players.forEach((e) => {
          if (m.triggered || !e.alive || e === m.caster) return;
          if (dist(e, m) < m.radius) { m.triggered = true; this.applyDamage(e, m.damage, m.caster, 'mine'); this.broadcast('impact', { type: 'mine', x: m.x, y: m.y }); }
        });
      }
      return !m.triggered;
    });
  }

  processEffects(now, dtSec) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const fx = this.effects[i];
      const elapsed = Math.max(0, now - fx.createdAt);

      if (fx.type === 'meteor' || fx.type === 'lightning') {
        if (elapsed >= fx.telegraph && !fx.impacted) {
          fx.impacted = true;
          this.state.players.forEach((e) => { if (e.alive && dist(e, fx) < fx.radius) this.applyDamage(e, fx.damage, fx.caster, fx.type); });
          this.broadcast('impact', { type: fx.type, x: fx.x, y: fx.y, radius: fx.radius });
        }
        if (elapsed > fx.telegraph + 300) this.effects.splice(i, 1);

      } else if (fx.type === 'blackhole') {
        if (elapsed >= fx.telegraph && !fx.exploded) {
          fx.exploded = true;
          this.state.players.forEach((e) => { if (e.alive && dist(e, fx) < fx.radius) this.applyDamage(e, fx.damage, fx.caster, 'blackhole'); });
          this.broadcast('impact', { type: 'blackhole', x: fx.x, y: fx.y, radius: fx.radius });
        } else if (elapsed < fx.telegraph) {
          this.state.players.forEach((e) => {
            if (!e.alive) return;
            const d = dist(e, fx);
            if (d < 200 && d > 4) { const dir = normalize(fx.x - e.x, fx.y - e.y); e.x += dir.x * 140 * dtSec; e.y += dir.y * 140 * dtSec; }
          });
        }
        if (elapsed > fx.telegraph + 300) this.effects.splice(i, 1);

      } else if (fx.type === 'freeze') {
        if (elapsed >= fx.telegraph) {
          const active = elapsed - fx.telegraph;
          const tickIdx = Math.floor(active / fx.tickInterval);
          if (tickIdx > fx.lastTick && tickIdx * fx.tickInterval < fx.active) {
            fx.lastTick = tickIdx;
            this.state.players.forEach((e) => { if (e.alive && dist(e, fx) < fx.radius) { this.applyDamage(e, fx.damage, fx.caster, 'freeze'); e._slowUntil = now + fx.tickInterval + 100; e._slowMult = fx.slowMult; } });
          }
          if (elapsed > fx.telegraph + fx.active + 150) this.effects.splice(i, 1);
        }

      } else if (fx.type === 'wave') {
        const frontElapsed = elapsed - fx.telegraph;
        if (frontElapsed >= 0) {
          const front = fx.speed * (frontElapsed / 1000);
          this.state.players.forEach((e) => {
            if (!e.alive || fx.hitSet.has(e.id)) return;
            const s = (e.x - fx.originX) * fx.dirX + (e.y - fx.originY) * fx.dirY;
            if (Math.abs(s - front) <= fx.width / 2) { fx.hitSet.add(e.id); this.applyDamage(e, fx.damage, fx.caster, 'wave'); }
          });
          if (front > Math.sqrt(this.state.arenaW ** 2 + this.state.arenaH ** 2) + fx.width) this.effects.splice(i, 1);
        }

      } else if (fx.type === 'fireball') {
        fx.x += fx.dir.x * fx.speed * dtSec;
        fx.y += fx.dir.y * fx.speed * dtSec;
        let hit = false;
        this.state.players.forEach((e) => {
          if (hit || !e.alive || e === fx.caster) return;
          if (dist(e, fx) < 24) { this.applyDamage(e, fx.damage, fx.caster, 'fireball'); hit = true; }
        });
        if (hit || elapsed > fx.maxLife || fx.x < -40 || fx.x > this.state.arenaW + 40 || fx.y < -40 || fx.y > this.state.arenaH + 40) this.effects.splice(i, 1);
      }
    }

    // apply slow multiplier as a velocity dampener (read by movement already applied this tick)
    this.state.players.forEach((p) => {
      if (p._slowUntil && p._slowUntil > now) { p.vx *= p._slowMult; p.vy *= p._slowMult; }
    });
  }
}
