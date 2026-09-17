// Display data for the client (names, descriptions, icons). Numbers come from ./shared/abilities.js,
// an exact copy of server/src/abilities.js (the server is the authority).
//
// Art: "Ninja Adventure" asset pack by Pixel-boy (CC0), loaded from pinned GitHub commits via jsDelivr.
import * as S from './shared/abilities.js';
import * as AR from './shared/army.js';
export { AR };

const LOCAL = typeof location !== 'undefined' && (location.hostname === 'localhost' || location.hostname === '127.0.0.1');
export const SP = LOCAL ? '/na/sp' : 'https://cdn.jsdelivr.net/gh/sparklinlabs/superpowers-asset-packs@e8674a03ab4456802f71f848c4df79eccca23f7a/ninja-adventure';
export const GD = LOCAL ? '/na/gd' : 'https://cdn.jsdelivr.net/gh/pixel-boy/NinjaAdventure@6ac78232d5aedcc85ce5f27d060ea92366f7c24a/content/map';

export const HEROES = {
  shadow:   { nameAr: 'كاغي الظل',      sheet: 7,  passive: 'swift' },
  knight:   { nameAr: 'الفارس الحديدي', sheet: 18, passive: 'stoneskin' },
  crimson:  { nameAr: 'القرمزي',        sheet: 24, passive: 'bloodlust' },
  bones:    { nameAr: 'العظمي',         sheet: 23, passive: 'vampiric' },
  sakura:   { nameAr: 'ساكورا',         sheet: 5,  passive: 'quickhands' },
  frost:    { nameAr: 'ابن الثلج',      sheet: 19, passive: 'frosttouch' },
  golem:    { nameAr: 'الروبوت الذهبي', sheet: 20, passive: 'thorns' },
  sage:     { nameAr: 'الحكيم',         sheet: 9,  passive: 'regen' },
  fox:      { nameAr: 'الذئب الأبيض',   sheet: 11, passive: 'crit' },
  explorer: { nameAr: 'المستكشف',       sheet: 14, passive: 'laststand' },
};
export const HERO_IDS = Object.keys(HEROES);
export const faceUrl = (hero) => `${SP}/characters/faceset/${HEROES[hero].sheet}.png`;

export const FAMILIES = {
  fire:   { nameAr: 'النار',   icon: '🔥', color: 0xff7a3c, css: '#ff7a3c' },
  ice:    { nameAr: 'الجليد',  icon: '❄️', color: 0x8ae8ff, css: '#8ae8ff' },
  storm:  { nameAr: 'العاصفة', icon: '⚡', color: 0xfff27a, css: '#fff27a' },
  shadow: { nameAr: 'الظلال',  icon: '🌑', color: 0xb58cff, css: '#b58cff' },
  nature: { nameAr: 'الطبيعة', icon: '🌿', color: 0x7ccf4a, css: '#7ccf4a' },
};

