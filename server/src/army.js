// Strategic layer data: AI armies, Army Power, special summons, character Domains, match structure.
// Everything here is plain config so balance can be tuned without touching logic.
// client/src/shared/army.js must stay an exact copy of this file.

// ---------------------------------------------------------------- match structure
export const MATCH = {
  rounds: 5,              // normal rounds before the Final War
  roundTime: 100,         // seconds per normal round
  finalTime: 170,         // seconds for the Final War (safe zone closes fully by then)
  growthMs: 7000,         // "ARMY GROWTH" screen between rounds
  targetMs: 15000,        // target selection before the Final War
  bossRounds: [2, 4],     // rounds where the map boss appears
  maxAttackersPerTarget: 2,
  maxTargetsPerPlayer: 2,
};

// ---------------------------------------------------------------- Army Power
export const ARMY = {
  startPower: 10,
  maxPower: 300,
  capacity: 9,                // hard cap of soldiers per player (companions not included)
  gains: {                    // Army Power rewards
    kill: 12, assist: 5, bossKill: 15, champKill: 8, roundWin: 10, survive: 4,
    unitKill: 1, commanderKill: 4,
  },
  // composition unlocked by power (never exceeds capacity)
  tiers: [
    { power: 0,   basic: 3, elite: 0, commander: 0 },
    { power: 20,  basic: 4, elite: 0, commander: 0 },
    { power: 35,  basic: 4, elite: 1, commander: 0 },
    { power: 55,  basic: 4, elite: 2, commander: 0 },
    { power: 80,  basic: 4, elite: 2, commander: 1 },
    { power: 110, basic: 4, elite: 3, commander: 1 },
    { power: 145, basic: 5, elite: 3, commander: 1 },
    { power: 185, basic: 4, elite: 3, commander: 2 },
    { power: 230, basic: 5, elite: 2, commander: 2 },
  ],
  statPerPower: 0.0025,       // unit stats * (1 + power * statPerPower)
  maxStatMult: 1.6,           // ... capped (no exponential growth)
  heroDamageMult: 0.6,        // soldiers hit heroes softer than they hit soldiers
  reinforceMs: 12000,         // one lost soldier comes back this often while the hero lives
  lingerMs: 8000,             // army keeps fighting after its hero dies (normal rounds)
  finalLingerMs: 16000,       // ... and longer in the Final War
  aiMs: 250,                  // AI think interval per soldier (staggered)
  leash: 430,                 // how far soldiers roam from their hero
  finalLeash: 950,            // Final War: soldiers chase assigned targets further
  dangerHpFrac: 0.4,          // owner below this hp fraction = critically threatened
  championDmg: 1.25, championHp: 1.2,
};

export const UNIT_TYPES = ['basic', 'elite', 'commander', 'comp1', 'comp2', 'skeleton'];
export const UNITS = {
  basic:     { hp: 45,  dmg: 6,  range: 34,  atkMs: 900,  speed: 195, radius: 11, aggro: 360 },
  elite:     { hp: 60,  dmg: 8,  range: 290, atkMs: 1400, speed: 185, radius: 11, aggro: 440, ranged: { speed: 640, radius: 7 } },
  commander: { hp: 190, dmg: 14, range: 46,  atkMs: 1000, speed: 180, radius: 16, aggro: 480,
               slamMs: 6000, slam: { radius: 120, damage: 16, knock: 170 }, rallyR: 230, rallyMult: 1.2, prefersHeroes: true },
  skeleton:  { hp: 35,  dmg: 6,  range: 34,  atkMs: 900,  speed: 200, radius: 11, aggro: 360 },
};

