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
    this.hidden = false; // standing inside tall grass
    this.inWater = false;
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
});

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
    this.phase = 'waiting'; // waiting | playing | ended
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
});