// icon shorthand: 'i:items/x.png' image · 'f:12:2' frame 2 of fx strip 12 · optional '|180' hue rotate
// [nameAr, icon, color, desc, visual overrides]
const NORMAL_UI = {
  // fire
  fireball:       ['كرة النار', 'i:items/fireball.png', 0xff7a3c, 'كرة نار متفجرة تحرق الهدف وتضرب اللي حواليه.'],
  flame_dash:     ['اندفاع اللهب', 'f:20:2', 0xff9a3c, 'تندفع للأمام وبتحرق اللي بطريقك وبتترك نار ورا.'],
  fire_ring:      ['حلقة النار', 'f:12:2', 0xff5a1f, 'حلقة نار حولك بتحرق وبتدفع الأعداء.'],
  magma_bolt:     ['صاروخ الحمم', 'i:items/scroll-fire.png', 0xff4a1a, 'كتلة حمم بتنزل على الهدف بعد لحظة — ضرر ضخم.'],
  burning_ground: ['أرض مشتعلة', 'f:12:1', 0xff6a2a, 'منطقة نار 4 ثوانٍ بتحرق كل من يدخلها.'],
  ember_fan:      ['مروحة الجمر', 'i:items/fireball.png|25', 0xffa040, '3 كرات جمر على شكل مروحة.'],
  lava_mine:      ['لغم الحمم', 'i:items/jar.png', 0xff5a1f, 'لغم مخفي — بينفجر نار على اللي حواليه.'],
  fire_whip:      ['سوط النار', 'f:20:3', 0xff7a3c, 'ضربة نار قريبة أمامك بتحرق وبتدفع.'],
  phoenix_heal:   ['ريشة الفينيق', 'i:items/life-pot.png|-60', 0xffb060, 'بتشفيك 30 وبتحرق الأعداء القريبين.'],
  berserk:        ['غضب المحارب', 'f:12:1|-20', 0xff4040, '5 ثوانٍ: ضرر +35% وسرعة +20% (بس بتتضرر أكثر).'],
  // ice
  ice_shard:      ['رمح الجليد', 'i:items/ice-spike.png', 0x8ae8ff, 'رمح جليدي يبطّئ الهدف. تبريد مرتين = تجميد!'],
  water_splash:   ['دفقة الماء', 'i:items/water-pot.png', 0x4cb6ff, 'موجة ماء قريبة تدفع الأعداء وتبلّلهم.'],
  frost_nova:     ['انفجار الصقيع', 'f:15:2', 0x9fe8ff, 'انفجار برد حولك بيبرّد كل القريبين.'],
  glacial_spike:  ['الشوكة الجليدية', 'i:items/ice-spike.png|40', 0xbff4ff, 'شوكة ثلج بتخترق كل الأعداء بخط واحد.'],
  frozen_ground:  ['أرض متجمدة', 'i:items/scroll-ice.png', 0x9fe8ff, 'منطقة جليد بتبطّئ وبتبرّد اللي فيها.'],
  snow_barrage:   ['وابل الثلج', 'f:14:2', 0xdff4ff, '5 كرات ثلج صغيرة مع بعض.'],
  blizzard_cone:  ['عاصفة ثلجية', 'f:15:3', 0xbfe8ff, 'رياح ثلج أمامك 3 مرات متتالية.'],
  ice_blink:      ['وميض الجليد', 'f:14:3', 0x8ae8ff, 'بتنتقل فورًا وبتترك انفجار برد مكانك.'],
  frost_trap:     ['فخ الصقيع', 'f:15:1', 0x9fe8ff, 'فخ بيجمّد أول عدو يدوس عليه.'],
  ice_armor:      ['درع الجليد', 'f:4:0|160', 0xaee8ff, 'درع +35 وبترد المقذوفات عليهم لثانية ونص.'],
  // storm
  lightning:      ['صاعقة', 'f:19:1', 0xfff27a, 'صاعقة من السما على منطقة. على هدف مبلول = صعق وشلل.'],
  chain_lightning:['برق متسلسل', 'f:19:3', 0x9fd8ff, 'برق يقفز بين 3 أعداء قريبين من بعض.'],
  static_dash:    ['اندفاع كهربائي', 'f:6:1', 0xfff27a, 'تندفع وبتكهرب كل من تمر فيه.'],
  thunder_orb:    ['كرة الرعد', 'f:3:2', 0xfff27a, 'كرة برق بطيئة وكبيرة بتخترق الكل.'],
  overcharge:     ['شحن زائد', 'f:5:2', 0xffff9a, '4 ثوانٍ سرعة +35% وبتمسح التأثيرات عنك.'],
  shock_field:    ['حقل الصعق', 'i:items/scroll-thunder.png', 0xfff27a, 'منطقة كهربا بتصعق اللي فيها.'],
  spark_fan:      ['شرارات', 'f:5:1', 0xffe27a, '3 شرارات سريعة.'],
  magnet_pull:    ['المغناطيس', 'f:1:2|200', 0xc8b0ff, 'بيسحب كل الأعداء بالمنطقة لنقطة وحدة.'],
  ball_lightning: ['البرق الملاحِق', 'f:3:3', 0xfff9b0, 'كرة برق بتلاحق أقرب عدو.'],
  stun_bolt:      ['سهم الشلل', 'i:items/kunai.png|200', 0xfff27a, 'سهم سريع بيشل الهدف ثانية تقريبًا.'],
  // shadow
  dash:           ['اندفاع الظل', 'f:6:1|220', 0xb9a6ff, 'اندفاعة سريعة مع حصانة لحظية، وضربتك التالية +40%.'],
  hunter_mark:    ['سهم الصياد', 'i:items/arrow.png', 0xff5e7a, 'سهم بعيد المدى يضع علامة — الضربة التالية عليه أقوى.'],
  poison_dagger:  ['خنجر السم', 'i:weapons/sai.png', 0x9be25a, 'يسمّم الهدف: ضرر مستمر وشفاؤه ينقص للنص.'],
  smoke_bomb:     ['قنبلة دخان', 'f:18:3', 0x9a9aa8, 'دخان حولك بيخفيك وبيضعف الأعداء.'],
  shadow_step:    ['خطوة الظل', 'f:7:1', 0x9d7bff, 'بتظهر ورا أقرب عدو وضربتك الجاية أقوى.'],
  silence_seal:   ['ختم الصمت', 'i:items/scroll-empty.png', 0xd0a0ff, 'اللي بيصيبه ما بيقدر يستخدم قدرات ثانيتين.'],
  soul_drain:     ['امتصاص الروح', 'f:9:2|220', 0xff6bd8, 'بتسرق صحة بقد الضرر اللي بتعمله.'],
  shuriken_storm: ['عاصفة الشوريكن', 'i:hud/shuriken.png', 0xdddddd, '5 شوريكن على شكل مروحة.'],
  cursed_ground:  ['أرض ملعونة', 'f:17:2', 0xb05bff, 'بتعلّم وبتضعف كل من يدخلها.'],
  toxic_cloud:    ['غيمة سامة', 'f:18:4|80', 0x9be25a, 'غيمة سم بتسمّم اللي فيها.'],
  // nature
  gust:           ['عاصفة الريح', 'f:13:2', 0xe8f4ff, 'ريح تطيّر الأعداء للخلف. مع الحرق = إعصار ناري.'],
  vine_pull:      ['سوط الكروم', 'i:items/scroll-plant.png', 0x7ccf4a, 'يسحب أول عدو يصيبه لعندك ويثبّته.'],
  heal_spring:    ['ينبوع الشفاء', 'i:items/life-pot.png', 0x7dffb0, 'يشفيك مع الوقت ويزيل التأثيرات.'],
  shield:         ['درع الحجر', 'f:4:0', 0xffd166, 'حصانة كاملة من كل الضرر لمدة ثانيتين.'],
  trap:           ['فخ الجذور', 'f:16:3', 0x9ccc65, 'فخ مخفي — يثبّت أول عدو يدوس عليه.'],
  ground_slam:    ['ضربة الأرض', 'f:18:3|30', 0xc9a06a, 'تضرب الأرض حولك وتطيّر كل الأعداء القريبين.'],
  boomerang:      ['الفأس الدوّار', 'i:weapons/axe.png', 0xffc36b, 'فأس بيروح وبيرجع — بيخترق الكل وبيضرب مرتين.'],
  thorn_field:    ['حقل الأشواك', 'f:16:2', 0x6fae3a, 'أشواك بتجرح وأحيانًا بتثبّت اللي فيها.'],
  rock_throw:     ['رمية الصخرة', 'i:items/scroll-rock.png', 0xa0703f, 'صخرة ثقيلة بتدفع وبتشل لحظة.'],
  earth_spikes:   ['أشواك الأرض', 'i:weapons/lance.png', 0xc28e5c, 'صف أشواك بيطلع من الأرض قدامك.'],
};

