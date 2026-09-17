import colyseus from 'colyseus';
const { Room } = colyseus;
import { ArenaState, Player, Prop } from '../schema/state.js';
import {
  HEROES, HERO_IDS, ABILITIES, NORMAL_IDS, PICKS_REQUIRED, LEGENDS, LEGEND_IDS, MYTHICS, MYTHIC_IDS, BASIC_ABILITY,
  STATUS_MS, BURN_DPS, POISON_DPS, CHILL_SLOW, WET_SLOW,
  MAX_HP, MAX_SHIELD, CHAMPION_HP_BONUS, CHAMPION_DMG_MULT, CHAMPION_MIN_KILLS,
  SHIELD_REGEN_DELAY, SHIELD_REGEN_RATE, PLAYER_SPEED, PLAYER_RADIUS,
} from '../abilities.js';
import { MAP_W, MAP_H, LAYOUT, mapPayload, resolveCircle, pointBlocked, propAt, inWater, inBush, randomOpenPoint } from '../map.js';

const TICK_MS = 50;
const ROUND_TIME = 180;
const GRACE_MS = 4000;
const BOT_FILL_WAIT_MS = 7000;
const RESTART_DELAY_MS = 9000;
const EVENT_FIRST_MS = 30000;
const EVENT_COOLDOWN_MS = 40000;
const SAFE_END_RADIUS = 250;
const SAFE_TICK_DMG = 6;
const SAFE_TICK_MS = 700;
const PROP_HP = 30;
const PICKUP_HEAL = 22;

const BOT_NAMES = ['المارد', 'الشبح', 'الغول', 'الفينيق', 'الذئب', 'الفارس', 'الكاهن', 'الصياد'];
const EVENT_IDS = ['double_damage', 'chaos', 'meteor_shower'];
const DISABLING = ['stun', 'airborne', 'timestop', 'polymorph'];
const STATUS_LIST = ['burn', 'chill', 'wet', 'shock', 'root', 'stun', 'mark', 'airborne', 'poison', 'slowtime', 'inverted', 'timestop', 'polymorph', 'berserk'];

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
function normalize(dx, dy) { const l = Math.hypot(dx, dy); return l < 0.0001 ? { x: 1, y: 0 } : { x: dx / l, y: dy / l }; }
function shuffle(a) { return a.slice().sort(() => Math.random() - 0.5); }

function sanitizeLoadout(o) {
  const hero = HERO_IDS.includes(o && o.hero) ? o.hero : pick(HERO_IDS);
  let picks = Array.isArray(o && o.picks) ? [...new Set(o.picks.filter((id) => NORMAL_IDS.includes(id)))] : [];
  if (picks.length !== PICKS_REQUIRED) picks = shuffle(NORMAL_IDS).slice(0, PICKS_REQUIRED);
  const legend = LEGEND_IDS.includes(o && o.legend) ? o.legend : pick(LEGEND_IDS);
  return { hero, picks, legend };
}

export class ArenaRoom extends Room {
  maxClients = 6;

  onCreate() {
    this.setState(new ArenaState());
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
    this.botFillTimer = null;
    this.restartTimer = null;
    this.eventDamageMult = 1;
    this.eventCooldownMult = 1;

    this.onMessage('input', (c, m) => this.handleInput(c, m));
    this.onMessage('cast', (c, m) => this.handleCast(c, m));
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
    if (this.state.phase === 'playing') { p.alive = false; p.hp = 0; }
    this.state.players.set(p.id, p);
    if (this.state.phase === 'waiting') this.checkStart();
  }

  onLeave(client) {
    this.state.players.delete(client.sessionId);
    this.loadouts.delete(client.sessionId);
    if (this.state.championId === client.sessionId) this.state.championId = '';
    if (this.state.phase === 'playing') this.checkRoundEnd();
    if (this.state.phase === 'waiting') this.checkStart();
  }

  liveProps() { return this.state.props.filter((pr) => pr.alive); }

  resetPlayer(p) {
    const lo = this.loadouts.get(p.id);
    p.hero = lo.hero;
    p.legend = lo.legend;
    p.mythic = '';
    p.abilities.clear(); lo.picks.forEach((id) => p.abilities.push(id));
    p.passives.clear(); p.passives.push(HEROES[lo.hero].passive);
    p.hp = MAX_HP; p.maxHp = MAX_HP; p.shield = MAX_SHIELD; p.maxShield = MAX_SHIELD;
    p.alive = true; p.kills = 0; p.score = 0; p.invulnUntil = 0; p.fx = ''; p.hidden = false;
    Array.from(p.cooldowns.keys()).forEach((k) => p.cooldowns.delete(k));
    p._st = {}; p._mx = 0; p._my = 0; p._kbx = 0; p._kby = 0; p._hist = [];
    p._healUntil = 0; p._speedUntil = 0; p._speedMult = 1; p._empowerUntil = 0; p._lastHitAt = 0;
    const spot = randomOpenPoint(Math.random, MAP_W / 2, MAP_H / 2, 560);
    p.x = spot.x; p.y = spot.y; p.vx = 0; p.vy = 0;
  }

  // ---------------------------------------------------------------- lobby
  checkStart() {
    const humans = [...this.state.players.values()].filter((p) => !p.isBot).length;
    if (humans === 0 || this.botFillTimer) return;
    this.state.countdown = Math.ceil(BOT_FILL_WAIT_MS / 1000);
    this.botFillTimer = setTimeout(() => this.fillWithBotsAndStart(), BOT_FILL_WAIT_MS);
  }
  fillWithBotsAndStart() {
    this.botFillTimer = null;
    if (this.state.phase !== 'waiting') return;
    if (![...this.state.players.values()].some((p) => !p.isBot)) return;
    const names = shuffle(BOT_NAMES);
    let i = 0;
    while (this.state.players.size < 5) {
      const id = 'bot_' + (i++) + '_' + Math.floor(Math.random() * 1e6);
      const p = new Player();
      p.id = id; p.name = names[i % names.length]; p.isBot = true;
      this.loadouts.set(id, sanitizeLoadout({}));
      this.resetPlayer(p);
      this.state.players.set(id, p);
      this.botState.set(id, { decisionAt: 0, targetId: null, retargetAt: 0, wander: null, wanderUntil: 0, style: Math.random() < 0.5 ? 'aggressive' : 'cautious', strafe: Math.random() < 0.5 ? 1 : -1 });
    }
    this.startMatch();
  }