// army style per hero (strength depends on the character)
export const HERO_ARMY = {
  shadow:   { element: 'void',    hp: 0.9,  dmg: 1.15, speed: 1.15, onHit: 'weak',   chance: 0.15 },
  knight:   { element: 'holy',    hp: 1.3,  dmg: 0.9,  speed: 0.95, armor: 0.15 },
  crimson:  { element: 'fire',    hp: 1.0,  dmg: 1.15, speed: 1.0,  onHit: 'burn',   chance: 0.25 },
  bones:    { element: 'death',   hp: 0.9,  dmg: 1.0,  speed: 1.0,  lifesteal: 0.3, onHit: 'poison', chance: 0.15 },
  sakura:   { element: 'blossom', hp: 0.95, dmg: 1.05, speed: 1.2,  atkSpeed: 1.15 },
  frost:    { element: 'ice',     hp: 1.1,  dmg: 0.95, speed: 1.0,  onHit: 'chill',  chance: 0.2 },
  golem:    { element: 'storm',   hp: 1.15, dmg: 1.05, speed: 0.95, onHit: 'shock',  chance: 0.2 },
  sage:     { element: 'water',   hp: 1.05, dmg: 0.95, speed: 1.0,  regen: 2, onHit: 'wet', chance: 0.25 },
  fox:      { element: 'moon',    hp: 0.95, dmg: 1.1,  speed: 1.1,  crit: 0.2 },
  explorer: { element: 'sand',    hp: 1.1,  dmg: 1.0,  speed: 1.05, knock: 70 },
};

// ---------------------------------------------------------------- two special summons per hero
export const SUMMON = { cooldown: 25000, lifetime: 30000, leash: 300, powerScale: 0.5 };
export const COMPANION_ROLES = {
  guardian: { hp: 260, dmg: 12, range: 48,  atkMs: 1000, speed: 205, radius: 16, aggro: 380, knock: 150 },
  striker:  { hp: 110, dmg: 12, range: 330, atkMs: 1100, speed: 205, radius: 12, aggro: 460, ranged: { speed: 720, radius: 9 } },
  assassin: { hp: 120, dmg: 18, range: 40,  atkMs: 800,  speed: 270, radius: 12, aggro: 520, blinkMs: 4500, blinkRange: 300, prefersHeroes: true },
  healer:   { hp: 130, dmg: 6,  range: 300, atkMs: 1300, speed: 215, radius: 12, aggro: 400, ranged: { speed: 620, radius: 8 }, heal: 12, healMs: 2000 },
};
export const COMPANIONS = {
  shadow:   [{ id: 'void_stalker', role: 'assassin', applies: 'weak' },   { id: 'void_eye', role: 'striker', applies: 'silence', statusMs: 900 }],
  knight:   [{ id: 'royal_guard', role: 'guardian', applies: 'stun', statusMs: 400 }, { id: 'priestess', role: 'healer' }],
  crimson:  [{ id: 'fire_imp', role: 'striker', applies: 'burn' },       { id: 'lava_brute', role: 'guardian', applies: 'burn' }],
  bones:    [{ id: 'skull_mage', role: 'striker', applies: 'poison' },   { id: 'grave_brute', role: 'guardian', applies: 'weak' }],
  sakura:   [{ id: 'crane', role: 'assassin', applies: 'mark' },         { id: 'leaf_spirit', role: 'healer' }],
  frost:    [{ id: 'frost_wisp', role: 'striker', applies: 'chill' },    { id: 'ice_drake', role: 'guardian', applies: 'chill' }],
  golem:    [{ id: 'storm_drone', role: 'striker', applies: 'shock' },   { id: 'bronze_titan', role: 'guardian', applies: 'shock' }],
  sage:     [{ id: 'sprout', role: 'healer' },                           { id: 'tide_slime', role: 'guardian', applies: 'wet' }],
  fox:      [{ id: 'moon_crab', role: 'assassin', applies: 'mark' },     { id: 'night_beetle', role: 'guardian', applies: 'weak' }],
  explorer: [{ id: 'sand_seed', role: 'striker', applies: 'root', statusMs: 500 }, { id: 'dune_golem', role: 'guardian', applies: 'airborne' }],
};

