// Data-driven ability definitions — server-authoritative (the client only reads
// these to render icons/text; damage/cooldown/telegraph are ALWAYS enforced here).
// Add ability #13, #14, #50 by adding an entry below — nothing else needs to change.
export const ABILITIES = {
  dash: {
    id: 'dash', nameAr: 'اندفاع', nameEn: 'DASH', type: 'MOBILITY', rarity: 'COMMON',
    cooldown: 6000, castTime: 0, range: 220, damage: 0, radius: 0, desc: 'اندفاعة سريعة باتجاه الحركة مع حصانة لحظية.'
  },
  shield: {
    id: 'shield', nameAr: 'الدرع', nameEn: 'SHIELD', type: 'DEFENSIVE', rarity: 'COMMON',
    cooldown: 12000, castTime: 0, duration: 2200, damage: 0, radius: 0, desc: 'حصانة كاملة من كل الأضرار لمدة قصيرة.'
  },
  fireball: {
    id: 'fireball', nameAr: 'كرة النار', nameEn: 'FIREBALL', type: 'OFFENSIVE', rarity: 'COMMON',
    cooldown: 4500, castTime: 0, speed: 620, damage: 16, radius: 26, desc: 'مقذوف ناري سريع باتجاه الماوس — أول من يصطدم به يتضرر.'
  },
  meteor: {
    id: 'meteor', nameAr: 'النيزك', nameEn: 'METEOR', type: 'AREA', rarity: 'EPIC',
    cooldown: 10000, telegraph: 1100, damage: 34, radius: 95, desc: 'حدد منطقة — بعد إنذار واضح ينزل نيزك ضخم.'
  },
  lightning: {
    id: 'lightning', nameAr: 'البرق', nameEn: 'LIGHTNING', type: 'OFFENSIVE', rarity: 'RARE',
    cooldown: 7000, telegraph: 750, damage: 30, radius: 55, desc: 'يستهدف أقرب عدو بدائرة تحذير — إذا لم يتحرك يتضرر بشدة.'
  },
  blackhole: {
    id: 'blackhole', nameAr: 'الثقب الأسود', nameEn: 'BLACK HOLE', type: 'CONTROL', rarity: 'RARE',
    cooldown: 11000, telegraph: 600, pull: 1000, damage: 22, radius: 70, desc: 'يسحب من حوله لمدة ثانية ثم ينفجر.'
  },
  freeze: {
    id: 'freeze', nameAr: 'منطقة التجميد', nameEn: 'FREEZE ZONE', type: 'CONTROL', rarity: 'RARE',
    cooldown: 10000, telegraph: 400, duration: 2500, slowMult: 0.4, damage: 6, radius: 110, desc: 'منطقة تبطئ حركة من بداخلها بشدة.'
  },
  teleport: {
    id: 'teleport', nameAr: 'الانتقال', nameEn: 'TELEPORT', type: 'MOBILITY', rarity: 'RARE',
    cooldown: 9000, telegraph: 350, range: 380, damage: 0, radius: 0, desc: 'انتقال فوري لمسافة أبعد من الاندفاع، بإنذار قصير قبله.'
  },
  firewave: {
    id: 'firewave', nameAr: 'موجة النار', nameEn: 'FIRE WAVE', type: 'AREA', rarity: 'RARE',
    cooldown: 9500, telegraph: 700, speed: 640, width: 90, damage: 26, desc: 'موجة نار تجتاح الخريطة بالكامل باتجاه الماوس.'
  },
  mine: {
    id: 'mine', nameAr: 'الفخ', nameEn: 'MINE', type: 'TRICK', rarity: 'COMMON',
    cooldown: 8000, lifetime: 12000, damage: 24, radius: 50, desc: 'فخ غير مرئي تقريبًا — ينفجر بأول من يمر فوقه.'
  },
  tsunami: {
    id: 'tsunami', nameAr: 'تسونامي', nameEn: 'TSUNAMI', type: 'GLOBAL', rarity: 'LEGENDARY',
    cooldown: 26000, telegraph: 1000, speed: 500, width: 180, damage: 42, desc: 'موجة عملاقة تعبر جزءًا كبيرًا من الخريطة — ضرر كبير وعريض.'
  },
};
export const ABILITY_IDS = Object.keys(ABILITIES);

// Temporary ability granted only to whoever is currently the Boss Hunt target —
// never offered as a normal upgrade, never placed in a player's `abilities` array.
export const BOSS_ABILITIES = {
  boss_nova: {
    id: 'boss_nova', nameAr: 'انفجار الوحش', nameEn: 'BOSS NOVA', type: 'OFFENSIVE', rarity: 'LEGENDARY',
    cooldown: 6000, telegraph: 500, damage: 26, radius: 150, desc: 'انفجار قوي حول الوحش يضرب كل من يقترب منه.'
  },
};

export const STARTER_ABILITIES = ['dash', 'shield']; // every player begins with just these two
export const MAX_ABILITY_SLOTS = 4;

export const PASSIVES = {
  bloodlust:  { id: 'bloodlust',  nameAr: 'نهم الدم',     nameEn: 'BLOODLUST',   desc: '+15% سرعة لمدة 5 ثوانٍ بعد كل قتل.' },
  vampiric:   { id: 'vampiric',   nameAr: 'الامتصاص',      nameEn: 'VAMPIRIC',    desc: 'يشفيك 12% من كل ضرر تسببه.' },
  quickhands: { id: 'quickhands', nameAr: 'اليد السريعة',  nameEn: 'QUICK HANDS', desc: 'كل الكولداون أسرع بنسبة 15%.' },
  laststand:  { id: 'laststand',  nameAr: 'الصمود الأخير', nameEn: 'LAST STAND',  desc: '+25% سرعة إذا هبطت صحتك دون 30%.' },
  thorns:     { id: 'thorns',     nameAr: 'الأشواك',       nameEn: 'THORNS',      desc: '15% من الضرر الذي يصيبك يرتد على المهاجم.' },
};
export const PASSIVE_IDS = Object.keys(PASSIVES);
export const MAX_PASSIVE_SLOTS = 3;

export const MAX_HP = 100;
export const MAX_SHIELD = 45;
export const SHIELD_REGEN_DELAY = 4500;
export const SHIELD_REGEN_RATE = 11; // per second
export const PLAYER_SPEED = 230;