  // ---------------------------------------------------------------- match lifecycle
  startMatch() {
    if (this.restartTimer) { clearTimeout(this.restartTimer); this.restartTimer = null; }
    const now = Date.now();
    this.state.phase = 'playing';
    this.state.remaining = ROUND_TIME;
    this.state.matchReadyAt = now + GRACE_MS;
    this.state.safeRadius = Math.hypot(MAP_W, MAP_H) / 2;
    this.state.championId = ''; this.state.timeStopBy = ''; this.state.timeStopUntil = 0;
    this.state.eventId = ''; this.state.eventUntil = 0;
    this.state.winnerId = ''; this.state.winnerName = '';
    this.effects = []; this.projectiles = []; this.traps = []; this.pickups = []; this.zones = []; this.syncPickups();
    this.eventDamageMult = 1; this.eventCooldownMult = 1;
    this.finalDuelAt = 0;
    this.nextEventAt = now + EVENT_FIRST_MS;
    this.state.props.forEach((pr) => { pr.alive = true; pr.hp = PROP_HP; });
    this.state.players.forEach((p) => this.resetPlayer(p));
    this.broadcast('matchStart', { readyInMs: GRACE_MS });
  }

  endMatch(winner) {
    if (this.state.phase !== 'playing') return;
    this.state.phase = 'ended';
    this.state.winnerId = winner ? winner.id : '';
    this.state.winnerName = winner ? winner.name : '';
    const results = [...this.state.players.values()].map((p) => {
      const status = winner && p.id === winner.id ? 'winner' : p.alive ? 'survivor' : 'eliminated';
      const pts = (status === 'winner' ? 100 : status === 'survivor' ? 40 : 0) + p.kills * 20;
      return { id: p.id, name: p.name, hero: p.hero, status, kills: p.kills, pts, isBot: p.isBot };
    }).sort((a, b) => b.pts - a.pts);
    this.broadcast('roundEnd', { results, winnerName: winner ? winner.name : null });
    this.restartTimer = setTimeout(() => {
      [...this.state.players.entries()].forEach(([id, p]) => { if (p.isBot) { this.state.players.delete(id); this.botState.delete(id); this.loadouts.delete(id); } });
      this.state.phase = 'waiting';
      if (this.state.players.size > 0) this.fillWithBotsAndStart();
    }, RESTART_DELAY_MS);
  }

  checkRoundEnd() {
    if (this.state.phase !== 'playing') return;
    const alive = [...this.state.players.values()].filter((p) => p.alive);
    if (alive.length <= 1) this.endMatch(alive[0] || null);
  }

  // ---------------------------------------------------------------- input / casting
  handleInput(client, msg) {
    const p = this.state.players.get(client.sessionId);
    if (!p || !p.alive) return;
    const mx = clamp(Number(msg.mx) || 0, -1, 1), my = clamp(Number(msg.my) || 0, -1, 1);
    const l = Math.hypot(mx, my);
    p._mx = l > 1 ? mx / l : mx; p._my = l > 1 ? my / l : my;
  }
  handleCast(client, msg) {
    const p = this.state.players.get(client.sessionId);
    if (!p || !p.alive || this.state.phase !== 'playing') return;
    const tx = Number(msg.tx), ty = Number(msg.ty);
    this.tryCast(p, String(msg.abilityId), Number.isFinite(tx) ? tx : p.x, Number.isFinite(ty) ? ty : p.y);
  }

  has(p, s, now = Date.now()) { return (p._st[s] || 0) > now; }
  isChampion(p) { return p && p.id === this.state.championId; }
  maxHpOf(p) { return MAX_HP + (this.isChampion(p) ? CHAMPION_HP_BONUS : 0); }
  heal(p, amount) { if (!p.alive) return; p.hp = Math.min(this.maxHpOf(p), p.hp + amount * (this.has(p, 'poison') ? 0.5 : 1)); }
  timeStopped(p, now = Date.now()) { return this.state.timeStopUntil > now && p && p.id !== this.state.timeStopBy; }

  defOf(id) {
    if (id === BASIC_ABILITY.id) return BASIC_ABILITY;
    return ABILITIES[id] || LEGENDS[id] || MYTHICS[id] || null;
  }

  tryCast(p, id, tx, ty) {
    const a = this.defOf(id);
    if (!a) return false;
    const testAll = process.env.CIO_TEST_ALL && !p.isBot; // local test hook: lets a test client cast everything
    if (!testAll) {
      if (LEGENDS[id] && p.legend !== id) return false;
      if (MYTHICS[id] && p.mythic !== id) return false;
      if (ABILITIES[id] && !p.abilities.includes(id)) return false;
    }
    const now = Date.now();
    if (now < this.state.matchReadyAt) return false;
    if (DISABLING.some((s) => this.has(p, s, now))) return false;
    if ((id === 'dash' || id === 'space_portal') && this.has(p, 'root', now)) return false;
    if ((p.cooldowns.get(id) || 0) > now) return false;
    const cdMult = this.eventCooldownMult * (p.passives.includes('quickhands') ? 0.85 : 1);
    p.cooldowns.set(id, now + a.cooldown * cdMult);
    if (a.range) {
      const d = Math.hypot(tx - p.x, ty - p.y);
      if (d > a.range) { const n = normalize(tx - p.x, ty - p.y); tx = p.x + n.x * a.range; ty = p.y + n.y * a.range; }
    }
    const ox = p.x, oy = p.y;
    const res = this.performCast(p, id, a, tx, ty, now) || {};
    this.broadcast('cast', { casterId: p.id, abilityId: id, x: ox, y: oy, tx: res.tx ?? tx, ty: res.ty ?? ty, ts: now });
    return true;
  }