const LEGEND_UI = {
  meteor_storm:   ['مطر النيازك', 'f:12:2', 0xff6a3d, 'ست نيازك تسقط على المنطقة وتحرق كل من فيها.'],
  tsunami:        ['تسونامي', 'f:15:2', 0x3fa9ff, 'موجة عملاقة تعبر الخريطة، تدفع وتبلّل الجميع.'],
  black_hole:     ['الثقب الأسود', 'f:17:2|40', 0xb388ff, 'يسحب الأعداء نحو المركز ثم ينفجر.'],
  thunderstorm:   ['عاصفة الرعد', 'i:items/scroll-thunder.png', 0xfff27a, 'صواعق تضرب كل الأعداء القريبين منك.'],
  ice_age:        ['العصر الجليدي', 'i:items/scroll-ice.png', 0x9fe8ff, 'انفجار جليدي حولك يبطّئ ويجمّد.'],
  dragon_breath:  ['نفَس التنين', 'f:20:2', 0xff5a1f, 'نار مخروطية أمامك أربع مرات متتالية.'],
  shadow_strike:  ['ضربة الظلال', 'f:7:1', 0x9d7bff, 'تنتقل بين 3 أعداء قريبين وتضرب كل واحد.'],
  kings_fortress: ['حصن الملك', 'i:items/gold-cup.png', 0xffd166, 'حصانة 3 ثوانٍ + شفاء + سرعة وإزالة كل التأثيرات.'],
  earth_prison:   ['سجن الأرض', 'i:items/scroll-rock.png', 0xc28e5c, 'تثبيت كل من في المنطقة لأكثر من ثانيتين.'],
  fate_arrow:     ['سهم القدر', 'i:weapons/bow.png', 0xffe27a, 'سهم عملاق يخترق كل شيء وضرره هائل.'],
  time_rewind:    ['⏳ العودة بالزمن', 'f:13:4', 0x7fe0ff, 'ترجع بالزمن 3 ثوانٍ: مكانك وصحتك زي ما كانوا.'],
  time_bubble:    ['⏳ فقاعة الزمن', 'f:3:3', 0x8fd0ff, 'قبة يتباطأ فيها الزمن: الأعداء والمقذوفات جواها بطيئين جدًا.'],
  reality_swap:   ['🌀 تبديل الواقع', 'f:5:2|240', 0xd07bff, 'تبدّل مكانك مع عدو — وإذا صحته أعلى منك بتتبدل الصحة كمان!'],
  reality_rift:   ['🌀 شقّ الواقع', 'f:17:3', 0xff5bd8, 'منطقة بتقلب تحكم الأعداء، ومقذوفاتهم بترجع عليهم.'],
  phoenix_rebirth:['🔥 بعث الفينيق', 'f:20:1', 0xffa040, '9 ثوانٍ: إذا متت بترجع بنص صحتك وبتنفجر نار.'],
  arrow_turret:   ['🏹 برج السهام', 'i:weapons/bow.png|90', 0x9ccc65, 'بتزرع برج بيرمي سهام على أقرب عدو 7 ثوانٍ.'],
  earthquake:     ['🌍 الزلزال', 'f:18:4|30', 0xc9a06a, 'موجات هزة بتطلع منك وبتطيّر كل اللي حواليك.'],
  lightning_form: ['⚡ جسد البرق', 'f:19:4', 0xfff27a, '5 ثوانٍ: أسرع بكثير وبتكهرب كل من يقرب منك.'],
  blood_moon:     ['🌕 القمر الدموي', 'i:items/heart.png|-30', 0xff3050, '6 ثوانٍ: ضرر +25% وبتسرق 40% من الضرر صحة.'],
  arrow_rain:     ['🏹 مطر السهام', 'i:items/arrow.png|60', 0xffe27a, '10 رشقات سهام على منطقة كبيرة.'],
};

const MYTHIC_UI = {
  time_stop:    ['⏸️ إيقاف الزمن', 'f:4:2', 0xffe27a, 'بتوقف الزمن لكل الأعداء 2.6 ثانية — إلا أنت.'],
  reality_warp: ['🐶 تحريف الواقع', 'f:17:1', 0xff6bf0, 'بتحوّل كل الأعداء القريبين لحيوانات ضعيفة 3 ثوانٍ.'],
  destiny_snap: ['🫰 طقة القدر', 'f:7:2', 0xffffff, 'بطقة وحدة: كل عدو بالخريطة يخسر 35% من صحته.'],
  space_portal: ['🌌 بوابة الفضاء', 'f:14:3', 0x9d7bff, 'بتفتح بوابة وتنتقل لأي مكان — انفجار عند البداية والنهاية.'],
};

