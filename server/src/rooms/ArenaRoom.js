import colyseus from 'colyseus';
const { Room } = colyseus;
import { ArenaState, Player, Prop } from '../schema/state.js';
import {
  HEROES, HERO_IDS, NORMAL_IDS, PICKS_REQUIRED, LEGENDS, LEGEND_IDS, MYTHICS, MYTHIC_IDS, FUSIONS, ABILITIES,
  STATUS_MS, STATUS_LIST, BURN_DPS, POISON_DPS, CHILL_SLOW, WET_SLOW,
  MAX_HP, MAX_SHIELD, CHAMPION_HP_BONUS, CHAMPION_DMG_MULT, CHAMPION_MIN_KILLS,
  SHIELD_REGEN_DELAY, SHIELD_REGEN_RATE, PLAYER_SPEED, PLAYER_RADIUS, defOf,
} from '../abilities.js';
import { MAP_W, MAP_H, LAYOUT, mapPayload, resolveCircle, solidsWith, inWater, inBush, randomOpenPoint } from '../map.js';
import { ARMY, MATCH } from '../army.js';
import { armyMixin } from './army.js';
import { domainMixin } from './domain.js';
import { matchMixin } from './match.js';
import { castMixin } from './cast.js';
import { simMixin } from './sim.js';
import { systemsMixin } from './systems.js';
import { botMixin } from './bots.js';
import { dist, clamp, pick, normalize, shuffle, BOSS_HP } from './util.js';

const TICK_MS = 50;
const BOT_FILL_WAIT_MS = 7000;
const SAFE_END_RADIUS = 250;
const SAFE_TICK_DMG = 6;
const SAFE_TICK_MS = 700;
const PROP_HP = 30;
const PICKUP_HEAL = 22;

const BOT_NAMES = ['المارد', 'الشبح', 'الغول', 'الفينيق', 'الذئب', 'الفارس', 'الكاهن', 'الصياد', 'العقرب', 'النسر'];
const DISABLING = ['stun', 'airborne', 'timestop', 'polymorph'];
const CC_STATUSES = ['root', 'stun', 'airborne', 'polymorph', 'timestop', 'silence', 'inverted', 'slowtime'];

function sanitizeLoadout(o) {
  const hero = HERO_IDS.includes(o && o.hero) ? o.hero : pick(HERO_IDS);
  let picks = Array.isArray(o && o.picks) ? [...new Set(o.picks.filter((id) => NORMAL_IDS.includes(id)))] : [];
  if (picks.length !== PICKS_REQUIRED) picks = shuffle(NORMAL_IDS).slice(0, PICKS_REQUIRED);
  const legend = LEGEND_IDS.includes(o && o.legend) ? o.legend : pick(LEGEND_IDS);
  return { hero, picks, legend };
}

export class ArenaRoom extends Room {
  maxClients = 6;

  onCreate(options) {
    this.setState(new ArenaState());
    this.state.mode = options && options.mode === 'duo' ? 'duo' : 'solo';
    this.state.arenaW = MAP_W;
    this.state.arenaH = MAP_H;
    LAYOUT.props.forEach((lp) => {
      const pr = new Prop(); pr.id = lp.id; pr.kind = lp.kind; pr.x = lp.x; pr.y = lp.y; pr.hp = PROP_HP; pr.alive = true;
      this.state.props.push(pr);
    });
    this.botState = new Map();
    this.loadouts = new Map();
    this.effects = [];
    this.projectiles = [];
    this.traps = [];
    this.pickups = [];
    this.zones = [];
    this.summons = [];
    this.drops = [];
    this.nextPid = 1;
    this.nextZid = 1;
    this.botFillTimer = null;
    this.restartTimer = null;
    this.eventDamageMult = 1;
    this.eventCooldownMult = 1;
    this.roundTime = MATCH.roundTime;
    if (process.env.CIO_FAST) Object.assign(MATCH, { roundTime: 35, finalTime: 70, growthMs: 3000, targetMs: 8000 }, process.env.CIO_ROUNDS ? { rounds: Number(process.env.CIO_ROUNDS) } : {}); // local testing only
    this.stageTimer = null;
    this.initArmy();

    this.onMessage('input', (c, m) => this.handleInput(c, m));
    this.onMessage('cast', (c, m) => this.handleCast(c, m));
    this.onMessage('upgrade', (c, m) => this.handleUpgrade(c, m));
    this.onMessage('target', (c, m) => this.toggleTarget(this.state.players.get(c.sessionId), m && m.id));
    this.onMessage('getMap', (c) => c.send('map', mapPayload()));
    this.setSimulationInterval((dt) => this.update(dt), TICK_MS);
  }

