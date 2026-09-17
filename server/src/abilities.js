// Server-authoritative game data: heroes, 16 normal abilities, 14 legendary abilities,
// 4 mythic abilities (earned by killing the champion), 10 passives, statuses and combos.
// The client mirrors ids/names for display only.

export const HEROES = {
  shadow:   { id: 'shadow',   passive: 'swift' },
  knight:   { id: 'knight',   passive: 'stoneskin' },
  crimson:  { id: 'crimson',  passive: 'bloodlust' },
  bones:    { id: 'bones',    passive: 'vampiric' },
  sakura:   { id: 'sakura',   passive: 'quickhands' },
  frost:    { id: 'frost',    passive: 'frosttouch' },
  golem:    { id: 'golem',    passive: 'thorns' },
  sage:     { id: 'sage',     passive: 'regen' },
  fox:      { id: 'fox',      passive: 'crit' },
  explorer: { id: 'explorer', passive: 'laststand' },
};
export const HERO_IDS = Object.keys(HEROES);

// ---- 16 normal abilities (pick 3 before the match) ----
// `applies` = status effect put on whoever gets hit (drives the combo system)
export const ABILITIES = {
  fireball:        { cooldown: 4000,  speed: 680, damage: 16, radius: 10, range: 900, applies: 'burn', splash: 70 },
  ice_shard:       { cooldown: 4500,  speed: 800, damage: 13, radius: 9,  range: 900, applies: 'chill' },
  lightning:       { cooldown: 6000,  telegraph: 400, damage: 20, radius: 80, range: 560, applies: 'shock' },
  water_splash:    { cooldown: 6000,  damage: 10, radius: 140, reach: 70, knock: 150, applies: 'wet' },
  gust:            { cooldown: 7000,  speed: 860, width: 110, length: 600, damage: 9, knock: 200, applies: 'airborne' },
  dash:            { cooldown: 5500,  range: 260, damage: 0 },
  shield:          { cooldown: 12000, duration: 2200, damage: 0 },
  trap:            { cooldown: 8000,  lifetime: 14000, damage: 18, radius: 52, applies: 'root', range: 420 },
  hunter_mark:     { cooldown: 5000,  speed: 1000, damage: 9, radius: 8, range: 1150, applies: 'mark' },
  heal_spring:     { cooldown: 13000, heal: 34, duration: 2000, damage: 0 },
  poison_dagger:   { cooldown: 4500,  speed: 880, damage: 10, radius: 8, range: 800, applies: 'poison' },
  chain_lightning: { cooldown: 7000,  damage: 15, range: 560, bounces: 3, bounceRange: 280, applies: 'shock' },
  vine_pull:       { cooldown: 8000,  speed: 950, damage: 10, radius: 12, range: 560, pull: 230, rootMs: 800 },
  boomerang:       { cooldown: 5500,  speed: 760, damage: 13, radius: 16, range: 500 },
  ground_slam:     { cooldown: 7500,  telegraph: 250, damage: 18, radius: 160, knock: 170, applies: 'airborne' },
  berserk:         { cooldown: 16000, duration: 5000, dmgMult: 1.35, speedMult: 1.2 },
};
export const NORMAL_IDS = Object.keys(ABILITIES);
export const PICKS_REQUIRED = 3;

// ---- 14 legendary abilities (pick 1, kept all match, key Q) ----
export const LEGENDS = {
  meteor_storm:   { cooldown: 28000, count: 6, spread: 170, telegraph: 900, damage: 20, radius: 85, range: 620, applies: 'burn' },
  tsunami:        { cooldown: 30000, telegraph: 700, speed: 540, width: 240, length: 2600, damage: 28, knock: 260, applies: 'wet' },
  black_hole:     { cooldown: 28000, telegraph: 1500, pullRadius: 300, damage: 34, radius: 130, range: 580 },
  thunderstorm:   { cooldown: 30000, telegraph: 650, damage: 22, radius: 500, applies: 'shock' },
  ice_age:        { cooldown: 30000, telegraph: 500, damage: 18, radius: 280, applies: 'chill' },
  dragon_breath:  { cooldown: 26000, ticks: 4, tickMs: 280, damage: 12, radius: 400, arc: 0.65, applies: 'burn' },
  shadow_strike:  { cooldown: 28000, targets: 3, damage: 24, radius: 480, hopMs: 260 },
  kings_fortress: { cooldown: 32000, duration: 3000, heal: 40, speedMult: 1.4 },
  earth_prison:   { cooldown: 26000, telegraph: 500, damage: 22, radius: 190, rootMs: 2300, range: 580 },
  fate_arrow:     { cooldown: 26000, telegraph: 300, speed: 1200, damage: 50, radius: 24, range: 2000, applies: 'mark' },
  // time & reality control
  time_rewind:    { cooldown: 26000, seconds: 3 },
  time_bubble:    { cooldown: 28000, duration: 4500, radius: 230, range: 560, slow: 0.25 },
  reality_swap:   { cooldown: 30000, range: 720 },
  reality_rift:   { cooldown: 28000, duration: 4500, radius: 250, range: 560 },
};
export const LEGEND_IDS = Object.keys(LEGENDS);

// ---- 4 mythic abilities: only earned by killing the champion (key E) ----
export const MYTHICS = {
  time_stop:     { cooldown: 35000, duration: 2600 },
  reality_warp:  { cooldown: 35000, duration: 3200, radius: 480 },
  destiny_snap:  { cooldown: 45000, telegraph: 900, fraction: 0.35, min: 18 },
  space_portal:  { cooldown: 30000, range: 1000, damage: 28, radius: 140 },
};
export const MYTHIC_IDS = Object.keys(MYTHICS);

// always-available basic attack (shuriken)
export const BASIC_ABILITY = { id: 'strike', cooldown: 700, speed: 780, damage: 8, radius: 8, range: 640 };

// ---- passives (every hero starts with one; kills steal them) ----
export const PASSIVE_IDS = ['swift', 'stoneskin', 'bloodlust', 'vampiric', 'quickhands', 'frosttouch', 'thorns', 'regen', 'crit', 'laststand'];

// ---- status effects ----
export const STATUS_MS = {
  burn: 3000, chill: 2500, wet: 4500, shock: 2000, airborne: 550, root: 1500, mark: 5000, stun: 1000,
  poison: 4500, slowtime: 400, inverted: 600, timestop: 2600, polymorph: 3200, berserk: 5000,
};
export const BURN_DPS = 5;
export const POISON_DPS = 4;
export const CHILL_SLOW = 0.6;
export const WET_SLOW = 0.85;

export const MAX_HP = 150;
export const MAX_SHIELD = 50;
export const CHAMPION_HP_BONUS = 40;
export const CHAMPION_DMG_MULT = 1.2;
export const CHAMPION_MIN_KILLS = 2;
export const SHIELD_REGEN_DELAY = 4500;
export const SHIELD_REGEN_RATE = 10;
export const PLAYER_SPEED = 215;
export const PLAYER_RADIUS = 14;