// ---------------------------------------------------------------- Domains (one per hero, only one active in the world)
export const DOMAIN = { duration: 12000, cooldown: 60000, roundLockMs: 12000, pulseMs: 1000 };
export const DOMAINS = {
  // ownerDmg: hero damage · unitDmg/unitSpeed/unitArmor/unitRegen: owner's army · enemySlow: enemy move mult
  // pulse: status on enemies each pulse (chance) · hazard: telegraphed strikes near enemies
  crimson:  { id: 'inferno',    ownerDmg: 1.15, unitDmg: 1.35, unitSpeed: 1.1, pulse: { status: 'burn', chance: 0.3 },
              hazard: { every: 900, count: 2, radius: 85, damage: 14, applies: 'burn', delay: 800, impact: 'meteor' }, noWater: true },
  frost:    { id: 'glacier',    ownerDmg: 1.1,  unitDmg: 1.2, unitArmor: 0.15, enemySlow: 0.85, pulse: { status: 'chill', chance: 0.25 },
              hazard: { every: 1100, count: 2, radius: 90, damage: 10, applies: 'chill', delay: 700, impact: 'ice' }, frozenPonds: true },
  shadow:   { id: 'void',       ownerDmg: 1.15, unitDmg: 1.3, unitSpeed: 1.15, pulse: { status: 'weak', chance: 0.25 },
              portals: 3, voidPull: 70 },
  golem:    { id: 'storm',      ownerDmg: 1.1,  unitDmg: 1.25, unitSpeed: 1.25, pulse: { status: 'shock', chance: 0.25 },
              hazard: { every: 700, count: 1, radius: 75, damage: 16, applies: 'shock', delay: 500, impact: 'lightning' } },
  sage:     { id: 'tide',       ownerDmg: 1.1,  unitDmg: 1.15, unitRegen: 6, enemySlow: 0.8, flood: true, current: 55 },
  sakura:   { id: 'blossom',    ownerDmg: 1.1,  unitDmg: 1.2, unitSpeed: 1.2, ownerCdr: 0.6, unitRegen: 4, enemySlow: 0.9 },
  knight:   { id: 'sanctum',    ownerDmg: 1.1,  unitDmg: 1.15, unitArmor: 0.35, ownerShieldRegen: 12,
              hazard: { every: 1200, count: 2, radius: 90, damage: 14, applies: 'stun', statusMs: 500, delay: 900, impact: 'holy' } },
  bones:    { id: 'necropolis', ownerDmg: 1.1,  unitDmg: 1.2, unitLifesteal: 0.25, pulse: { status: 'poison', chance: 0.25 }, necroRise: 4 },
  fox:      { id: 'moonhunt',   ownerDmg: 1.2,  unitDmg: 1.3, unitSpeed: 1.2, unitCrit: 0.25, pulse: { status: 'mark', chance: 0.2 }, darkness: true },
  explorer: { id: 'sandstorm',  ownerDmg: 1.1,  unitDmg: 1.2, unitSpeed: 1.2, enemySlow: 0.8, darkness: true,
              hazard: { every: 1300, count: 1, radius: 110, damage: 10, applies: 'airborne', knock: 220, delay: 600, impact: 'slam' } },
};

// ---------------------------------------------------------------- helpers
export function statMult(power) { return Math.min(ARMY.maxStatMult, 1 + Math.max(0, power) * ARMY.statPerPower); }
export function compositionFor(power) {
  let t = ARMY.tiers[0];
  for (const row of ARMY.tiers) if (power >= row.power) t = row;
  const out = { basic: t.basic, elite: t.elite, commander: t.commander };
  let over = out.basic + out.elite + out.commander - ARMY.capacity;
  while (over-- > 0) out.basic -= 1;
  return out;
}
export function tierIndex(power) { let i = 0; ARMY.tiers.forEach((row, k) => { if (power >= row.power) i = k; }); return i; }