const FUSION_UI = {
  sun_flare:       ['☀️ شمس محرقة', 'f:12:3', 0xffd166, 'انفجار شمسي ضخم حولك.'],
  permafrost:      ['🧊 الجليد الأبدي', 'i:items/scroll-ice.png|30', 0xbff4ff, 'منطقة جليد كبيرة 5 ثوانٍ.'],
  storm_caller:    ['🌩️ مستدعي العاصفة', 'f:19:2', 0xfff27a, '7 صواعق على منطقة واسعة.'],
  death_mark:      ['💀 علامة الموت', 'i:items/kunai.png|260', 0xb05bff, 'خنجر بيخترق وبيعلّم وبيضعف.'],
  world_tree:      ['🌳 شجرة العالم', 'i:items/scroll-plant.png|40', 0x7dffb0, 'هالة بتشفيك وبتثبّت الأعداء القريبين.'],
  steam_explosion: ['♨️ انفجار البخار', 'f:18:4|180', 0xe0f0ff, 'انفجار بخار بيدفع وبيبلّل.'],
  plasma_beam:     ['☄️ شعاع البلازما', 'f:6:2|-30', 0xff9a3c, 'شعاع طويل سريع بيحرق كل اللي بطريقه.'],
  hellfire_blades: ['🔥 شفرات الجحيم', 'f:10:2', 0xff5a1f, '8 شفرات نار بكل الاتجاهات.'],
  volcano:         ['🌋 البركان', 'f:12:2|-20', 0xff4a1a, 'بركان بيحرق ثم بينفجر بقوة.'],
  frozen_thunder:  ['❄️⚡ الرعد المتجمد', 'f:19:3|160', 0xbfe8ff, 'برق بيقفز بين 5 أعداء وبيبرّدهم.'],
  frost_phantom:   ['👻 شبح الصقيع', 'f:14:2', 0x9fe8ff, 'بتظهر ورا العدو وبتجمّده.'],
  glacier_tomb:    ['🏔️ قبر الجليد', 'f:15:4', 0x9fe8ff, 'بتسجن كل القريبين بالجليد ثانيتين.'],
  void_bolt:       ['🕳️ سهم الفراغ', 'f:17:4', 0xb05bff, 'سهم بيلاحق وبيخترق وبيسكّت الأعداء.'],
  hurricane:       ['🌪️ الإعصار', 'f:13:3', 0xe8f4ff, 'إعصار حولك بيسحب ويكهرب.'],
  plague_swarm:    ['🦟 سرب الطاعون', 'f:18:2|80', 0x9be25a, '5 حشرات سامة بتلاحق الأعداء.'],
};

function parseIcon(s) {
  const [main, hue] = s.split('|');
  const [t, a, b] = main.split(':');
  const icon = t === 'i' ? { img: a } : { fx: Number(a), f: Number(b) };
  if (hue) icon.hue = Number(hue);
  return icon;
}
function build(stats, ui) {
  const out = {};
  Object.keys(stats).forEach((id) => {
    const u = ui[id] || [id, 'f:1:1', 0xffffff, ''];
    const st = stats[id];
    out[id] = { ...st, id, nameAr: u[0], icon: parseIcon(u[1]), color: u[2], desc: u[3], self: selfCast({ ...st, id }) };
  });
  return out;
}
function selfCast(a) {
  return a.kind === 'buff' || (a.kind === 'strike' && (a.at === 'self' || a.at === 'rings')) || (a.kind === 'zone' && a.at === 'self') || a.kind === 'hop'
    || ['thunderstorm', 'time_rewind', 'time_stop', 'reality_warp', 'destiny_snap'].includes(a.id);
}

export const ABILITIES = build(S.ABILITIES, NORMAL_UI);
export const NORMAL_IDS = Object.keys(ABILITIES);
export const PICKS_REQUIRED = S.PICKS_REQUIRED;
export const LEGENDS = build(S.LEGENDS, LEGEND_UI);
export const LEGEND_IDS = Object.keys(LEGENDS);
export const MYTHICS = build(Object.fromEntries(Object.entries(S.MYTHICS).map(([k, v]) => [k, { ...v, id: k }])), MYTHIC_UI);
export const FUSIONS = build(S.FUSIONS, FUSION_UI);
export const BASIC = { ...S.BASIC_ABILITY, nameAr: 'شوريكن', color: 0xe8e8e8, icon: { img: 'hud/shuriken.png' } };
export const CURSE = { ...S.GHOST_CURSE, nameAr: '👻 لعنة الشبح', color: 0xb0c0ff, icon: { fx: 17, f: 2, hue: 180 }, self: true };
const EXTRA = {
  turret_shot: { id: 'turret_shot', kind: 'proj', speed: 900, range: 600, nameAr: 'سهم البرج', color: 0x9ccc65 },
  boss_rock:   { id: 'boss_rock', kind: 'proj', speed: 560, range: 600, nameAr: 'صخرة الغول', color: 0xa0703f },
  boss_slam:   { id: 'boss_slam', kind: 'strike', nameAr: 'ضربة الغول', color: 0xc9a06a },
  boss_nova:   { id: 'boss_nova', kind: 'strike', nameAr: 'غضب الغول', color: 0xff5a1f },
  meteor:      { id: 'meteor', kind: 'strike', nameAr: 'نيزك', color: 0xff6a3d },
  lava:        { id: 'lava', kind: 'strike', nameAr: 'حمم', color: 0xff5a1f },
};
Object.values(ABILITIES).forEach((a) => { a.familyInfo = FAMILIES[a.family]; });