  onJoin(client, options) {
    const lo = sanitizeLoadout(options);
    const p = new Player();
    p.id = client.sessionId;
    p.name = (options && options.name ? String(options.name).slice(0, 16) : '') || 'لاعب';
    p.isBot = false;
    this.loadouts.set(p.id, lo);
    this.resetPlayer(p);
    p.team = this.pickTeam();
    p.slot = this.pickSlot();
    if (this.state.phase !== 'waiting') { p.alive = false; p.hp = 0; }
    this.state.players.set(p.id, p);
    if (this.state.phase === 'waiting') this.checkStart();
  }

  onLeave(client) {
    const leaving = this.state.players.get(client.sessionId);
    if (leaving) { this.removeUnitsOf(leaving); if (this.state.activeDomainPlayer === leaving.id) this.endDomain('owner'); }
    this.state.players.delete(client.sessionId);
    this.loadouts.delete(client.sessionId);
    if (this.state.championId === client.sessionId) this.state.championId = '';
    if (this.state.phase === 'playing') this.checkRoundEnd();
    if (this.state.phase === 'waiting') this.checkStart();
    if (this.state.phase !== 'waiting' && !this.hasHumans()) this.backToWaiting();
  }

  pickSlot() {
    const used = new Set([...this.state.players.values()].map((p) => p.slot));
    for (let i = 0; i < 8; i++) if (!used.has(i)) return i;
    return 0;
  }

  // duo: three teams of two
  pickTeam() {
    if (this.state.mode !== 'duo') return 0;
    const counts = { 1: 0, 2: 0, 3: 0 };
    this.state.players.forEach((p) => { if (p.kind !== 'boss' && counts[p.team] !== undefined) counts[p.team]++; });
    return Number(Object.keys(counts).sort((a, b) => counts[a] - counts[b])[0]);
  }

  fighters() { return [...this.state.players.values()].filter((p) => p.kind !== 'boss'); }
  liveProps() { return this.state.props.filter((pr) => pr.alive); }
  isEnemy(a, b) {
    if (a && (a.kind === 'summon' || a.kind === 'unit')) a = a.owner;
    if (b && (b.kind === 'summon' || b.kind === 'unit')) b = b.owner;
    return !!a && !!b && a !== b && (a.team === 0 || b.team === 0 || a.team !== b.team);
  }

  resetPlayer(p) {
    const lo = this.loadouts.get(p.id);
    p.hero = lo.hero;
    p.legend = lo.legend;
    p.mythic = ''; p.fusion = ''; p.bonus = '';
    p.abilities.clear(); lo.picks.forEach((id) => p.abilities.push(id));
    p.passives.clear(); p.passives.push(HEROES[lo.hero].passive);
    p.hp = MAX_HP; p.maxHp = MAX_HP; p.shield = MAX_SHIELD; p.maxShield = MAX_SHIELD;
    p.alive = true; p.kills = 0; p.score = 0; p.invulnUntil = 0; p.fx = ''; p.hidden = false;
    p.ghost = false; p.curseReady = false; p.upgrades = ''; p.upgradeOffer = ''; p.bounty = 0; p.kind = '';
    Array.from(p.cooldowns.keys()).forEach((k) => p.cooldowns.delete(k));
    p._st = {}; p._mx = 0; p._my = 0; p._kbx = 0; p._kby = 0; p._hist = []; p._up = {}; p._pendingUpgrades = 0;
    p._healUntil = 0; p._speedUntil = 0; p._speedMult = 1; p._empowerUntil = 0; p._lastHitAt = 0; p._recentKills = [];
    p._dmgBuffUntil = 0; p._dmgBuffMult = 1; p._bossBuff = false; p._bossKill = false; p._killerId = ''; p._offerAt = 0;
    p._dmgBy = {}; p._rallyUntil = 0; p._roundStartPower = ARMY.startPower; p._roundGain = 0; p._roundUnlocks = [];
    p.power = ARMY.startPower; p.targets = ''; p.roundWins = 0;
    this.placePlayer(p);
  }
  placePlayer(p) {
    const spot = randomOpenPoint(Math.random, MAP_W / 2, MAP_H / 2, 560);
    p.x = spot.x; p.y = spot.y; p.vx = 0; p.vy = 0;
  }

