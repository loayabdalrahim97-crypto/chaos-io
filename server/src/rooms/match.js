// Match flow: ROUND 1..5 -> ARMY GROWTH between rounds -> TARGET SELECTION -> FINAL WAR -> results.
// Army Power, upgrades, fusions and mythics persist between rounds; hp/statuses/positions reset.
import { MATCH, ARMY, compositionFor, tierIndex } from '../army.js';
import { MAP_W, MAP_H, pointBlocked, inWater } from '../map.js';
import { shuffle, pick } from './util.js';

const GRACE_MS = 4000;
const RESTART_DELAY_MS = 10000;
const PROP_HP = 30;

export const matchMixin = {
  clearStageTimer() { if (this.stageTimer) { this.stageTimer.clear(); this.stageTimer = null; } },
  setStageTimer(ms, fn) { this.clearStageTimer(); this.stageTimer = this.clock.setTimeout(() => { this.stageTimer = null; fn(); }, ms); },
  hasHumans() { return this.fighters().some((p) => !p.isBot); },

  startMatch() {
    if (this.restartTimer) { clearTimeout(this.restartTimer); this.restartTimer = null; }
    this.state.players.forEach((p) => { if (!p.kind) this.resetPlayer(p); });
    this.startRound(1);
  },

  startRound(n) {
    this.clearStageTimer();
    if (!this.hasHumans()) { this.backToWaiting(); return; }
    const now = Date.now();
    const final = n > MATCH.rounds;
    if (this.state.players.has('boss')) this.state.players.delete('boss');
    this.endDomain('round');
    this.clearAllUnits();
    this.state.round = n;
    this.state.stage = final ? 'final' : 'round';
    this.state.stageEndsAt = 0;
    this.state.phase = 'playing';
    this.roundTime = final ? MATCH.finalTime : MATCH.roundTime;
    this.state.remaining = this.roundTime;
    this.state.matchReadyAt = now + GRACE_MS;
    this.state.safeRadius = Math.hypot(MAP_W, MAP_H) / 2;
    this.state.championId = ''; this.state.timeStopBy = ''; this.state.timeStopUntil = 0; this.state.bossId = '';
    this.state.eventId = ''; this.state.eventUntil = 0;
    this.state.winnerId = ''; this.state.winnerName = ''; this.state.winnerTeam = 0;
    this.effects = []; this.projectiles = []; this.traps = []; this.pickups = []; this.zones = []; this.summons = []; this.drops = [];
    this.syncPickups(); this.syncDrops();
    this.eventDamageMult = 1; this.eventCooldownMult = 1;
    this.finalDuelAt = 0;
    this.bossSpawned = final || !MATCH.bossRounds.includes(n);
    this.nextEventAt = now + 26000;
    this.nextDropAt = now + 18000;
    this.roundChampionId = '';
    this.state.props.forEach((pr) => { pr.alive = true; pr.hp = PROP_HP; });
    this.state.players.forEach((p) => { if (!p.kind) this.resetForRound(p, now); });
    this.spreadSpawns();
    if (!final) this.assignRoundChampion(n);
    this.fighters().forEach((p) => this.spawnArmy(p));
    this.broadcast('matchStart', { readyInMs: GRACE_MS, mode: this.state.mode, round: n, final, rounds: MATCH.rounds });
  },

  // heroes (and their armies) start spread on a ring so every army has room to form up
  spreadSpawns() {
    const list = shuffle(this.fighters());
    const base = Math.random() * Math.PI * 2;
    list.forEach((p, i) => {
      for (let k = 0; k < 12; k++) {
        const a = base + (i / list.length) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
        const r = 380 + Math.random() * 120 - k * 20;
        const x = MAP_W / 2 + Math.cos(a) * r * 1.35, y = MAP_H / 2 + Math.sin(a) * r * 0.9;
        if (!pointBlocked(x, y, 30) && !inWater(x, y)) { p.x = x; p.y = y; break; }
      }
    });
  },

  // strongest player (Army Power, then kills, then round wins) becomes the CHAMPION for the round
  assignRoundChampion(n) {
    if (n < 2) return;
    const best = this.fighters().slice().sort((a, b) => (b.power - a.power) || (b.kills - a.kills) || (b.roundWins - a.roundWins))[0];
    if (!best || best.power <= ARMY.startPower) return;
    this.state.championId = best.id;
    this.roundChampionId = best.id;
    this.refreshMaxHp(best); best.hp = best.maxHp;
    this.broadcast('champion', { id: best.id, name: best.name, kills: best.kills, power: best.power, roundStart: true });
  },

  checkRoundEnd() {
    if (this.state.phase !== 'playing') return;
    const duo = this.state.mode === 'duo';
    let alive;
    if (this.state.stage === 'final') {
      // a force survives while its hero lives or its army is still fighting
      const armies = new Set(this.units.filter((u) => u.alive).map((u) => u.owner));
      alive = this.fighters().filter((p) => p.alive || armies.has(p));
    } else alive = this.fighters().filter((p) => p.alive);
    const rank = (a, b) => (b.alive - a.alive) || (b.hp - a.hp) || (b.power - a.power);
    if (duo) {
      const teams = new Set(alive.map((p) => p.team));
      if (teams.size <= 1) this.endRound(alive.sort(rank)[0] || null);
    } else if (alive.length <= 1) this.endRound(alive[0] || null);
  },

  endRound(winner) {
    if (this.state.phase !== 'playing') return;
    const now = Date.now();
    const duo = this.state.mode === 'duo';
    const final = this.state.stage === 'final';
    this.endDomain('round');
    const winners = winner ? this.fighters().filter((p) => (duo ? p.team === winner.team : p === winner)) : [];
    this.state.winnerId = winner ? winner.id : '';
    this.state.winnerName = winner ? winner.name : '';
    this.state.winnerTeam = winner && duo ? winner.team : 0;

    if (!final) {
      winners.forEach((p) => { p.roundWins += 1; this.addPower(p, ARMY.gains.roundWin, 'roundWin'); });
      this.fighters().forEach((p) => { if (p.alive && !winners.includes(p)) this.addPower(p, ARMY.gains.survive, 'survive'); });
    }
    const results = this.fighters().map((p) => {
      const won = winners.includes(p);
      const status = won ? 'winner' : p.alive ? 'survivor' : 'eliminated';
      const pts = (status === 'winner' ? 100 : status === 'survivor' ? 40 : 0) + p.kills * 20 + (p._bossKill ? 60 : 0);
      return { id: p.id, name: p.name, hero: p.hero, status, kills: p.kills, pts, isBot: p.isBot, team: p.team, power: p.power, roundWins: p.roundWins };
    }).sort((a, b) => (final ? b.pts - a.pts : (b.status === 'winner') - (a.status === 'winner') || b.power - a.power));
    const growth = this.fighters().map((p) => {
      const before = p._roundStartPower || 0;
      const prev = compositionFor(before), next = compositionFor(p.power);
      return {
        id: p.id, gain: p.power - before, before, after: p.power, prev, comp: next,
        tierUp: tierIndex(p.power) > tierIndex(before), unlocked: [...new Set(p._roundUnlocks || [])],
      };
    });
    const mate = duo && winner ? winners.find((p) => p !== winner) : null;
    this.broadcast('roundEnd', {
      results, growth, round: this.state.round, rounds: MATCH.rounds, final,
      winnerName: winner ? winner.name + (mate ? ' و ' + mate.name : '') : null, winnerTeam: this.state.winnerTeam,
      nextMs: final ? RESTART_DELAY_MS : this.state.round >= MATCH.rounds ? MATCH.growthMs : MATCH.growthMs,
    });
    this.clearAllUnits();
    this.projectiles = []; this.effects = []; this.zones = [];

    if (final) {
      this.state.phase = 'ended';
      this.state.stage = 'ended';
      this.restartTimer = setTimeout(() => this.backToWaiting(true), RESTART_DELAY_MS);
      return;
    }
    this.state.phase = 'intermission';
    this.state.stage = 'growth';
    this.state.stageEndsAt = now + MATCH.growthMs;
    this.setStageTimer(MATCH.growthMs, () => {
      if (this.state.round >= MATCH.rounds) this.startTargets();
      else this.startRound(this.state.round + 1);
    });
  },

  backToWaiting(restart) {
    this.clearStageTimer();
    this.endDomain('round');
    this.clearAllUnits();
    [...this.state.players.entries()].forEach(([id, p]) => { if (p.isBot || p.kind) { this.state.players.delete(id); this.botState.delete(id); this.loadouts.delete(id); } });
    this.state.phase = 'waiting'; this.state.stage = ''; this.state.round = 0; this.state.championId = '';
    if (restart && this.state.players.size > 0) this.fillWithBotsAndStart();
    else if (this.state.players.size > 0) this.checkStart();
  },

  resetForRound(p, now) {
    p._roundStartPower = p.power; p._roundGain = 0; p._roundUnlocks = [];
    p.hp = this.maxHpOf(p); p.maxHp = p.hp; p.shield = p.maxShield;
    p.alive = true; p.ghost = false; p.curseReady = false; p.invulnUntil = 0; p.fx = ''; p.hidden = false; p.bonus = '';
    p.upgradeOffer = ''; p._pendingUpgrades = 0; p.bounty = 0; p.targets = this.state.round > MATCH.rounds ? p.targets : '';
    p._st = {}; p._kbx = 0; p._kby = 0; p._hist = []; p._healUntil = 0; p._speedUntil = 0; p._speedMult = 1; p._empowerUntil = 0;
    p._lastHitAt = 0; p._lastHitBy = ''; p._recentKills = []; p._dmgBuffUntil = 0; p._killerId = ''; p._dmgBy = {}; p._rallyUntil = 0;
    Array.from(p.cooldowns.keys()).forEach((k) => { if (k !== 'domain') p.cooldowns.delete(k); });
    p.cooldowns.set('domain', Math.max(p.cooldowns.get('domain') || 0, now + 4000 + 8000));
    this.placePlayer(p);
    this.refreshMaxHp(p); p.hp = p.maxHp;
  },

  // ---------------------------------------------------------------- Final War target selection
  startTargets() {
    const now = Date.now();
    this.state.phase = 'intermission';
    this.state.stage = 'targets';
    this.state.round = MATCH.rounds;
    this.state.stageEndsAt = now + MATCH.targetMs;
    this.fighters().forEach((p) => { p.targets = ''; });
    this.broadcast('targetSelect', { ms: MATCH.targetMs, max: MATCH.maxTargetsPerPlayer, maxAttackers: MATCH.maxAttackersPerTarget });
    shuffle(this.fighters().filter((p) => p.isBot)).forEach((b, i) => this.clock.setTimeout(() => this.botPickTargets(b), 1500 + i * 900));
    this.setStageTimer(MATCH.targetMs, () => this.startRound(MATCH.rounds + 1));
  },
  attackersOf(t) { return this.fighters().filter((p) => p.targets && p.targets.split(',').includes(t.id)).length; },
  canTarget(p, t) {
    if (!p || !t || p === t || t.kind || !this.state.players.has(t.id)) return false;
    if (this.state.mode === 'duo' && p.team === t.team) return false;
    const mine = p.targets ? p.targets.split(',') : [];
    if (mine.includes(t.id)) return true;
    return mine.length < MATCH.maxTargetsPerPlayer && this.attackersOf(t) < MATCH.maxAttackersPerTarget;
  },
  toggleTarget(p, tid) {
    if (this.state.stage !== 'targets' || !p) return false;
    const t = this.state.players.get(String(tid));
    const mine = p.targets ? p.targets.split(',') : [];
    if (t && mine.includes(t.id)) { p.targets = mine.filter((x) => x !== t.id).join(','); return true; }
    if (!this.canTarget(p, t)) return false;
    mine.push(t.id); p.targets = mine.join(',');
    return true;
  },
  botPickTargets(b) {
    if (this.state.stage !== 'targets' || !this.state.players.has(b.id)) return;
    const n = Math.random() < 0.6 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const opts = this.fighters().filter((t) => this.canTarget(b, t) && !(b.targets || '').split(',').includes(t.id));
      if (!opts.length) break;
      opts.sort((x, y) => (this.attackersOf(x) - this.attackersOf(y)) || (y.power - x.power));
      this.toggleTarget(b, Math.random() < 0.7 ? opts[0].id : pick(opts).id);
    }
  },
};