export const defOf = (id) => ABILITIES[id] || LEGENDS[id] || MYTHICS[id] || FUSIONS[id] || EXTRA[id] || (id === BASIC.id ? BASIC : id === CURSE.id ? CURSE : null);

export const UPGRADES = {
  cdr:   { nameAr: 'تبريد أسرع', icon: '⏱️', desc: 'كل الكولداون أسرع 12%' },
  dmg:   { nameAr: 'قوة', icon: '💪', desc: 'ضرر +15%' },
  hp:    { nameAr: 'صحة', icon: '❤️', desc: '+25 صحة قصوى وشفاء' },
  speed: { nameAr: 'سرعة', icon: '👟', desc: 'حركة +8%' },
  armor: { nameAr: 'درع', icon: '🛡️', desc: 'ضرر أقل عليك 10%' },
  vamp:  { nameAr: 'مصّ دماء', icon: '🦇', desc: 'بتسرق 6% من ضررك صحة' },
  regen: { nameAr: 'تجدد', icon: '🌿', desc: '+2 صحة كل ثانية' },
};

export const PASSIVES = {
  swift:      { nameAr: 'خفة الريح',     icon: '💨', desc: '+12% سرعة حركة.' },
  stoneskin:  { nameAr: 'جلد الحجر',     icon: '🪨', desc: '-15% من كل ضرر تتلقاه.' },
  bloodlust:  { nameAr: 'نهم الدم',      icon: '🩸', desc: 'بعد كل قتل: سرعة +20% وشفاء.' },
  vampiric:   { nameAr: 'مصاص الدماء',   icon: '🦇', desc: 'تستعيد 12% من الضرر الذي تسببه.' },
  quickhands: { nameAr: 'اليد السريعة',  icon: '⚡', desc: 'كل الكولداون أسرع 15%.' },
  frosttouch: { nameAr: 'لمسة الصقيع',   icon: '❄️', desc: '25% فرصة تبريد الهدف مع كل ضربة.' },
  thorns:     { nameAr: 'الأشواك',       icon: '🌵', desc: '15% من الضرر يرتد على المهاجم.' },
  regen:      { nameAr: 'التجدد',        icon: '🌿', desc: 'تستعيد الصحة إذا لم تُضرب 3 ثوانٍ.' },
  crit:       { nameAr: 'العين الثاقبة', icon: '🎯', desc: '20% فرصة ضربة حرجة ×1.6.' },
  laststand:  { nameAr: 'الصمود الأخير', icon: '🔥', desc: 'تحت 30% صحة: أسرع وضرر أقل عليك.' },
};

export const STATUS = {
  burn:      { icon: '🔥', nameAr: 'حرق',    color: '#ff7a3c' },
  chill:     { icon: '❄️', nameAr: 'تبريد',  color: '#8ae8ff' },
  wet:       { icon: '💧', nameAr: 'مبلول',  color: '#4cb6ff' },
  shock:     { icon: '⚡', nameAr: 'مكهرب',  color: '#fff27a' },
  root:      { icon: '🌿', nameAr: 'مثبّت',  color: '#9ccc65' },
  stun:      { icon: '💫', nameAr: 'مشلول',  color: '#ffffff' },
  mark:      { icon: '🎯', nameAr: 'معلَّم', color: '#ff5e7a' },
  airborne:  { icon: '🌪️', nameAr: 'طائر',   color: '#e8f4ff' },
  poison:    { icon: '🧪', nameAr: 'مسموم',  color: '#9be25a' },
  slowtime:  { icon: '⏳', nameAr: 'زمن بطيء', color: '#8fd0ff' },
  inverted:  { icon: '🔄', nameAr: 'تحكم مقلوب', color: '#ff5bd8' },
  timestop:  { icon: '⏸️', nameAr: 'الزمن متوقف', color: '#ffe27a' },
  polymorph: { icon: '🐶', nameAr: 'متحوّل', color: '#ff6bf0' },
  berserk:   { icon: '😡', nameAr: 'غضب',   color: '#ff4040' },
  silence:   { icon: '🤐', nameAr: 'صامت',  color: '#d0a0ff' },
  weak:      { icon: '🥀', nameAr: 'ضعيف',  color: '#b05bff' },
  haste:     { icon: '💨', nameAr: 'سريع',  color: '#fff27a' },
  stealth:   { icon: '👤', nameAr: 'متخفي', color: '#9a9aa8' },
  reflect:   { icon: '🪞', nameAr: 'عاكس',  color: '#aee8ff' },
  phoenix:   { icon: '🐦‍🔥', nameAr: 'فينيق', color: '#ffa040' },
  lifesteal: { icon: '🩸', nameAr: 'مصّ دماء', color: '#ff3050' },
  empower:   { icon: '✨', nameAr: 'مشحون', color: '#b9a6ff' },
  onfire:    { icon: '🔥', nameAr: 'مولّع', color: '#ff7a3c' },
  rampage:   { icon: '💀', nameAr: 'هيجان', color: '#ff4040' },
};