  // ---------------------------------------------------------------- lobby
  checkStart() {
    const humans = this.fighters().filter((p) => !p.isBot).length;
    if (humans === 0 || this.botFillTimer) return;
    this.state.countdown = Math.ceil(BOT_FILL_WAIT_MS / 1000);
    this.botFillTimer = setTimeout(() => this.fillWithBotsAndStart(), BOT_FILL_WAIT_MS);
  }
  fillWithBotsAndStart() {
    this.botFillTimer = null;
    if (this.state.phase !== 'waiting') return;
    if (!this.fighters().some((p) => !p.isBot)) return;
    const names = shuffle(BOT_NAMES);
    const target = this.state.mode === 'duo' ? 6 : 5;
    let i = 0;
    while (this.fighters().length < target) {
      const id = 'bot_' + (i++) + '_' + Math.floor(Math.random() * 1e6);
      const p = new Player();
      p.id = id; p.name = names[i % names.length]; p.isBot = true;
      this.loadouts.set(id, sanitizeLoadout({}));
      this.resetPlayer(p);
      p.team = this.pickTeam();
      p.slot = this.pickSlot();
      this.state.players.set(id, p);
      this.botState.set(id, { decisionAt: 0, targetId: null, retargetAt: 0, wander: null, wanderUntil: 0, style: Math.random() < 0.5 ? 'aggressive' : 'cautious', strafe: Math.random() < 0.5 ? 1 : -1 });
    }
    this.startMatch();
  }

  // ---------------------------------------------------------------- input
  handleInput(client, msg) {
    const p = this.state.players.get(client.sessionId);
    if (!p || (!p.alive && !p.ghost)) return;
    const mx = clamp(Number(msg.mx) || 0, -1, 1), my = clamp(Number(msg.my) || 0, -1, 1);
    const l = Math.hypot(mx, my);
    p._mx = l > 1 ? mx / l : mx; p._my = l > 1 ? my / l : my;
  }
  handleCast(client, msg) {
    const p = this.state.players.get(client.sessionId);
    if (!p || this.state.phase !== 'playing') return;
    const tx = Number(msg.tx), ty = Number(msg.ty);
    const id = String(msg.abilityId);
    if (!p.alive) { if (id === 'curse' && p.ghost && p.curseReady) this.castCurse(p); return; }
    if (id === 'summon1' || id === 'summon2') { this.trySummon(p, id === 'summon1' ? 1 : 2); return; }
    if (id === 'domain') { this.tryDomain(p); return; }
    this.tryCast(p, id, Number.isFinite(tx) ? tx : p.x, Number.isFinite(ty) ? ty : p.y);
  }
  handleUpgrade(client, msg) {
    const p = this.state.players.get(client.sessionId);
    if (!p || !p.upgradeOffer) return;
    const id = String(msg.id);
    if (p.upgradeOffer.split(',').includes(id)) this.applyUpgrade(p, id);
  }

  // ---------------------------------------------------------------- stats
  has(p, s, now = Date.now()) { return (p._st[s] || 0) > now; }
  isChampion(p) { return p && p.id === this.state.championId; }
  upLvl(p, id) { return (p._up && p._up[id]) || 0; }
  maxHpOf(p) {
    if (p.kind === 'unit') return p.maxHp;
    if (p.kind === 'boss') return BOSS_HP;
    return MAX_HP + (this.isChampion(p) ? CHAMPION_HP_BONUS : 0) + 25 * this.upLvl(p, 'hp');
  }
  refreshMaxHp(p) { const m = this.maxHpOf(p); p.maxHp = m; if (p.hp > m) p.hp = m; }
  heal(p, amount) { if (!p.alive) return; p.hp = Math.min(this.maxHpOf(p), p.hp + amount * (this.has(p, 'poison') ? 0.5 : 1)); }
  timeStopped(p, now = Date.now()) { return this.state.timeStopUntil > now && p && (p.kind === 'unit' || p.kind === 'summon' ? p.owner.id : p.id) !== this.state.timeStopBy; }
  cooldownMult(p) {
    const dom = this.activeDomain();
    return this.eventCooldownMult * (p.passives.includes('quickhands') ? 0.85 : 1) * (1 - 0.12 * this.upLvl(p, 'cdr')) * (dom && dom.owner === p ? dom.def.ownerCdr || 1 : 1);
  }