  enemiesNear(p, x, y, r) {
    return [...this.state.players.values()].filter((e) => e.alive && e !== p && Math.hypot(e.x - x, e.y - y) < r);
  }
  nearestEnemyTo(p, x, y, maxFromCaster) {
    let best = null, bd = Infinity;
    this.state.players.forEach((e) => {
      if (!e.alive || e === p || dist(e, p) > maxFromCaster) return;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < bd) { bd = d; best = e; }
    });
    return best;
  }

  performCast(p, id, a, tx, ty, now) {
    const dir = normalize(tx - p.x, ty - p.y);
    const proj = (extra) => this.projectiles.push({ x: p.x, y: p.y - 10, dir, travelled: 0, caster: p, abilityId: id, speed: a.speed, damage: a.damage, radius: a.radius, range: a.range, applies: a.applies, ...extra });
    const strike = (x, y, extra) => this.effects.push({ type: 'strike', x, y, caster: p, at: now + (a.telegraph || 0), damage: a.damage, radius: a.radius, applies: a.applies, ...extra });

    switch (id) {
      case 'strike': case 'ice_shard': case 'hunter_mark': case 'poison_dagger': proj({}); break;
      case 'fireball': proj({ splash: a.splash }); break;
      case 'vine_pull': proj({ pull: a.pull, rootMs: a.rootMs }); break;
      case 'boomerang': proj({ pierce: true, hit: new Set(), boomerang: true, returning: false }); break;
      case 'fate_arrow': proj({ pierce: true, hit: new Set(), delayUntil: now + a.telegraph }); break;
      case 'lightning': strike(tx, ty, { impact: 'lightning' }); break;
      case 'earth_prison': strike(tx, ty, { applies: 'root', rootMs: a.rootMs, impact: 'earth' }); break;
      case 'ice_age': strike(p.x, p.y, { impact: 'ice' }); return { tx: p.x, ty: p.y };
      case 'ground_slam': strike(p.x, p.y, { impact: 'slam', knock: a.knock }); return { tx: p.x, ty: p.y };
      case 'meteor_storm':
        for (let i = 0; i < a.count; i++) {
          const ang = Math.random() * Math.PI * 2, r = i === 0 ? 0 : rand(40, a.spread);
          strike(tx + Math.cos(ang) * r, ty + Math.sin(ang) * r, { at: now + a.telegraph + i * 260, impact: 'meteor' });
        }
        break;
      case 'water_splash': {
        const cx = p.x + dir.x * a.reach, cy = p.y + dir.y * a.reach;
        this.areaHit(cx, cy, a.radius, p, (e) => {
          if (!this.dealDamage(e, a.damage, p, id)) return;
          this.knock(e, normalize(e.x - p.x, e.y - p.y), a.knock);
          this.applyStatus(e, 'wet', p);
        });
        this.broadcast('impact', { type: 'splash', x: cx, y: cy, radius: a.radius });
        return { tx: cx, ty: cy };
      }
      case 'gust': case 'tsunami':
        this.effects.push({ type: 'wave', ox: p.x, oy: p.y, dir, caster: p, at: now + (a.telegraph || 0), speed: a.speed, width: a.width, length: a.length, damage: a.damage, knock: a.knock, applies: a.applies, hit: new Set(), abilityId: id });
        break;
      case 'dash': {
        for (let i = 0; i < 12; i++) {
          const nx = p.x + dir.x * a.range / 12, ny = p.y + dir.y * a.range / 12;
          if (pointBlocked(nx, ny, PLAYER_RADIUS)) break;
          p.x = nx; p.y = ny;
        }
        resolveCircle(p, PLAYER_RADIUS, this.liveProps());
        p.invulnUntil = Math.max(p.invulnUntil, now + 350);
        p._empowerUntil = now + 2500;
        return { tx: p.x, ty: p.y };
      }
      case 'shield': p.invulnUntil = Math.max(p.invulnUntil, now + a.duration); return { tx: p.x, ty: p.y };
      case 'berserk': p._st.berserk = now + a.duration; return { tx: p.x, ty: p.y };
      case 'trap': {
        let x = tx, y = ty;
        if (pointBlocked(x, y, 10)) { x = p.x; y = p.y; }
        this.traps.push({ x, y, caster: p, expiresAt: now + a.lifetime, damage: a.damage, radius: a.radius });
        const c = this.clients.find((cl) => cl.sessionId === p.id);
        if (c) c.send('trapPlaced', { x, y, expiresAt: now + a.lifetime });
        return { tx: x, ty: y };
      }
      case 'heal_spring':
        p._healUntil = now + a.duration; p._healRate = a.heal / (a.duration / 1000);
        ['burn', 'chill', 'wet', 'root', 'mark', 'poison'].forEach((s) => { p._st[s] = 0; });
        return { tx: p.x, ty: p.y };
      case 'chain_lightning': {
        let cur = this.nearestEnemyTo(p, tx, ty, a.range);
        if (!cur) return null;
        const points = [{ x: p.x, y: p.y - 20 }];
        const hit = new Set();
        for (let i = 0; i < a.bounces && cur; i++) {
          hit.add(cur.id);
          points.push({ x: cur.x, y: cur.y - 20 });
          const target = cur;
          if (this.dealDamage(target, a.damage, p, id)) this.applyStatus(target, 'shock', p);
          let next = null, nd = a.bounceRange;
          this.state.players.forEach((e) => { if (e.alive && e !== p && !hit.has(e.id)) { const d = dist(e, target); if (d < nd) { nd = d; next = e; } } });
          cur = next;
        }
        this.broadcast('chain', { points });
        return { tx: points[1].x, ty: points[1].y };
      }
      case 'black_hole':
        this.effects.push({ type: 'blackhole', x: tx, y: ty, caster: p, at: now + a.telegraph, pullRadius: a.pullRadius, damage: a.damage, radius: a.radius });
        break;
      case 'thunderstorm':
        this.effects.push({ type: 'storm', caster: p, at: now + a.telegraph, damage: a.damage, radius: a.radius });
        return { tx: p.x, ty: p.y };
      case 'dragon_breath':
        this.effects.push({ type: 'breath', caster: p, dir, at: now, ticksLeft: a.ticks, tickMs: a.tickMs, damage: a.damage, radius: a.radius, arc: a.arc });
        break;
      case 'shadow_strike': {
        const targets = this.enemiesNear(p, p.x, p.y, a.radius).sort((m, n) => dist(m, p) - dist(n, p)).slice(0, a.targets);
        p.invulnUntil = Math.max(p.invulnUntil, now + targets.length * a.hopMs + 350);
        targets.forEach((t, i) => this.effects.push({ type: 'hop', caster: p, target: t, at: now + i * a.hopMs, damage: a.damage }));
        return { tx: p.x, ty: p.y };
      }
      case 'kings_fortress':
        p.invulnUntil = Math.max(p.invulnUntil, now + a.duration);
        this.heal(p, a.heal);
        p._speedUntil = now + a.duration; p._speedMult = a.speedMult;
        ['burn', 'chill', 'wet', 'root', 'stun', 'mark', 'shock', 'poison', 'inverted'].forEach((s) => { p._st[s] = 0; });
        return { tx: p.x, ty: p.y };
      // ---- time & reality ----
      case 'time_rewind': {
        const cutoff = now - a.seconds * 1000;
        const snap = p._hist.find((h) => h.t >= cutoff) || p._hist[0];
        if (!snap) return null;
        const path = p._hist.filter((h) => h.t >= snap.t).filter((_, i) => i % 3 === 0).map((h) => ({ x: Math.round(h.x), y: Math.round(h.y) })).reverse();
        p.x = snap.x; p.y = snap.y;
        p.hp = Math.max(p.hp, snap.hp); p.shield = Math.max(p.shield, snap.shield);
        ['burn', 'chill', 'wet', 'root', 'stun', 'mark', 'shock', 'poison', 'inverted', 'slowtime'].forEach((s) => { p._st[s] = 0; });
        p.invulnUntil = Math.max(p.invulnUntil, now + 450);
        p._kbx = 0; p._kby = 0;
        this.broadcast('rewind', { id: p.id, path });
        return { tx: p.x, ty: p.y };
      }
      case 'time_bubble':
        this.zones.push({ type: 'bubble', x: tx, y: ty, r: a.radius, until: now + a.duration, caster: p, slow: a.slow });
        this.broadcast('zone', { ownerId: p.id, type: 'bubble', x: tx, y: ty, r: a.radius, ms: a.duration });
        break;
      case 'reality_rift':
        this.zones.push({ type: 'rift', x: tx, y: ty, r: a.radius, until: now + a.duration, caster: p });
        this.broadcast('zone', { ownerId: p.id, type: 'rift', x: tx, y: ty, r: a.radius, ms: a.duration });
        break;
      case 'reality_swap': {
        const t = this.nearestEnemyTo(p, tx, ty, a.range);
        if (!t) return null;
        const ax = p.x, ay = p.y;
        p.x = t.x; p.y = t.y; t.x = ax; t.y = ay;
        const pr = p.hp / this.maxHpOf(p), trr = t.hp / this.maxHpOf(t);
        if (trr > pr && t.invulnUntil <= now) { p.hp = trr * this.maxHpOf(p); t.hp = Math.max(1, pr * this.maxHpOf(t)); }
        t._st.stun = now + 700;
        resolveCircle(p, PLAYER_RADIUS, this.liveProps()); resolveCircle(t, PLAYER_RADIUS, this.liveProps());
        this.broadcast('swap', { aId: p.id, bId: t.id, ax: p.x, ay: p.y, bx: t.x, by: t.y });
        return { tx: t.x, ty: t.y };
      }
      // ---- mythic ----
      case 'time_stop':
        this.state.timeStopBy = p.id; this.state.timeStopUntil = now + a.duration;
        this.state.players.forEach((e) => { if (e !== p && e.alive) e._st.timestop = now + a.duration; });
        this.broadcast('timeStop', { id: p.id, name: p.name, ms: a.duration });
        return { tx: p.x, ty: p.y };
      case 'reality_warp':
        this.enemiesNear(p, p.x, p.y, a.radius).forEach((e) => { if (e.invulnUntil <= now) e._st.polymorph = now + a.duration; });
        this.broadcast('impact', { type: 'warp', x: p.x, y: p.y, radius: a.radius });
        return { tx: p.x, ty: p.y };
      case 'destiny_snap':
        this.effects.push({ type: 'snap', caster: p, at: now + a.telegraph, fraction: a.fraction, min: a.min });
        return { tx: p.x, ty: p.y };
      case 'space_portal': {
        const ox = p.x, oy = p.y;
        p.x = tx; p.y = ty; resolveCircle(p, PLAYER_RADIUS, this.liveProps());
        p.invulnUntil = Math.max(p.invulnUntil, now + 400);
        [[ox, oy], [p.x, p.y]].forEach(([x, y]) => {
          this.areaHit(x, y, a.radius, p, (e) => { if (this.dealDamage(e, a.damage, p, id)) this.knock(e, normalize(e.x - x, e.y - y), 160); });
          this.broadcast('impact', { type: 'portal', x, y, radius: a.radius });
        });
        return { tx: p.x, ty: p.y };
      }
      default: break;
    }
    return null;
  }

  areaHit(x, y, r, caster, fn) {
    this.state.players.forEach((e) => { if (e.alive && e !== caster && Math.hypot(e.x - x, e.y - y) < r + PLAYER_RADIUS) fn(e); });
    this.liveProps().forEach((pr) => { if (Math.hypot(pr.x - x, pr.y - 16 - y) < r + 16) this.damageProp(pr, 30); });
  }

  knock(e, dir, force) {
    if (e.invulnUntil > Date.now()) return;
    e._kbx = dir.x * force * 4; e._kby = dir.y * force * 4;
  }

  // ---------------------------------------------------------------- damage, statuses, combos
  dealDamage(t, amount, caster, source) {
    if (!t.alive) return false;
    const now = Date.now();
    if (t.invulnUntil > now) return true;
    let dmg = amount * this.eventDamageMult;
    const fromAbility = !['burn', 'poison', 'zone', 'snap'].includes(source);
    if (caster && caster !== t && fromAbility) {
      if (caster.passives.includes('crit') && Math.random() < 0.2) { dmg *= 1.6; this.broadcast('crit', { x: t.x, y: t.y }); }
      if (caster._empowerUntil > now && source !== 'combo') { dmg *= 1.4; caster._empowerUntil = 0; }
      if (this.has(caster, 'berserk', now)) dmg *= ABILITIES.berserk.dmgMult;
      if (this.isChampion(caster)) dmg *= CHAMPION_DMG_MULT;
      if (this.has(t, 'mark', now) && !['combo', 'hunter_mark', 'fate_arrow'].includes(source)) {
        t._st.mark = 0; dmg += 14; this.broadcast('combo', { id: 'mark', x: t.x, y: t.y });
      }
    }
    if (this.has(t, 'berserk', now)) dmg *= 1.15;
    if (this.has(t, 'polymorph', now)) dmg *= 1.25;
    if (t.passives.includes('stoneskin')) dmg *= 0.85;
    if (t.passives.includes('laststand') && t.hp / this.maxHpOf(t) < 0.3) dmg *= 0.8;
    dmg = Math.max(0, dmg);

    t._lastHitAt = now;
    const absorbed = source === 'snap' ? 0 : Math.min(t.shield, dmg);
    t.shield -= absorbed;
    t.hp -= (dmg - absorbed);

    if (caster && caster !== t && caster.alive) {
      if (caster.passives.includes('vampiric') && fromAbility) this.heal(caster, dmg * 0.12);
      if (t.passives.includes('thorns') && fromAbility) caster.hp = Math.max(1, caster.hp - dmg * 0.15);
      if (caster.passives.includes('frosttouch') && fromAbility && source !== 'combo' && Math.random() < 0.25 && t.hp > 0) this.applyStatus(t, 'chill', caster);
    }
    if (t.hp <= 0 && t.alive) { this.kill(t, caster); return false; }
    return true;
  }

  kill(t, caster) {
    const now = Date.now();
    const wasChampion = this.isChampion(t);
    t.alive = false; t.hp = 0; t.vx = 0; t.vy = 0; t.fx = '';
    if (caster && caster !== t && caster.alive) {
      caster.kills += 1; caster.score += 20;
      if (caster.passives.includes('bloodlust')) { caster._speedUntil = now + 5000; caster._speedMult = 1.2; this.heal(caster, 12); }
      const stealable = t.passives.filter((id) => !caster.passives.includes(id));
      if (stealable.length) {
        const stolen = pick(stealable);
        caster.passives.push(stolen);
        this.broadcast('steal', { playerId: caster.id, playerName: caster.name, fromName: t.name, passiveId: stolen });
      } else this.heal(caster, 20);
      // killing the champion grants a mythic ability
      if (wasChampion) {
        const options = MYTHIC_IDS.filter((m) => m !== caster.mythic);
        const m = pick(options);
        caster.mythic = m;
        caster.cooldowns.set(m, 0);
        this.heal(caster, 40);
        this.broadcast('mythic', { playerId: caster.id, playerName: caster.name, victimName: t.name, mythicId: m });
      }
      this.broadcast('killfeed', { killer: caster.name, victim: t.name });
    }
    if (wasChampion) this.state.championId = '';
    this.broadcast('death', { victimId: t.id, killerName: caster ? caster.name : null, x: t.x, y: t.y });
    this.checkRoundEnd();
  }

  applyStatus(t, s, caster, ms) {
    if (!t.alive || !s) return;
    const now = Date.now();
    if (t.invulnUntil > now) return;
    const has = (k) => this.has(t, k, now);
    const combo = (id, dmg, after) => {
      this.broadcast('combo', { id, x: t.x, y: t.y });
      if (dmg && !this.dealDamage(t, dmg, caster, 'combo')) return;
      if (after) after();
    };
    const pair = (a, b) => (s === a && has(b)) || (s === b && has(a));
    if (pair('shock', 'wet')) { t._st.wet = 0; t._st.shock = 0; return combo('electro', 20, () => { t._st.stun = now + 1100; }); }
    if (pair('chill', 'wet')) { t._st.wet = 0; t._st.chill = 0; return combo('freeze', 8, () => { t._st.stun = now + 1500; }); }
    if (s === 'chill' && has('chill')) { t._st.chill = 0; return combo('freeze', 8, () => { t._st.stun = now + 1200; }); }
    if (pair('chill', 'burn')) { t._st.burn = 0; t._st.chill = 0; return combo('shatter', 24); }
    if (pair('burn', 'wet')) { t._st.burn = 0; t._st.wet = 0; return combo('steam', 12); }
    if (pair('poison', 'burn')) {
      t._st.burn = 0; t._st.poison = 0;
      return combo('toxic', 16, () => {
        this.state.players.forEach((e) => { if (e !== t && e !== caster && e.alive && dist(e, t) < 170) { e._st.poison = now + STATUS_MS.poison; e._dotBy = caster; } });
      });
    }
    if (pair('airborne', 'burn')) {
      return combo('firestorm', 14, () => {
        this.state.players.forEach((e) => { if (e !== t && e !== caster && e.alive && dist(e, t) < 170) { e._st.burn = now + STATUS_MS.burn; e._burnBy = caster; } });
      });
    }
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
    this.state.players.forEach((p) => {
      if (!p.alive || p.kills < CHAMPION_MIN_KILLS) return;
      if (!best || p.kills > best.kills || (p.kills === best.kills && p.hp > best.hp)) best = p;
    });
    const cur = this.state.players.get(this.state.championId);
    // keep the current champion on ties so the crown doesn't flicker
    if (cur && cur.alive && best && best.kills <= cur.kills) best = cur;
    const id = best ? best.id : '';
    if (id === this.state.championId) return;
    if (cur) { cur.maxHp = MAX_HP; cur.hp = Math.min(cur.hp, MAX_HP); }
    this.state.championId = id;
    if (best) {
      best.maxHp = MAX_HP + CHAMPION_HP_BONUS;
      best.hp = Math.min(best.maxHp, best.hp + CHAMPION_HP_BONUS);
      this.broadcast('champion', { id: best.id, name: best.name, kills: best.kills });
    }
  }

  triggerWorldEvent() {
    const id = pick(EVENT_IDS);
    const now = Date.now();
    const dur = { double_damage: 8000, chaos: 10000, meteor_shower: 5000 }[id];
    this.state.eventId = id; this.state.eventUntil = now + dur;
    if (id === 'double_damage') this.eventDamageMult = 2;
    if (id === 'chaos') this.eventCooldownMult = 0.5;
    if (id === 'meteor_shower') {
      for (let i = 0; i < 8; i++) {
        const spot = randomOpenPoint(Math.random, MAP_W / 2, MAP_H / 2, Math.min(this.state.safeRadius, 700));
        this.effects.push({ type: 'strike', x: spot.x, y: spot.y, caster: null, at: now + 900 + i * 450, damage: 20, radius: 85, applies: 'burn', impact: 'meteor' });
      }
    }
    this.broadcast('worldEvent', { id });
    this.nextEventAt = now + dur + EVENT_COOLDOWN_MS;
  }

  // ---------------------------------------------------------------- bots
  steer(p, dir) {
    const base = Math.atan2(dir.y, dir.x);
    for (const da of [0, 0.7, -0.7, 1.3, -1.3, 2.0, -2.0]) {
      const a = base + da;
      if (!pointBlocked(p.x + Math.cos(a) * 46, p.y + Math.sin(a) * 46, PLAYER_RADIUS)) return { x: Math.cos(a), y: Math.sin(a) };
    }
    return { x: -dir.x, y: -dir.y };
  }

  botWants(p, id, d, hpFrac) {
    switch (id) {
      case 'shield': case 'kings_fortress': return hpFrac < 0.35;
      case 'heal_spring': case 'time_rewind': return hpFrac < 0.45;
      case 'dash': return d > 380 || hpFrac < 0.25;
      case 'water_splash': case 'ground_slam': case 'reality_warp': return d < 180;
      case 'berserk': return d < 300;
      case 'reality_swap': return d < 600 && hpFrac < 0.5;
      case 'time_stop': case 'destiny_snap': return d < 450;
      case 'space_portal': return d > 300;
      default: return d < 560;
    }
  }

  updateBot(p, bs, now) {
    if (!p.alive || !bs) return;
    const center = { x: MAP_W / 2, y: MAP_H / 2 };
    const visible = (e) => e.alive && e !== p && (!e.hidden || dist(p, e) < 150);
    let move = { x: 0, y: 0 }, speedFrac = 1;
    const hpFrac = p.hp / this.maxHpOf(p);

    if (dist(p, center) > this.state.safeRadius * 0.82) {
      move = normalize(center.x - p.x, center.y - p.y);
    } else {
      let target = null;
      const champ = this.state.players.get(this.state.championId);
      if (champ && champ !== p && champ.alive && dist(p, champ) < 700 && Math.random() < 0.02) bs.targetId = champ.id;
      const inRange = [...this.state.players.values()].filter((e) => visible(e) && dist(p, e) < 600);
      if (!bs.targetId || now > bs.retargetAt || !inRange.some((e) => e.id === bs.targetId)) {
        const t = inRange.sort((a, b) => dist(p, a) - dist(p, b))[Math.random() < 0.7 ? 0 : Math.floor(Math.random() * inRange.length)];
        bs.targetId = t ? t.id : null; bs.retargetAt = now + rand(2500, 4500);
      }
      target = bs.targetId ? this.state.players.get(bs.targetId) : null;
      if (target && target.alive) {
        const d = dist(p, target);
        const to = normalize(target.x - p.x, target.y - p.y);
        const ideal = bs.style === 'aggressive' ? 170 : 300;
        if (d > ideal + 60) move = to;
        else if (d < ideal - 60) move = { x: -to.x, y: -to.y };
        else { move = { x: -to.y * bs.strafe, y: to.x * bs.strafe }; speedFrac = 0.7; if (Math.random() < 0.01) bs.strafe *= -1; }

        if (now > bs.decisionAt) {
          bs.decisionAt = now + rand(420, 760);
          const ready = (id) => id && (p.cooldowns.get(id) || 0) <= now;
          const lx = target.x + target.vx * 0.25, ly = target.y + target.vy * 0.25;
          if (ready(p.mythic) && this.botWants(p, p.mythic, d, hpFrac) && Math.random() < 0.5) this.tryCast(p, p.mythic, lx, ly);
          else if (ready(p.legend) && this.botWants(p, p.legend, d, hpFrac) && Math.random() < 0.25) this.tryCast(p, p.legend, lx, ly);
          else {
            const opts = p.abilities.filter((id) => ready(id) && this.botWants(p, id, d, hpFrac));
            if (opts.length && Math.random() < 0.35) {
              const id = pick(opts);
              const flee = id === 'dash' && hpFrac < 0.25;
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
  }

  // ---------------------------------------------------------------- main tick
  effSpeed(p, now) {
    if (['stun', 'root', 'airborne', 'timestop'].some((s) => this.has(p, s, now))) return 0;
    let m = 1;
    if (p.passives.includes('swift')) m *= 1.12;
    if (p._speedUntil > now) m *= p._speedMult;
    if (this.has(p, 'berserk', now)) m *= ABILITIES.berserk.speedMult;
    if (p.passives.includes('laststand') && p.hp / this.maxHpOf(p) < 0.3) m *= 1.25;
    if (this.has(p, 'chill', now)) m *= CHILL_SLOW;
    else if (this.has(p, 'wet', now)) m *= WET_SLOW;
    if (this.has(p, 'polymorph', now)) m *= 0.75;
    if (this.has(p, 'slowtime', now)) m *= 0.3;
    if (p.inWater) m *= 0.7;
    return PLAYER_SPEED * m;
  }

  update(dtMs) {
    if (this.state.phase !== 'playing') return;
    const now = Date.now();
    const dt = dtMs / 1000;
    const props = this.liveProps();
    if (this.state.timeStopUntil && now > this.state.timeStopUntil) { this.state.timeStopBy = ''; this.state.timeStopUntil = 0; }

    // zones: time bubble slows, reality rift inverts controls
    this.zones = this.zones.filter((z) => now < z.until);
    this.zones.forEach((z) => {
      this.state.players.forEach((e) => {
        if (!e.alive || e === z.caster || Math.hypot(e.x - z.x, e.y - z.y) > z.r) return;
        e._st[z.type === 'bubble' ? 'slowtime' : 'inverted'] = now + (z.type === 'bubble' ? STATUS_MS.slowtime : STATUS_MS.inverted);
      });
    });

    this.state.players.forEach((p) => {
      if (!p.alive) return;
      if (p.isBot && !this.timeStopped(p, now)) this.updateBot(p, this.botState.get(p.id), now);
      const sp = now < this.state.matchReadyAt ? 0 : this.effSpeed(p, now);
      const inv = this.has(p, 'inverted', now) ? -1 : 1;
      p.vx = p._mx * sp * inv; p.vy = p._my * sp * inv;
      if (!this.timeStopped(p, now)) {
        p.x += (p.vx + p._kbx) * dt; p.y += (p.vy + p._kby) * dt;
        p._kbx *= 0.72; p._kby *= 0.72;
        if (Math.abs(p._kbx) < 5) p._kbx = 0;
        if (Math.abs(p._kby) < 5) p._kby = 0;
      } else { p.vx = 0; p.vy = 0; }
      resolveCircle(p, PLAYER_RADIUS, props);

      p.inWater = inWater(p.x, p.y);
      if (p.inWater && !this.has(p, 'wet', now)) this.applyStatus(p, 'wet', null);
      if (!p.alive) return;
      p.hidden = inBush(p.x, p.y);

      // rewind history (last ~3.2s)
      if (!p._hist.length || now - p._hist[p._hist.length - 1].t >= 100) {
        p._hist.push({ t: now, x: p.x, y: p.y, hp: p.hp, shield: p.shield });
        while (p._hist.length && now - p._hist[0].t > 3300) p._hist.shift();
      }

      if (p._healUntil > now) this.heal(p, p._healRate * dt);
      if (p.passives.includes('regen') && now - p._lastHitAt > 3000) this.heal(p, 3 * dt);
      if (p.shield < p.maxShield && now - p._lastHitAt > SHIELD_REGEN_DELAY) p.shield = Math.min(p.maxShield, p.shield + SHIELD_REGEN_RATE * dt);
      if (now - (p._lastDotTick || 0) > 500) {
        p._lastDotTick = now;
        if (this.has(p, 'burn', now) && !this.dealDamage(p, BURN_DPS / 2, p._burnBy, 'burn')) return;
        if (this.has(p, 'poison', now) && !this.dealDamage(p, POISON_DPS / 2, p._dotBy, 'poison')) return;
      }

      const k = this.pickups.findIndex((q) => dist(p, q) < 34);
      if (k >= 0 && p.hp < this.maxHpOf(p)) {
        const q = this.pickups.splice(k, 1)[0]; this.syncPickups();
        this.heal(p, PICKUP_HEAL);
        this.broadcast('impact', { type: 'heal', x: q.x, y: q.y });
      }
    });

    this.processProjectiles(now, dt);
    this.processEffects(now, dtMs);
    this.processTraps(now);
    this.updateChampion();

    this.state.players.forEach((p) => {
      if (!p.alive) return;
      const fx = STATUS_LIST.filter((s) => this.has(p, s, now)).join(',');
      if (fx !== p.fx) p.fx = fx;
    });

    // shrinking zone
    const alive = [...this.state.players.values()].filter((p) => p.alive);
    if (alive.length === 2 && !this.finalDuelAt) { this.finalDuelAt = now; this.broadcast('finalDuel', { a: alive[0].name, b: alive[1].name }); }
    const startR = Math.hypot(MAP_W, MAP_H) / 2;
    const frac = clamp(1 - this.state.remaining / ROUND_TIME, 0, 1);
    let targetR = startR + (SAFE_END_RADIUS - startR) * Math.min(1, frac * 1.15);
    if (this.finalDuelAt) targetR = Math.max(SAFE_END_RADIUS, Math.min(targetR, this.state.safeRadius - 60 * dt * 20));
    this.state.safeRadius += (targetR - this.state.safeRadius) * Math.min(1, dt * 0.8);
    const center = { x: MAP_W / 2, y: MAP_H / 2 };
    this.state.players.forEach((p) => {
      if (p.alive && dist(p, center) > this.state.safeRadius && now - (p._lastSafeTick || 0) > SAFE_TICK_MS) {
        p._lastSafeTick = now; this.dealDamage(p, SAFE_TICK_DMG, null, 'zone');
      }
    });

    if (!this.state.eventId && now >= this.nextEventAt) this.triggerWorldEvent();
    if (this.state.eventId && now > this.state.eventUntil) {
      this.eventDamageMult = 1; this.eventCooldownMult = 1; this.state.eventId = ''; this.state.eventUntil = 0;
    }

    this.state.remaining = Math.max(0, this.state.remaining - dt);
    if (this.state.remaining <= 0 && this.state.phase === 'playing') {
      const al = [...this.state.players.values()].filter((p) => p.alive).sort((a, b) => b.hp - a.hp);
      this.endMatch(al[0] || null);
    }
  }

  processProjectiles(now, dt) {
    const props = this.liveProps();
    this.projectiles = this.projectiles.filter((pr) => {
      if (!pr.caster.alive && !pr.boomerang) return false;
      if (this.timeStopped(pr.caster, now)) return true;
      if (pr.delayUntil && now < pr.delayUntil) { pr.x = pr.caster.x; pr.y = pr.caster.y - 10; return true; }
      let speed = pr.speed;
      for (const z of this.zones) {
        if (Math.hypot(pr.x - z.x, pr.y - z.y) > z.r || z.caster === pr.caster) continue;
        if (z.type === 'bubble') speed *= z.slow;
        else if (z.type === 'rift' && !pr.flipped) {
          // reality rift: enemy projectiles turn around and now belong to the rift's owner
          pr.flipped = true; pr.dir = { x: -pr.dir.x, y: -pr.dir.y }; pr.caster = z.caster; pr.travelled = 0;
          if (pr.hit) pr.hit.clear();
          this.broadcast('flip', { x: pr.x, y: pr.y, abilityId: pr.abilityId, dx: pr.dir.x, dy: pr.dir.y });
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
        if (pointBlocked(pr.x, pr.y, 2)) { this.broadcast('impact', { type: 'poof', x: pr.x, y: pr.y }); return false; }
        const hitProp = propAt(pr.x, pr.y, props, pr.radius);
        if (hitProp) { this.damageProp(hitProp, pr.abilityId === 'strike' ? 12 : 30); this.broadcast('impact', { type: 'poof', x: pr.x, y: pr.y }); return false; }
      }
      let consumed = false;
      this.state.players.forEach((e) => {
        if (consumed || !e.alive || e === pr.caster || (pr.hit && pr.hit.has(e.id))) return;
        if (Math.hypot(e.x - pr.x, e.y - 10 - pr.y) < pr.radius + PLAYER_RADIUS + 4) {
          if (pr.hit) pr.hit.add(e.id); else consumed = true;
          const alive = this.dealDamage(e, pr.damage, pr.caster, pr.abilityId);
          if (alive && pr.applies) this.applyStatus(e, pr.applies, pr.caster);
          if (alive && pr.pull) { this.knock(e, normalize(pr.caster.x - e.x, pr.caster.y - e.y), pr.pull * 1.4); this.applyStatus(e, 'root', pr.caster, pr.rootMs); }
          if (pr.splash) this.areaHit(pr.x, pr.y, pr.splash, pr.caster, (o) => { if (o !== e) this.dealDamage(o, pr.damage * 0.4, pr.caster, 'combo'); });
          this.broadcast('impact', { type: pr.abilityId, x: e.x, y: e.y - 10 });
        }
      });
      return !consumed;
    });
  }

  processTraps(now) {
    this.traps = this.traps.filter((t) => {
      if (now > t.expiresAt) return false;
      let fired = false;
      this.state.players.forEach((e) => {
        if (fired || !e.alive || e === t.caster) return;
        if (Math.hypot(e.x - t.x, e.y - t.y) < t.radius) {
          fired = true;
          if (this.dealDamage(e, t.damage, t.caster, 'trap')) this.applyStatus(e, 'root', t.caster);
          this.broadcast('impact', { type: 'trap', x: t.x, y: t.y });
        }
      });
      return !fired;
    });
  }

  processEffects(now, dtMs) {
    const dt = dtMs / 1000;
    this.effects = this.effects.filter((fx) => {
      if (fx.caster && !fx.caster.alive && fx.type !== 'strike') return false;
      if (fx.caster && this.timeStopped(fx.caster, now)) { fx.at += dtMs; return true; }
      switch (fx.type) {
        case 'strike':
          if (now < fx.at) return true;
          this.areaHit(fx.x, fx.y, fx.radius, fx.caster, (e) => {
            if (!this.dealDamage(e, fx.damage, fx.caster, fx.impact)) return;
            if (fx.knock) this.knock(e, normalize(e.x - fx.x, e.y - fx.y), fx.knock);
            if (fx.applies) this.applyStatus(e, fx.applies, fx.caster, fx.rootMs);
          });
          this.broadcast('impact', { type: fx.impact, x: fx.x, y: fx.y, radius: fx.radius });
          return false;
        case 'blackhole':
          if (now < fx.at) {
            this.state.players.forEach((e) => {
              if (!e.alive || e === fx.caster || e.invulnUntil > now) return;
              const d = Math.hypot(e.x - fx.x, e.y - fx.y);
              if (d < fx.pullRadius && d > 8) { const n = normalize(fx.x - e.x, fx.y - e.y); e.x += n.x * 190 * dt; e.y += n.y * 190 * dt; }
            });
            return true;
          }
          this.areaHit(fx.x, fx.y, fx.radius, fx.caster, (e) => this.dealDamage(e, fx.damage, fx.caster, 'black_hole'));
          this.broadcast('impact', { type: 'blackhole', x: fx.x, y: fx.y, radius: fx.radius });
          return false;
        case 'wave': {
          if (now < fx.at) return true;
          const front = fx.speed * (now - fx.at) / 1000;
          const nx = -fx.dir.y, ny = fx.dir.x;
          this.state.players.forEach((e) => {
            if (!e.alive || e === fx.caster || fx.hit.has(e.id)) return;
            const s = (e.x - fx.ox) * fx.dir.x + (e.y - fx.oy) * fx.dir.y;
            const lat = Math.abs((e.x - fx.ox) * nx + (e.y - fx.oy) * ny);
            if (s > 0 && Math.abs(s - front) < 44 && lat < fx.width / 2) {
              fx.hit.add(e.id);
              if (this.dealDamage(e, fx.damage, fx.caster, fx.abilityId)) { this.knock(e, fx.dir, fx.knock); this.applyStatus(e, fx.applies, fx.caster); }
            }
          });
          return front < fx.length;
        }
        case 'storm': {
          if (now < fx.at) return true;
          const c = fx.caster;
          const points = [];
          this.enemiesNear(c, c.x, c.y, fx.radius).forEach((e) => {
            points.push({ x: e.x, y: e.y });
            if (this.dealDamage(e, fx.damage, c, 'thunderstorm')) this.applyStatus(e, 'shock', c);
          });
          this.broadcast('bolts', { x: c.x, y: c.y, points, radius: fx.radius });
          return false;
        }
        case 'breath': {
          if (now < fx.at) return true;
          const c = fx.caster;
          const base = Math.atan2(fx.dir.y, fx.dir.x);
          this.state.players.forEach((e) => {
            if (!e.alive || e === c) return;
            let da = Math.atan2(e.y - c.y, e.x - c.x) - base;
            da = Math.atan2(Math.sin(da), Math.cos(da));
            if (dist(e, c) < fx.radius && Math.abs(da) < fx.arc) { if (this.dealDamage(e, fx.damage, c, 'dragon_breath')) this.applyStatus(e, 'burn', c); }
          });
          this.broadcast('impact', { type: 'breath', x: c.x, y: c.y, dx: fx.dir.x, dy: fx.dir.y, radius: fx.radius });
          fx.ticksLeft -= 1; fx.at = now + fx.tickMs;
          return fx.ticksLeft > 0;
        }
        case 'hop': {
          if (now < fx.at) return true;
          const c = fx.caster, t = fx.target;
          if (!t.alive) return false;
          const n = normalize(t.x - c.x, t.y - c.y);
          c.x = t.x + n.x * 30; c.y = t.y + n.y * 30;
          resolveCircle(c, PLAYER_RADIUS, this.liveProps());
          this.broadcast('hop', { casterId: c.id, x: c.x, y: c.y, tx: t.x, ty: t.y });
          this.dealDamage(t, fx.damage, c, 'shadow_strike');
          return false;
        }
        case 'snap': {
          if (now < fx.at) return true;
          const c = fx.caster;
          const points = [];
          this.state.players.forEach((e) => {
            if (!e.alive || e === c) return;
            points.push({ x: e.x, y: e.y });
            this.dealDamage(e, Math.max(fx.min, e.hp * fx.fraction), c, 'snap');
          });
          this.broadcast('snap', { x: c.x, y: c.y, points });
          return false;
        }
        default: return false;
      }
    });
  }
}
