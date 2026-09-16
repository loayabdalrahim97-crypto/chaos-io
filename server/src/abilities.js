// Server-authoritative game data: heroes, 10 normal abilities, 10 legendary abilities,
// 10 passives, status effects and combos. The client mirrors ids/names for display only.

// ---- heroes: each has a look (sprite sheet id on the client) and an innate passive.
// Killing a player steals one of their passives, so the hero you pick matters.
export const HEROES = {
  shadow:   { id: 'shadow',   nameAr: 'كاغي الظل',     passive: 'swift' },
  knight:   { id: 'knight',   nameAr: 'الفارس الحديدي', passive: 'stoneskin' },
  crimson:  { id: 'crimson',  nameAr: 'القرمزي',       passive: 'bloodlust' },
  bones:    { id: 'bones',    nameAr: 'العظمي',        passive: 'vampiric' },
  sakura:   { id: 'sakura',   nameAr: 'ساكورا',        passive: 'quickhands' },
  frost:    { id: 'frost',    nameAr: 'ابن الثلج',     passive: 'frosttouch' },
  golem:    { id: 'golem',    nameAr: 'الروبوت الذهبي', passive: 'thorns' },
  sage:     { id: 'sage',     nameAr: 'الحكيم',        passive: 'regen' },
  fox:      { id: 'fox',      nameAr: 'الذئب الأبيض',  passive: 'crit' },
  explorer: { id: 'explorer', nameAr: 'المستكشف',      passive: 'laststand' },
};
export const HERO_IDS = Object.keys(HEROES);

// ---- 10 normal abilities (pick 3 before the match) ----
// `applies` = status effect put on whoever gets hit (drives the combo system)
export const ABILITIES = {
  fireball:    { id: 'fireball',    cooldown: 4000,  speed: 640, damage: 14, radius: 8,  range: 900, applies: 'burn' },
  ice_shard:   { id: 'ice_shard',   cooldown: 4500,  speed: 760, damage: 12, radius: 8,  range: 900, applies: 'chill' },
  lightning:   { id: 'lightning',   cooldown: 6000,  telegraph: 450, damage: 18, radius: 60, range: 520, applies: 'shock' },
  water_splash:{ id: 'water_splash',cooldown: 6000,  damage: 8,  radius: 115, reach: 70, knock: 110, applies: 'wet' },
  gust:        { id: 'gust',        cooldown: 7000,  speed: 820, width: 90, length: 560, damage: 8, knock: 170, applies: 'airborne' },
  dash:        { id: 'dash',        cooldown: 6000,  range: 230, damage: 0 },
  shield:      { id: 'shield',      cooldown: 12000, duration: 2000, damage: 0 },
  trap:        { id: 'trap',        cooldown: 8000,  lifetime: 14000, damage: 16, radius: 46, applies: 'root', range: 380 },
  hunter_mark: { id: 'hunter_mark', cooldown: 5000,  speed: 950, damage: 8, radius: 7, range: 1100, applies: 'mark' },
  heal_spring: { id: 'heal_spring', cooldown: 13000, heal: 28, duration: 2000, damage: 0 },
};
export const NORMAL_IDS = Object.keys(ABILITIES);
export const PICKS_REQUIRED = 3;

// ---- 10 legendary abilities (pick 1, kept all match, key Q / 4) ----
export const LEGENDS = {
  meteor_storm:  { id: 'meteor_storm',  cooldown: 28000, count: 5, spread: 150, telegraph: 900, damage: 18, radius: 72, range: 600, applies: 'burn' },
  tsunami:       { id: 'tsunami',       cooldown: 30000, telegraph: 700, speed: 520, width: 210, damage: 26, knock: 220, applies: 'wet' },
  black_hole:    { id: 'black_hole',    cooldown: 28000, telegraph: 1400, pullRadius: 270, damage: 30, radius: 115, range: 560 },
  thunderstorm:  { id: 'thunderstorm',  cooldown: 30000, telegraph: 650, damage: 20, radius: 480, applies: 'shock' },
  ice_age:       { id: 'ice_age',       cooldown: 30000, telegraph: 500, damage: 16, radius: 250, applies: 'chill' },
  dragon_breath: { id: 'dragon_breath', cooldown: 26000, ticks: 3, tickMs: 300, damage: 12, radius: 370, arc: 0.62, applies: 'burn' },
  shadow_strike: { id: 'shadow_strike', cooldown: 28000, targets: 3, damage: 22, radius: 460, hopMs: 260 },
  kings_fortress:{ id: 'kings_fortress',cooldown: 32000, duration: 3000, heal: 30, speedMult: 1.4 },
  earth_prison:  { id: 'earth_prison',  cooldown: 26000, telegraph: 500, damage: 20, radius: 170, rootMs: 2200, range: 560 },
  fate_arrow:    { id: 'fate_arrow',    cooldown: 26000, telegraph: 250, speed: 1150, damage: 45, radius: 22, range: 2000, applies: 'mark' },
};
export const LEGEND_IDS = Object.keys(LEGENDS);

// boss-only ability during a Boss Hunt
export const BOSS_ABILITY = { id: 'boss_nova', cooldown: 6000, telegraph: 500, damage: 26, radius: 150 };

// always-available basic attack (shuriken)
export const BASIC_ABILITY = { id: 'strike', cooldown: 750, speed: 760, damage: 7, radius: 7, range: 620 };

// ---- passives (every hero starts with one; kills steal them) ----
export const PASSIVE_IDS = ['swift', 'stoneskin', 'bloodlust', 'vampiric', 'quickhands', 'frosttouch', 'thorns', 'regen', 'crit', 'laststand'];

// ---- status effects ----
export const STATUS_MS = { burn: 3000, chill: 2500, wet: 4500, shock: 2000, airborne: 500, root: 1500, mark: 5000, stun: 1000 };
export const BURN_DPS = 4;
export const CHILL_SLOW = 0.6;   // speed multiplier while chilled
export const WET_SLOW = 0.85;

export const MAX_HP = 150;
export const MAX_SHIELD = 50;
export const SHIELD_REGEN_DELAY = 4500;
export const SHIELD_REGEN_RATE = 10;
export const PLAYER_SPEED = 215;
export const PLAYER_RADIUS = 14;