  tryCast(p, id, tx, ty) {
    const a = defOf(id);
    if (!a || id === 'curse' || p.kind === 'boss') return false;
    const testAll = process.env.CIO_TEST_ALL && !p.isBot; // local test hook: lets a test client cast everything
    const isBonus = p.bonus === id && !!LEGENDS[id];
    if (!testAll && !isBonus) {
      if (LEGENDS[id] && p.legend !== id) return false;
      if (MYTHICS[id] && p.mythic !== id) return false;
      if (FUSIONS[id] && p.fusion !== id) return false;
      if (ABILITIES[id] && !p.abilities.includes(id)) return false;
    }
    const now = Date.now();
    if (now < this.state.matchReadyAt) return false;
    if (DISABLING.some((s) => this.has(p, s, now))) return false;
    if (this.has(p, 'silence', now) && id !== 'strike') return false;
    if ((a.kind === 'dash' || id === 'space_portal') && this.has(p, 'root', now)) return false;
    if (isBonus) p.bonus = '';
    else {
      if ((p.cooldowns.get(id) || 0) > now) return false;
      p.cooldowns.set(id, now + a.cooldown * this.cooldownMult(p));
    }
    if (a.range && a.kind !== 'dash' && a.kind !== 'proj') {
      const d = Math.hypot(tx - p.x, ty - p.y);
      if (d > a.range) { const n = normalize(tx - p.x, ty - p.y); tx = p.x + n.x * a.range; ty = p.y + n.y * a.range; }
    }
    if (this.has(p, 'stealth', now) && id !== 'smoke_bomb') p._st.stealth = 0; // attacking breaks stealth
    const ox = p.x, oy = p.y;
    const res = this.performCast(p, id, a, tx, ty, now) || {};
    this.broadcast('cast', { casterId: p.id, abilityId: id, x: ox, y: oy, tx: res.tx ?? tx, ty: res.ty ?? ty, pids: res.pids, bonus: isBonus });
    return true;
  }