export const COMBOS = {
  electro:    { nameAr: '⚡ صعق كهربائي!', color: '#fff27a', recipe: '💧 مبلول + ⚡ صاعقة', effect: 'ضرر إضافي + شلل ثانية' },
  freeze:     { nameAr: '❄️ تجمّد!',        color: '#9fe8ff', recipe: '💧 + ❄️  أو  ❄️ + ❄️', effect: 'الهدف يتجمد تمامًا' },
  shatter:    { nameAr: '💥 انصهار!',       color: '#ffb36b', recipe: '🔥 حرق + ❄️ تبريد', effect: 'ضرر انفجاري كبير' },
  steam:      { nameAr: '♨️ بخار!',         color: '#e0e0e0', recipe: '🔥 حرق + 💧 ماء', effect: 'ضرر إضافي' },
  firestorm:  { nameAr: '🌪️ إعصار ناري!',   color: '#ff7a3c', recipe: '🔥 حرق + 🌪️ ريح', effect: 'النار تنتشر للأعداء حوله' },
  toxic:      { nameAr: '☣️ انفجار سام!',   color: '#9be25a', recipe: '🧪 سم + 🔥 حرق', effect: 'السم ينتشر لكل اللي حواليه' },
  neurotoxin: { nameAr: '🧠 سم عصبي!',      color: '#d0ff7a', recipe: '🧪 سم + ⚡ كهربا', effect: 'ضرر + صمت' },
  execute:    { nameAr: '🗡️ إعدام!',        color: '#ff5e7a', recipe: '🥀 ضعف + 🎯 علامة', effect: '+22 ضرر' },
  mark:       { nameAr: '🎯 علامة الصياد!', color: '#ff5e7a', recipe: '🎯 علامة + أي ضربة', effect: '+14 ضرر' },
};

export const WORLD_EVENTS = {
  double_damage: '⚡ ضعف الضرر!',
  chaos: '🌀 فوضى — كولداون أسرع!',
  meteor_shower: '☄️ وابل نيازك!',
  darkness: '🌑 ليلة الظلام — ما بتشوف إلا حولك!',
  inverted_world: '🔄 الجاذبية المقلوبة — التحكم مقلوب للكل!',
  lava_rain: '🌋 مطر الحمم!',
  frozen_lake: '🧊 البحيرات تجمدت — تزلّج بسرعة!',
};

// ---- unlocks: XP from playing opens more of the pool (saved per browser)
export const XP = { kill: 10, win: 50, game: 5, boss: 30 };
export const UNLOCK_STEP = 40;
const START_PER_FAMILY = 6;
export const NORMAL_UNLOCK_ORDER = (() => {
  const fams = Object.keys(FAMILIES);
  const byFam = Object.fromEntries(fams.map((f) => [f, NORMAL_IDS.filter((id) => ABILITIES[id].family === f)]));
  const starters = fams.flatMap((f) => byFam[f].slice(0, START_PER_FAMILY));
  const rest = [];
  for (let i = START_PER_FAMILY; i < 10; i++) fams.forEach((f) => { if (byFam[f][i]) rest.push(byFam[f][i]); });
  return { starters, rest };
})();
export const LEGEND_START = 12;

// ---- map art: frames cut from the tilesets (pixel rects, drawn at 3x) ----
export const SCALE = 3;
export const OBJECT_FRAMES = {
  cluster: { tex: 'village', x: 0,   y: 96,  w: 64, h: 48 },
  tree:    { tex: 'village', x: 64,  y: 97,  w: 32, h: 31 },
  tree2:   { tex: 'village', x: 64,  y: 145, w: 32, h: 31 },
  log:     { tex: 'village', x: 96,  y: 96,  w: 15, h: 32 },
  stump:   { tex: 'village', x: 96,  y: 128, w: 16, h: 16 },
  house:   { tex: 'village', x: 192, y: 97,  w: 63, h: 79 },
  hut:     { tex: 'village', x: 256, y: 80,  w: 64, h: 88 },
  ruin:    { tex: 'village', x: 16,  y: 4,   w: 48, h: 44 },
  kiln:    { tex: 'village', x: 64,  y: 0,   w: 32, h: 48 },
  frog:    { tex: 'village', x: 144, y: 86,  w: 32, h: 26 },
  pillar:  { tex: 'village', x: 32,  y: 54,  w: 16, h: 26 },
  bush:    { tex: 'village', x: 64,  y: 80,  w: 32, h: 16 },
  pine:    { tex: 'tiles',   x: 96,  y: 161, w: 32, h: 30 },
  hedge:   { tex: 'tiles',   x: 0,   y: 162, w: 32, h: 29 },
  rock:    { tex: 'tiles',   x: 194, y: 164, w: 29, h: 27 },
  statue:  { tex: 'tiles',   x: 432, y: 96,  w: 16, h: 31 },
  crate:   { tex: 'tiles',   x: 384, y: 144, w: 16, h: 16 },
  pot:     { tex: 'tiles',   x: 18,  y: 146, w: 13, h: 13 },
  grass:   { tex: 'tiles',   x: 144, y: 241, w: 16, h: 13 },
  fern:    { tex: 'tiles',   x: 208, y: 130, w: 16, h: 14 },
  flower:  { tex: 'tiles',   x: 21,  y: 131, w: 11, h: 9 },
};
export const GROUND = {
  grass: [['floor', 11, 12], ['floor', 11, 12], ['floor', 11, 12], ['floor', 12, 12], ['floor', 13, 12], ['floor', 14, 12], ['floor', 15, 12]],
  dirt:  { tl: [11, 7], t: [12, 7], tr: [13, 7], l: [11, 8], c: [12, 8], r: [13, 8], bl: [11, 9], b: [12, 9], br: [13, 9] },
  pond:  { tl: [19, 7], t: [20, 7], tr: [21, 7], l: [19, 8], c: [20, 8], r: [21, 8], bl: [19, 9], b: [20, 9], br: [21, 9] },
};

