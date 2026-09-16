// Colyseus replicated state — the single source of truth every client renders from.
// Uses the no-decorator defineTypes() API (works in plain JS/ESM, no TS build step).
import { Schema, MapSchema, ArraySchema, defineTypes } from '@colyseus/schema';

export class Player extends Schema {
  constructor() {
    super();
    this.id = '';
    this.name = '';
    this.isBot = false;
    this.ring = '#ffe27a';
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.hp = 100;
    this.maxHp = 100;
    this.shield = 45;
    this.maxShield = 45;
    this.alive = true;
    this.kills = 0;
    this.score = 0;
    this.isBoss = false;
    this.ultimate = '';
    this.readyAt = 0; // ms epoch when this player stops being "just spawned" / invulnerable
    this.abilities = new ArraySchema(); // string ability ids, up to 4
    this.passives = new ArraySchema();  // string passive ids, up to 3
    this.invulnUntil = 0;
    this.cooldowns = new MapSchema(); // abilityId -> ms-epoch when ready again
  }
}
defineTypes(Player, {
  id: 'string',
  name: 'string',
  isBot: 'boolean',
  ring: 'string',
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
  isBoss: 'boolean',
  ultimate: 'string',
  readyAt: 'number',
  abilities: ['string'],
  passives: ['string'],
  invulnUntil: 'number',
  cooldowns: { map: 'number' },
});

export class AbilitySlot extends Schema {
  constructor() {
    super();
    this.id = '';
    this.cooldownUntil = 0;
  }
}
defineTypes(AbilitySlot, {
  id: 'string',
  cooldownUntil: 'number',
});

export class ArenaState extends Schema {
  constructor() {
    super();
    this.phase = 'waiting'; // waiting | playing | ended
    this.players = new MapSchema();
    this.remaining = 0;
    this.matchReadyAt = 0;
    this.arenaW = 1600;
    this.arenaH = 1000;
    this.safeRadius = 800;
    this.orbActive = false;
    this.orbX = 0;
    this.orbY = 0;
    this.bossId = '';
    this.bossHuntEndAt = 0;
    this.eventId = '';
    this.eventUntil = 0;
    this.winnerId = '';
    this.winnerName = '';
    this.countdown = 0; // seconds until match start (waiting phase)
  }
}
defineTypes(ArenaState, {
  phase: 'string',
  players: { map: Player },
  remaining: 'number',
  matchReadyAt: 'number',
  arenaW: 'number',
  arenaH: 'number',
  safeRadius: 'number',
  orbActive: 'boolean',
  orbX: 'number',
  orbY: 'number',
  bossId: 'string',
  bossHuntEndAt: 'number',
  eventId: 'string',
  eventUntil: 'number',
  winnerId: 'string',
  winnerName: 'string',
  countdown: 'number',
});