  enemiesNear(p, x, y, r, heroesOnly) {
    const out = [];
    this.forTargets((e) => { if (e.alive && (!heroesOnly || e.kind !== 'unit') && this.isEnemy(p, e) && Math.hypot(e.x - x, e.y - y) < r) out.push(e); });
    return out;
  }
  nearestEnemyTo(p, x, y, maxFromCaster, heroesOnly) {
    let best = null, bd = Infinity;
    this.forTargets((e) => {
      if (!e.alive || (heroesOnly && e.kind === 'unit') || !this.isEnemy(p, e) || dist(e, p) > maxFromCaster) return;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < bd) { bd = d; best = e; }
    });
    return best;
  }

  areaHit(x, y, r, caster, fn) {
    this.forTargets((e) => { if (e.alive && (!caster || this.isEnemy(caster, e)) && Math.hypot(e.x - x, e.y - y) < r + this.radiusOf(e)) fn(e); });
    this.liveProps().forEach((pr) => { if (Math.hypot(pr.x - x, pr.y - 16 - y) < r + 16) this.damageProp(pr, 30); });
  }

  knock(e, dir, force) {
    if (e.invulnUntil > Date.now()) return;
    const k = e.kind === 'boss' ? 0.25 : 1;
    e._kbx = dir.x * force * 4 * k; e._kby = dir.y * force * 4 * k;
  }

  // ---------------------------------------------------------------- damage, statuses, combos
  dealDamage(t, amount, caster, source) {
    if (!t.alive) return false;
    if (caster && caster !== t && !this.isEnemy(caster, t)) return true;
    const now = Date.now();
    if (t.invulnUntil > now) return true;
    let dmg = amount * this.eventDamageMult;
    const fromAbility = !['burn', 'poison', 'zone', 'snap', 'onfire', 'unit'].includes(source);
    if (caster && caster.kind === 'unit') {
      if (source === 'unit' || source === 'ushot') dmg *= this.unitDamageMult(caster, now);
      if (t.kind !== 'unit') dmg *= ARMY.heroDamageMult;
    }
    if (t.kind === 'unit') dmg *= 1 - this.unitArmor(t);
    if (caster && caster.kind !== 'unit' && this.isDomainOwner(caster) && fromAbility) dmg *= this.activeDomain().def.ownerDmg || 1;
    if (caster && caster !== t && fromAbility) {
      if (caster.passives.includes('crit') && Math.random() < 0.2) { dmg *= 1.6; this.broadcast('crit', { x: t.x, y: t.y }); }
      if (caster._empowerUntil > now && source !== 'combo') { dmg *= 1.4; caster._empowerUntil = 0; caster._st.empower = 0; }
      if (this.has(caster, 'berserk', now)) dmg *= 1.35;
      if (this.has(caster, 'weak', now)) dmg *= 0.7;
      if (this.has(caster, 'rampage', now)) dmg *= 1.2;
      if (caster._dmgBuffUntil > now) dmg *= caster._dmgBuffMult;
      if (caster._bossBuff) dmg *= 1.3;
      dmg *= 1 + 0.15 * this.upLvl(caster, 'dmg');
      if (this.isChampion(caster)) dmg *= CHAMPION_DMG_MULT;
      if (this.has(t, 'mark', now) && !['combo', 'hunter_mark', 'fate_arrow', 'death_mark'].includes(source)) {
        t._st.mark = 0; dmg += 14; this.broadcast('combo', { id: 'mark', x: t.x, y: t.y });
      }
    }
    if (this.has(t, 'berserk', now)) dmg *= 1.15;
    if (this.has(t, 'polymorph', now)) dmg *= 1.25;
    if (t.passives.includes('stoneskin')) dmg *= 0.85;
    if (t.passives.includes('laststand') && t.hp / this.maxHpOf(t) < 0.3) dmg *= 0.8;
    dmg *= 1 - 0.1 * this.upLvl(t, 'armor');
    dmg = Math.max(0, dmg);

    t._lastHitAt = now;
    if (caster && caster !== t) {
      t._lastHitBy = caster.id;
      const co = this.ownerOf(caster);
      if (t._dmgBy && co && co.id) t._dmgBy[co.id] = now;
    }
    const absorbed = source === 'snap' ? 0 : Math.min(t.shield, dmg);
    t.shield -= absorbed;
    t.hp -= (dmg - absorbed);

    if (caster && caster !== t && caster.alive) {
      let steal = 0;
      if (caster.passives.includes('vampiric') && fromAbility) steal += 0.12;
      if (this.has(caster, 'lifesteal', now)) steal += 0.4;
      steal += 0.06 * this.upLvl(caster, 'vamp');
      if (steal > 0) this.heal(caster, dmg * steal);
      if (t.passives.includes('thorns') && fromAbility) caster.hp = Math.max(1, caster.hp - dmg * 0.15);
      if (caster.passives.includes('frosttouch') && fromAbility && source !== 'combo' && Math.random() < 0.25 && t.hp > 0) this.applyStatus(t, 'chill', caster);
    }
    if (t.hp <= 0 && t.alive) {
      if (t.kind === 'unit') { this.killUnit(t, caster); return false; }
      if (this.has(t, 'phoenix', now)) { this.phoenixRevive(t, now); return true; }
      this.kill(t, caster); return false;
    }
    return true;
  }

  phoenixRevive(t, now) {
    t._st.phoenix = 0;
    t.hp = this.maxHpOf(t) * 0.5;
    t.invulnUntil = now + 1200;
    this.broadcast('phoenix', { id: t.id, x: t.x, y: t.y });
    this.areaHit(t.x, t.y, 170, t, (e) => { if (this.dealDamage(e, 20, t, 'phoenix_rebirth')) this.applyStatus(e, 'burn', t); });
  }

  kill(t, caster) {
    const now = Date.now();
    if (caster && (caster.kind === 'unit' || caster.kind === 'summon')) caster = caster.owner;
    if (t.kind === 'boss') { this.killBoss(t, caster); return; }
    const wasChampion = this.isChampion(t);
    const victimBounty = t.bounty;
    t.alive = false; t.hp = 0; t.vx = 0; t.vy = 0; t.fx = ''; t.upgradeOffer = ''; t.bounty = 0;
    t.ghost = !t.isBot && this.state.phase === 'playing';
    t.curseReady = t.ghost && !!caster && caster !== t;
    t._killerId = caster ? caster.id : '';
    t._mx = 0; t._my = 0;
    this.onOwnerDown(t, now);
    if (this.state.activeDomainPlayer === t.id) this.endDomain('owner');
    // Army Power: killer, assists, champion slayer
    if (caster && caster !== t && caster.kind !== 'boss') {
      this.addPower(caster, ARMY.gains.kill + (wasChampion ? ARMY.gains.champKill : 0), wasChampion ? 'champKill' : 'kill');
      Object.entries(t._dmgBy || {}).forEach(([id, at]) => {
        const a = this.state.players.get(id);
        if (a && a !== caster && a !== t && now - at < 6000 && this.isEnemy(a, t)) this.addPower(a, ARMY.gains.assist, 'assist');
      });
    }
    if (caster && caster !== t && caster.alive && caster.kind !== 'boss') {
      caster.kills += 1; caster.score += 20;
      if (caster.passives.includes('bloodlust')) { caster._speedUntil = now + 5000; caster._speedMult = 1.2; this.heal(caster, 12); }
      const stealable = t.passives.filter((id) => !caster.passives.includes(id));
      if (stealable.length) {
        const stolen = pick(stealable);
        caster.passives.push(stolen);
        this.broadcast('steal', { playerId: caster.id, playerName: caster.name, fromName: t.name, passiveId: stolen });
      } else this.heal(caster, 20);
      if (wasChampion) {
        const m = pick(MYTHIC_IDS.filter((x) => x !== caster.mythic));
        caster.mythic = m;
        caster.cooldowns.set(m, 0);
        this.heal(caster, 40);
        this.broadcast('mythic', { playerId: caster.id, playerName: caster.name, victimName: t.name, mythicId: m });
      }
      this.onKillRewards(caster, t, victimBounty, now);
      this.broadcast('killfeed', { killer: caster.name, victim: t.name });
    }
    if (wasChampion) this.state.championId = '';
    this.broadcast('death', { victimId: t.id, killerName: caster ? caster.name : null, killerId: caster ? caster.id : '', x: t.x, y: t.y, ghost: t.ghost });
    this.checkRoundEnd();
  }

  applyStatus(t, s, caster, ms) {
    if (!t.alive || !s) return;
    const now = Date.now();
    if (t.invulnUntil > now) return;
    if (t.kind === 'boss' && CC_STATUSES.includes(s)) return;
    if (t.kind === 'unit') { t._st[s] = now + (ms || STATUS_MS[s]); if (s === 'burn') t._burnBy = caster; if (s === 'poison') t._dotBy = caster; return; } // soldiers: no combo spam
    const has = (k) => this.has(t, k, now);
    const combo = (id, dmg, after) => {
      this.broadcast('combo', { id, x: t.x, y: t.y });
      if (dmg && !this.dealDamage(t, dmg, caster, 'combo')) return;
      if (after) after();
    };
    const spread = (status, byKey) => this.state.players.forEach((e) => {
      if (e !== t && e.alive && (!caster || this.isEnemy(caster, e)) && dist(e, t) < 170) { e._st[status] = now + STATUS_MS[status]; e[byKey] = caster; }
    });
    const stun = (ms2) => { if (t.kind !== 'boss') t._st.stun = now + ms2; };
    const pair = (a, b) => (s === a && has(b)) || (s === b && has(a));
    if (pair('shock', 'wet')) { t._st.wet = 0; t._st.shock = 0; return combo('electro', 20, () => stun(1100)); }
    if (pair('chill', 'wet')) { t._st.wet = 0; t._st.chill = 0; return combo('freeze', 8, () => stun(1500)); }
    if (s === 'chill' && has('chill')) { t._st.chill = 0; return combo('freeze', 8, () => stun(1200)); }
    if (pair('chill', 'burn')) { t._st.burn = 0; t._st.chill = 0; return combo('shatter', 24); }
    if (pair('burn', 'wet')) { t._st.burn = 0; t._st.wet = 0; return combo('steam', 12); }
    if (pair('poison', 'burn')) { t._st.burn = 0; t._st.poison = 0; return combo('toxic', 16, () => spread('poison', '_dotBy')); }
    if (pair('airborne', 'burn')) return combo('firestorm', 14, () => spread('burn', '_burnBy'));
    if (pair('shock', 'poison')) { t._st.shock = 0; return combo('neurotoxin', 10, () => { if (t.kind !== 'boss') t._st.silence = now + 1800; }); }
    if (pair('weak', 'mark')) { t._st.weak = 0; t._st.mark = 0; return combo('execute', 22); }
    t._st[s] = now + (ms || STATUS_MS[s]);
    if (s === 'burn') t._burnBy = caster;
    if (s === 'poison') t._dotBy = caster;
  }

  damageProp(pr, amount) {
    if (!pr.alive) return;
    pr.hp -= amount;
    if (pr.hp <= 0) {
      pr.alive = false;
      this.pickups.push({ x: pr.x, y: pr.y - 14 });
      this.syncPickups();
      this.broadcast('propBreak', { id: pr.id, x: pr.x, y: pr.y, kind: pr.kind });
    }
  }
  syncPickups() { this.state.pickups = this.pickups.map((k) => `${Math.round(k.x)}:${Math.round(k.y)}`).join(';'); }

  // ---------------------------------------------------------------- champion
  updateChampion() {
    let best = null;
    this.fighters().forEach((p) => {
      if (!p.alive || p.kills < CHAMPION_MIN_KILLS) return;
      if (!best || p.kills > best.kills || (p.kills === best.kills && p.hp > best.hp)) best = p;
    });
    const cur = this.state.players.get(this.state.championId);
    if (this.state.stage === 'final' || this.state.phase !== 'playing') return;
    if (cur && cur.alive && this.roundChampionId === cur.id) return; // round-start champion keeps the title until defeated
    if (cur && cur.alive && best && best.kills <= cur.kills) best = cur;
    const id = best ? best.id : '';
    if (id === this.state.championId) return;
    this.state.championId = id;
    if (cur) this.refreshMaxHp(cur);
    if (best) {
      this.refreshMaxHp(best);
      best.hp = Math.min(best.maxHp, best.hp + CHAMPION_HP_BONUS);
      this.broadcast('champion', { id: best.id, name: best.name, kills: best.kills });
    }
  }

  // ---------------------------------------------------------------- main tick
  effSpeed(p, now) {
    if (['stun', 'root', 'airborne', 'timestop'].some((s) => this.has(p, s, now))) return 0;
    if (p.kind === 'boss') return 120 * (this.has(p, 'chill', now) ? 0.75 : 1);
    let m = 1;
    if (p.passives.includes('swift')) m *= 1.12;
    if (p._speedUntil > now) m *= p._speedMult;
    if (this.has(p, 'berserk', now)) m *= 1.2;
    if (this.has(p, 'rampage', now)) m *= 1.15;
    m *= 1 + 0.08 * this.upLvl(p, 'speed');
    if (p.passives.includes('laststand') && p.hp / this.maxHpOf(p) < 0.3) m *= 1.25;
    if (this.has(p, 'chill', now)) m *= CHILL_SLOW;
    else if (this.has(p, 'wet', now)) m *= WET_SLOW;
    if (this.has(p, 'polymorph', now)) m *= 0.75;
    if (this.has(p, 'slowtime', now)) m *= 0.3;
    if (p.inWater) m *= this.pondsFrozen() ? 1.3 : 0.7;
    m *= this.domainSpeedMult(p);
    return PLAYER_SPEED * m;
  }

  update(dtMs) {
    if (this.state.phase !== 'playing') return;
    const now = Date.now();
    const dt = dtMs / 1000;
    const props = this.liveProps();
    this._solids = solidsWith(props);
    if (this.state.timeStopUntil && now > this.state.timeStopUntil) { this.state.timeStopBy = ''; this.state.timeStopUntil = 0; }

    this.tickWorldEvent(now);
    this.tickDomain(now, dt);
    this.tickZonesContinuous(now, dt);

    this.state.players.forEach((p) => {
      if (!p.alive) {
        if (p.ghost) {
          p.x = clamp(p.x + p._mx * 260 * dt, 20, MAP_W - 20); p.y = clamp(p.y + p._my * 260 * dt, 20, MAP_H - 20);
          p.vx = p._mx * 260; p.vy = p._my * 260;
        }
        return;
      }
      if (p.kind === 'boss') { if (!this.timeStopped(p, now)) this.updateBoss(p, now); }
      else if (p.isBot && !this.timeStopped(p, now)) this.updateBot(p, this.botState.get(p.id), now);
      const sp = now < this.state.matchReadyAt ? 0 : this.effSpeed(p, now);
      const inv = this.has(p, 'inverted', now) ? -1 : 1;
      p.vx = p._mx * sp * inv; p.vy = p._my * sp * inv;
      if (!this.timeStopped(p, now)) {
        p.x += (p.vx + p._kbx) * dt; p.y += (p.vy + p._kby) * dt;
        p._kbx *= 0.72; p._kby *= 0.72;
        if (Math.abs(p._kbx) < 5) p._kbx = 0;
        if (Math.abs(p._kby) < 5) p._kby = 0;
      } else { p.vx = 0; p.vy = 0; }
      resolveCircle(p, p.kind === 'boss' ? 24 : PLAYER_RADIUS, props, this._solids);

      p.inWater = inWater(p.x, p.y);
      if (p.inWater && !this.pondsFrozen() && !(this.activeDomain() || { def: {} }).def.noWater && !this.has(p, 'wet', now)) this.applyStatus(p, 'wet', null);
      if (!p.alive) return;
      p.hidden = inBush(p.x, p.y) || this.has(p, 'stealth', now);

      if (!p._hist.length || now - p._hist[p._hist.length - 1].t >= 100) {
        p._hist.push({ t: now, x: p.x, y: p.y, hp: p.hp, shield: p.shield });
        while (p._hist.length && now - p._hist[0].t > 3300) p._hist.shift();
      }

      if (p._healUntil > now) this.heal(p, p._healRate * dt);
      if (p.passives.includes('regen') && now - p._lastHitAt > 3000) this.heal(p, 3 * dt);
      const rg = this.upLvl(p, 'regen'); if (rg) this.heal(p, 2 * rg * dt);
      if (p.kind !== 'boss' && p.shield < p.maxShield && now - p._lastHitAt > SHIELD_REGEN_DELAY) p.shield = Math.min(p.maxShield, p.shield + SHIELD_REGEN_RATE * dt);
      if (now - (p._lastDotTick || 0) > 500) {
        p._lastDotTick = now;
        if (this.has(p, 'burn', now) && !this.dealDamage(p, BURN_DPS / 2, p._burnBy, 'burn')) return;
        if (this.has(p, 'poison', now) && !this.dealDamage(p, POISON_DPS / 2, p._dotBy, 'poison')) return;
        if (this.has(p, 'onfire', now)) this.enemiesNear(p, p.x, p.y, 80).forEach((e) => { if (this.dealDamage(e, 3, p, 'onfire') && Math.random() < 0.3) this.applyStatus(e, 'burn', p); });
      }

      if (p.kind !== 'boss') {
        const k = this.pickups.findIndex((q) => dist(p, q) < 34);
        if (k >= 0 && p.hp < this.maxHpOf(p)) {
          const q = this.pickups.splice(k, 1)[0]; this.syncPickups();
          this.heal(p, PICKUP_HEAL);
          this.broadcast('impact', { type: 'heal', x: q.x, y: q.y });
        }
      }
    });

    this.processProjectiles(now, dt);
    this.processEffects(now, dtMs);
    this.processTraps(now);
    this.tickZonesDamage(now);
    this.processSummons(now);
    this.tickArmy(now, dt);
    this.tickDrops(now);
    this.tickUpgrades(now);
    this.tickBossSpawn(now);
    this.updateChampion();

    this.state.players.forEach((p) => {
      if (!p.alive) return;
      const fx = STATUS_LIST.filter((s) => this.has(p, s, now)).join(',');
      if (fx !== p.fx) p.fx = fx;
    });

    // shrinking zone
    const alive = this.fighters().filter((p) => p.alive);
    if (alive.length === 2 && !this.finalDuelAt && this.state.mode !== 'duo' && this.state.stage !== 'final') { this.finalDuelAt = now; this.broadcast('finalDuel', { a: alive[0].name, b: alive[1].name }); }
    const startR = Math.hypot(MAP_W, MAP_H) / 2;
    const frac = clamp(1 - this.state.remaining / this.roundTime, 0, 1);
    let targetR = startR + (SAFE_END_RADIUS - startR) * Math.min(1, frac * 1.15);
    if (this.finalDuelAt) targetR = Math.max(SAFE_END_RADIUS, Math.min(targetR, this.state.safeRadius - 60 * dt * 20));
    this.state.safeRadius += (targetR - this.state.safeRadius) * Math.min(1, dt * 0.8);
    const center = { x: MAP_W / 2, y: MAP_H / 2 };
    alive.forEach((p) => {
      if (dist(p, center) > this.state.safeRadius && now - (p._lastSafeTick || 0) > SAFE_TICK_MS) {
        p._lastSafeTick = now; this.dealDamage(p, SAFE_TICK_DMG, null, 'zone');
      }
    });

    if (!this.state.eventId && !this.state.activeDomainPlayer && now >= this.nextEventAt) this.triggerWorldEvent();

    this.state.remaining = Math.max(0, this.state.remaining - dt);
    if (this.state.remaining <= 0 && this.state.phase === 'playing') {
      const al = this.fighters().filter((p) => p.alive).sort((a, b) => (b.hp - a.hp) || (b.power - a.power));
      this.endRound(al[0] || null);
    }
  }
}

Object.assign(ArenaRoom.prototype, castMixin, simMixin, systemsMixin, botMixin, armyMixin, domainMixin, matchMixin);