// ---- strategic layer: armies, companions, domains
export const SLOT_COLORS = [0xff5a5a, 0xffb13d, 0xc46bff, 0x4cc9ff, 0xff6bd8, 0xfff27a, 0x7dffb0, 0xffffff];
export const UNIT_UI = {
  basic:     { nameAr: 'جندي', icon: '🗡️', sheet: 'characters/3.png', scale: 2.4 },
  elite:     { nameAr: 'نخبة', icon: '🏹', sheet: 'characters/1.png', scale: 2.5 },
  commander: { nameAr: 'قائد', icon: '⚜️', sheet: 'characters/21.png', scale: 3.3 },
  skeleton:  { nameAr: 'هيكل', icon: '💀', sheet: 'characters/23.png', scale: 2.3 },
};
export const ELEMENT_COLORS = { void: 0xb58cff, holy: 0xffe08a, fire: 0xff7a3c, death: 0x9be25a, blossom: 0xff9ad8, ice: 0x9fe8ff, storm: 0xfff27a, water: 0x4cb6ff, moon: 0xdfe6ff, sand: 0xe0b070 };
// [nameAr, sheet, color, desc]
const COMPANION_UI = {
  void_stalker: ['متربّص الفراغ', 'monsters/16.png', 0xb58cff, 'قاتل سريع بينتقل ورا العدو وبيضعفه.'],
  void_eye:     ['عين الفراغ', 'monsters/17.png', 0xc46bff, 'بيرمي طاقة فراغ بتسكّت الأعداء.'],
  royal_guard:  ['الحارس الملكي', 'characters/15.png', 0xffd166, 'حارس ضخم بيحميك وبيشل اللي بيضربه.'],
  priestess:    ['الكاهنة', 'characters/17.png', 0xfff0a0, 'بتشفيك وبتشفي جيشك.'],
  fire_imp:     ['عفريت النار', 'monsters/2.png', 0xff7a3c, 'بيرمي نار بتحرق من بعيد.'],
  lava_brute:   ['وحش الحمم', 'monsters/5.png', 0xff5a1f, 'وحش ثقيل بيحرق وبيدفع.'],
  skull_mage:   ['ساحر الجماجم', 'monsters/19.png', 0x9be25a, 'بيرمي سم على الأعداء.'],
  grave_brute:  ['عملاق المقابر', 'monsters/11.png', 0x8a9a6a, 'بيحميك وبيضعف اللي بيضربه.'],
  crane:        ['طائر الكركي', 'monsters/9.png', 0xff9ad8, 'بينقض على الأبطال وبيعلّمهم.'],
  leaf_spirit:  ['روح الورق', 'monsters/12.png', 0x7dffb0, 'بتشفيك وبتشفي جيشك.'],
  frost_wisp:   ['طيف الصقيع', 'monsters/7.png', 0x9fe8ff, 'بيرمي ثلج بيبرّد.'],
  ice_drake:    ['تنين الجليد', 'monsters/14.png', 0x8ae8ff, 'حارس جليدي بيبطّئ الأعداء.'],
  storm_drone:  ['طائرة العاصفة', 'monsters/13.png', 0xfff27a, 'بترمي كهربا بتصعق.'],
  bronze_titan: ['العملاق البرونزي', 'monsters/10.png', 0xffb13d, 'حارس بيكهرب اللي بيقرب.'],
  sprout:       ['البرعم الشافي', 'monsters/3.png', 0x7dffb0, 'بيشفيك وبيشفي جيشك.'],
  tide_slime:   ['هلام المد', 'monsters/18.png', 0x4cb6ff, 'حارس بيبلّل الأعداء.'],
  moon_crab:    ['سلطعون القمر', 'monsters/1.png', 0xdfe6ff, 'قاتل بينقض وبيعلّم.'],
  night_beetle: ['خنفساء الليل', 'monsters/15.png', 0x8a6aff, 'حارس بيضعف الأعداء.'],
  sand_seed:    ['بذرة الرمل', 'monsters/21.png', 0xe0b070, 'بترمي رمل بيثبّت لحظة.'],
  dune_golem:   ['عملاق الكثبان', 'monsters/20.png', 0xd2a060, 'حارس بيطيّر الأعداء.'],
};
export const COMPANIONS = Object.fromEntries(Object.entries(AR.COMPANIONS).map(([hero, pair]) => [hero, pair.map((c, i) => {
  const u = COMPANION_UI[c.id] || [c.id, 'monsters/1.png', 0xffffff, ''];
  const role = AR.COMPANION_ROLES[c.role];
  return { ...c, slot: i + 1, nameAr: u[0], sheet: u[1], color: u[2], desc: u[3], stats: role, icon: { sheet: u[1] }, cooldown: AR.SUMMON.cooldown, range: 0, self: true, kind: 'summon' };
})]));
export const ROLE_AR = { guardian: 'حارس', striker: 'رامي', assassin: 'قاتل', healer: 'شافي' };
export const DOMAIN_UI = {
  inferno:    { nameAr: 'نطاق الجحيم', icon: '🔥', color: 0xff5a1f, tint: 0xff3a00, alpha: 0.26, fx: 'ember', desc: 'الأرض بتولّع، البحيرات بتصير حمم، ونيازك بتنزل على الأعداء.' },
  glacier:    { nameAr: 'نطاق الجليد الأبدي', icon: '❄️', color: 0x9fe8ff, tint: 0xbfefff, alpha: 0.3, fx: 'snow', desc: 'كل الماب بيتجمد: الأعداء أبطأ وبيتبرّدوا وأشواك جليد بتطلع تحتهم.' },
  void:       { nameAr: 'نطاق الفراغ', icon: '🌀', color: 0xb58cff, tint: 0x1a0633, alpha: 0.38, fx: 'void', desc: 'بوابات فراغ بتنقل وبتسحب، والأعداء بيضعفوا.' },
  storm:      { nameAr: 'نطاق العاصفة', icon: '⚡', color: 0xfff27a, tint: 0x101a33, alpha: 0.45, fx: 'rain', desc: 'صواعق بتضرب الأعداء وجيشك أسرع بكثير.' },
  tide:       { nameAr: 'نطاق الطوفان', icon: '🌊', color: 0x4cb6ff, tint: 0x1f6fd0, alpha: 0.32, fx: 'bubble', desc: 'الماب بيغرق: الأعداء مبلولين وبطيئين والتيار بيجرّهم.' },
  blossom:    { nameAr: 'نطاق الساكورا', icon: '🌸', color: 0xff9ad8, tint: 0xff9ad8, alpha: 0.2, fx: 'petal', desc: 'قدراتك أسرع بكثير وجيشك بيتشافى وبيسرع.' },
  sanctum:    { nameAr: 'الحصن المقدس', icon: '✨', color: 0xffe08a, tint: 0xffe8a0, alpha: 0.24, fx: 'holy', desc: 'جيشك مدرّع ودرعك بيتجدد، ونور مقدس بيشل الأعداء.' },
  necropolis: { nameAr: 'مدينة الموتى', icon: '💀', color: 0x9be25a, tint: 0x24331c, alpha: 0.45, fx: 'mist', desc: 'الأعداء مسمومين، وجنودهم اللي بيموتوا بيقوموا هياكل معك.' },
  moonhunt:   { nameAr: 'صيد القمر', icon: '🌕', color: 0xdfe6ff, tint: 0x060a24, alpha: 0.42, fx: 'moon', dark: true, desc: 'ليل كامل: الأعداء ما بيشوفوا بعيد، وجيشك أسرع وضرباته حرجة.' },
  sandstorm:  { nameAr: 'العاصفة الرملية', icon: '🏜️', color: 0xe0b070, tint: 0xc89050, alpha: 0.38, fx: 'sand', dark: true, desc: 'رمل بيعمي الأعداء ويبطّئهم، وأعاصير بتطيّرهم.' },
};
export const HERO_DOMAIN = Object.fromEntries(Object.entries(AR.DOMAINS).map(([hero, d]) => [hero, d.id]));
export function domainDef(hero) {
  const id = HERO_DOMAIN[hero]; const u = DOMAIN_UI[id] || {};
  return { id: 'domain', domainId: id, nameAr: u.nameAr, color: u.color, desc: u.desc, emoji: u.icon, icon: { emoji: u.icon }, self: true, kind: 'domain', cooldown: AR.DOMAIN.cooldown };
}
EXTRA_DEFS: {
  Object.entries(DOMAIN_UI).forEach(([id, d]) => { EXTRA['domain_' + id] = { id: 'domain_' + id, kind: 'strike', nameAr: d.nameAr, color: d.color }; });
  EXTRA.ushot = { id: 'ushot', kind: 'proj', nameAr: 'سهم', color: 0xffffff, speed: 640, range: 380 };
}

const FX_FRAMES = { 1: 5, 2: 5, 3: 7, 4: 5, 5: 6, 6: 4, 7: 4, 8: 5, 9: 5, 10: 5, 11: 5, 12: 5, 13: 6, 14: 6, 15: 6, 16: 5, 17: 5, 18: 6, 19: 6, 20: 5 };
export function iconStyle(icon, size = 40) {
  if (!icon) return '';
  if (icon.emoji) return `width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;font-size:${Math.round(size * 0.7)}px;line-height:1;`;
  if (icon.sheet) return `background-image:url('${SP}/${icon.sheet}');background-size:${size * 4}px auto;background-position:0 0;background-repeat:no-repeat;width:${size}px;height:${size}px;`;
  const hue = icon.hue ? `filter:hue-rotate(${icon.hue}deg);` : '';
  if (icon.img) return `background-image:url('${SP}/${icon.img}');background-size:contain;background-position:center;background-repeat:no-repeat;width:${size}px;height:${size}px;${hue}`;
  const frames = FX_FRAMES[icon.fx] || 5;
  return `background-image:url('${SP}/fx/${icon.fx}.png');background-size:${frames * size}px ${size}px;background-position:-${icon.f * size}px 0;width:${size}px;height:${size}px;${hue}`;
}
