// Colyseus replicated state — the single source of truth every client renders from.
import { Schema, MapSchema, ArraySchema, defineTypes } from '@colyseus/schema';

export class Player extends Schema {
  constructor() {
    super();
    this.id = '';
    this.name = '';
    this.isBot = false;
    this.hero = 'shadow';
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.hp = 100;
    this.maxHp = 100;
    this.shield = 40;
    this.maxShield = 40;
    this.alive = true;
    this.kills = 0;
    this.score = 0;
    this.legend = '';
    this.mythic = '';     // mythic ability earned by killing the champion
    this.abilities = new ArraySchema(); // 3 normal ability ids
    this.passives = new ArraySchema();  // passive ids (innate + stolen)
    this.invulnUntil = 0;
    this.cooldowns = new MapSchema();   // abilityId -> ms-epoch when ready again
    this.fx = '';        // comma list of active statuses (burn,chill,wet,shock,root,stun,mark,airborne,poison,...)
    this.hidden = false; // standing inside tall grass or stealthed
    this.inWater = false;
    this.kind = '';       // '' = player, 'boss' = map boss
    this.team = 0;        // duo mode team (0 = solo)
    this.ghost = false;   // dead player drifting as a ghost
    this.curseReady = false;
    this.fusion = '';     // fusion ability unlocked at 3 kills (key R)
    this.bonus = '';      // one-shot legendary from a supply drop (key F)
    this.upgrades = '';   // "cdr:1,dmg:2"
    this.upgradeOffer = ''; // "cdr,hp,vamp" while choosing
    this.bounty = 0;      // kills since last death streak (wanted level)
    this.power = 0;       // Army Power (persists between rounds)
    this.targets = '';    // Final War preferred targets "id,id"
    this.slot = 0;        // color slot for army rings
    this.roundWins = 0;
  }
}
defineTypes(Player, {
  id: 'string',
  name: 'string',
  isBot: 'boolean',
  hero: 'string',
  x: 'number',
  y: 'number',
  vx: 'number',
  vy: 'number',
  hp: 'number',
  maxHp: 'number',
  shield: 'number',
  maxShield: 'number',
  alive: 'boolean',
  kills: 'number',
  score: 'number',
  legend: 'string',
  mythic: 'string',
  abilities: ['string'],
  passives: ['string'],
  invulnUntil: 'number',
  cooldowns: { map: 'number' },
  fx: 'string',
  hidden: 'boolean',
  inWater: 'boolean',
  kind: 'string',
  team: 'number',
  ghost: 'boolean',
  curseReady: 'boolean',
  fusion: 'string',
  bonus: 'string',
  upgrades: 'string',
  upgradeOffer: 'string',
  bounty: 'number',
  power: 'number',
  targets: 'string',
  slot: 'uint8',
  roundWins: 'uint8',
});

// AI soldiers / companions. Compact types keep patches small.
export class Unit extends Schema {
  constructor() {
    super();
    this.id = '';
    this.o = '';     // owner player id
    this.t = 0;      // 0 basic · 1 elite · 2 commander · 3 companion 1 · 4 companion 2 · 5 skeleton
    this.x = 0;
    this.y = 0;
    this.hp = 0;
    this.mhp = 0;
    this.a = 0;      // attack counter (client plays a swing when it changes)
    this.fx = '';    // statuses
    this.lg = false; // lingering (hero is dead)
  }
}
defineTypes(Unit, { id: 'string', o: 'string', t: 'uint8', x: 'int16', y: 'int16', hp: 'uint16', mhp: 'uint16', a: 'uint8', fx: 'string', lg: 'boolean' });

export class Prop extends Schema {
  constructor() {
    super();
    this.id = 0;
    this.kind = 'crate';
    this.x = 0;
    this.y = 0;
    this.hp = 30;
    this.alive = true;
  }
}
defineTypes(Prop, { id: 'number', kind: 'string', x: 'number', y: 'number', hp: 'number', alive: 'boolean' });

export class ArenaState extends Schema {
  constructor() {
    super();
    this.phase = 'waiting'; // waiting | playing | intermission | ended
    this.players = new MapSchema();
    this.props = new ArraySchema();
    this.remaining = 0;
    this.matchReadyAt = 0;
    this.arenaW = 1920;
    this.arenaH = 1344;
    this.safeRadius = 900;
    this.championId = ''; // strongest player right now (most kills)
    this.timeStopBy = '';  // who froze time (everyone else is frozen)
    this.timeStopUntil = 0;
    this.eventId = '';
    this.eventUntil = 0;
    this.winnerId = '';
    this.winnerName = '';
    this.countdown = 0;
    this.pickups = ''; // "x:y;x:y" heal pickups dropped by broken props
    this.drops = '';   // "id:x:y:landAt;..." supply drops
    this.mode = 'solo'; // solo | duo
    this.bossId = '';
    this.winnerTeam = 0;
    this.units = new MapSchema();
    this.round = 0;          // 1..5 normal rounds, 6 = Final War
    this.stage = '';         // round | growth | targets | final
    this.stageEndsAt = 0;
    this.activeDomainPlayer = '';
    this.activeDomainType = '';
    this.activeDomainEndTime = 0;
    this.portals = '';       // void domain portals "x:y;x:y..."
  }
}
defineTypes(ArenaState, {
  phase: 'string',
  players: { map: Player },
  props: [Prop],
  remaining: 'number',
  matchReadyAt: 'number',
  arenaW: 'number',
  arenaH: 'number',
  safeRadius: 'number',
  championId: 'string',
  timeStopBy: 'string',
  timeStopUntil: 'number',
  eventId: 'string',
  eventUntil: 'number',
  winnerId: 'string',
  winnerName: 'string',
  countdown: 'number',
  pickups: 'string',
  drops: 'string',
  mode: 'string',
  bossId: 'string',
  winnerTeam: 'number',
  units: { map: Unit },
  round: 'uint8',
  stage: 'string',
  stageEndsAt: 'number',
  activeDomainPlayer: 'string',
  activeDomainType: 'string',
  activeDomainEndTime: 'number',
  portals: 'string',
});
