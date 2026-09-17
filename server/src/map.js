// The arena map: a real tile-based village battlefield (dirt roads, ponds, houses, trees,
// rocks, hide-bushes, breakable crates). The server owns collision; the client receives
// this exact layout (sendable JSON) and renders it with the Ninja Adventure tilesets.

export const TILE = 48;
export const COLS = 40;
export const ROWS = 28;
export const MAP_W = COLS * TILE;
export const MAP_H = ROWS * TILE;

// collider per object kind, in world px, relative to the object's bottom-center anchor
const KINDS = {
  cluster: { c: 'rect', w: 160, h: 56, oy: -30 },
  tree:    { c: 'circle', r: 24, oy: -20 },
  tree2:   { c: 'circle', r: 24, oy: -20 },
  pine:    { c: 'circle', r: 24, oy: -20 },
  hedge:   { c: 'circle', r: 28, oy: -22 },
  log:     { c: 'circle', r: 17, oy: -16 },
  stump:   { c: 'circle', r: 18, oy: -18 },
  house:   { c: 'rect', w: 180, h: 118, oy: -62 },
  hut:     { c: 'rect', w: 184, h: 126, oy: -66 },
  ruin:    { c: 'rect', w: 136, h: 66, oy: -36 },
  kiln:    { c: 'rect', w: 84, h: 66, oy: -36 },
  frog:    { c: 'circle', r: 38, oy: -32 },
  pillar:  { c: 'circle', r: 18, oy: -16 },
  rock:    { c: 'circle', r: 34, oy: -30 },
  statue:  { c: 'circle', r: 18, oy: -16 },
};

// world position helpers: tile column/row -> bottom-center anchor
const at = (kind, tx, ty) => ({ kind, x: Math.round((tx + 0.5) * TILE), y: Math.round((ty + 1) * TILE) });

function buildLayout() {
  const objects = [];
  // ---- border forest (visual edge + natural wall) ----
  for (let tx = 1; tx < COLS - 1; tx += 3.2) {
    objects.push(at(Math.floor(tx) % 2 ? 'cluster' : 'pine', tx, 0));
    objects.push(at(Math.floor(tx) % 2 ? 'pine' : 'cluster', tx + 1.2, ROWS - 1));
  }
  for (let ty = 2.5; ty < ROWS - 2; ty += 2.6) {
    objects.push(at(Math.floor(ty) % 2 ? 'tree' : 'pine', 0.2, ty));
    objects.push(at(Math.floor(ty) % 2 ? 'pine' : 'tree2', COLS - 1.2, ty));
  }
  // ---- buildings ----
  objects.push(at('house', 29, 9));
  objects.push(at('hut', 10, 23));
  objects.push(at('ruin', 11, 8));
  objects.push(at('kiln', 27, 22));
  objects.push(at('frog', 25, 4));
  // ---- plaza pillars & statues ----
  [[15, 10], [24, 10], [15, 17], [24, 17]].forEach(([x, y]) => objects.push(at('pillar', x, y)));
  objects.push(at('statue', 18, 8), at('statue', 21, 8));
  // ---- trees, rocks, logs ----
  [[6, 11], [13, 4], [34, 12], [36, 18], [24, 25], [14, 19], [4, 17], [31, 16], [9, 16], [34, 25]].forEach(([x, y], i) => objects.push(at(i % 2 ? 'tree2' : 'tree', x, y)));
  [[16, 3], [22, 22], [5, 25], [36, 8], [3, 12]].forEach(([x, y]) => objects.push(at('pine', x, y)));
  [[12, 16], [27, 12], [33, 3], [17, 23], [7, 8]].forEach(([x, y]) => objects.push(at('rock', x, y)));
  [[22, 6], [17, 20]].forEach(([x, y]) => objects.push(at('log', x, y)));
  [[26, 17], [30, 6]].forEach(([x, y]) => objects.push(at('stump', x, y)));
  [[11, 11], [28, 18]].forEach(([x, y]) => objects.push(at('hedge', x, y)));

  // tall grass bushes: step inside to hide from enemies who aren't close
  const bushes = [[7, 13], [32, 12], [13, 21], [27, 7], [17, 5], [23, 20], [4, 15], [35, 15], [20, 25], [21, 2]]
    .map(([x, y]) => ({ x: Math.round((x + 0.5) * TILE), y: Math.round((y + 0.5) * TILE), r: 44 }));

  // breakable props (crates / pots) — drop a heal when broken
  const props = [
    ['crate', 26, 10], ['crate', 33, 10], ['crate', 14, 23], ['crate', 7, 23], ['pot', 9, 9],
    ['pot', 14, 9], ['pot', 29, 21], ['crate', 21, 12], ['pot', 18, 15], ['crate', 3, 21], ['pot', 36, 4],
  ].map(([kind, x, y], i) => ({ id: i, kind, x: Math.round((x + 0.5) * TILE), y: Math.round((y + 1) * TILE) }));

  // ground: dirt roads/plaza (9-slice rects in tiles) and ponds (water, slows + makes you wet)
  const dirt = [
    { x: 3, y: 13, w: 34, h: 2 },
    { x: 19, y: 3, w: 2, h: 22 },
    { x: 15, y: 10, w: 10, h: 8 },
  ];
  const ponds = [
    { x: 3, y: 3, w: 6, h: 4 },
    { x: 31, y: 20, w: 6, h: 4 },
    { x: 32, y: 5, w: 4, h: 3 },
    { x: 4, y: 19, w: 4, h: 3 },
  ];
  return { objects, bushes, props, dirt, ponds };
}

export const LAYOUT = buildLayout();
LAYOUT.objects.forEach((o) => { o.col = KINDS[o.kind]; });

export function mapPayload() {
  return {
    tile: TILE, cols: COLS, rows: ROWS, w: MAP_W, h: MAP_H,
    objects: LAYOUT.objects.map(({ kind, x, y }) => ({ kind, x, y })),
    bushes: LAYOUT.bushes, props: LAYOUT.props, dirt: LAYOUT.dirt, ponds: LAYOUT.ponds,
  };
}

// ---- collision queries ----
function colliderShape(o) {
  const c = o.col;
  return c.c === 'rect'
    ? { type: 'rect', cx: o.x, cy: o.y + c.oy, hw: c.w / 2, hh: c.h / 2 }
    : { type: 'circle', cx: o.x, cy: o.y + c.oy, r: c.r };
}
const SHAPES = LAYOUT.objects.map(colliderShape);
const PROP_R = 18;

// push a circle (x,y,r) out of every solid; `liveProps` = array of props still standing
export function solidsWith(liveProps) { return SHAPES.concat(liveProps.map((p) => ({ type: 'circle', cx: p.x, cy: p.y - 16, r: PROP_R }))); }
export function resolveCircle(ent, r, liveProps, pre) {
  const solids = pre || solidsWith(liveProps);
  for (let pass = 0; pass < 2; pass++) {
    for (const s of solids) {
      if (s.type === 'circle') {
        const dx = ent.x - s.cx, dy = ent.y - s.cy, d = Math.hypot(dx, dy), min = s.r + r;
        if (d < min) {
          if (d < 0.01) { ent.x += min; continue; }
          ent.x = s.cx + (dx / d) * min; ent.y = s.cy + (dy / d) * min;
        }
      } else {
        const nx = Math.max(s.cx - s.hw, Math.min(ent.x, s.cx + s.hw));
        const ny = Math.max(s.cy - s.hh, Math.min(ent.y, s.cy + s.hh));
        const dx = ent.x - nx, dy = ent.y - ny, d = Math.hypot(dx, dy);
        if (d < r) {
          if (d < 0.01) {
            // center is inside the rect: push out along the shallowest axis
            const px = s.hw - Math.abs(ent.x - s.cx), py = s.hh - Math.abs(ent.y - s.cy);
            if (px < py) ent.x += Math.sign(ent.x - s.cx || 1) * (px + r);
            else ent.y += Math.sign(ent.y - s.cy || 1) * (py + r);
          } else { ent.x = nx + (dx / d) * r; ent.y = ny + (dy / d) * r; }
        }
      }
    }
  }
  // playable area stops one tile inside the forest border
  ent.x = Math.max(TILE + 6, Math.min(MAP_W - TILE - 6, ent.x));
  ent.y = Math.max(TILE + 10, Math.min(MAP_H - TILE - 6, ent.y));
}

// is point (x,y) inside any solid object (expanded by pad)? returns true/false
export function pointBlocked(x, y, pad = 0) {
  for (const s of SHAPES) {
    if (s.type === 'circle') { if (Math.hypot(x - s.cx, y - s.cy) < s.r + pad) return true; }
    else if (Math.abs(x - s.cx) < s.hw + pad && Math.abs(y - s.cy) < s.hh + pad) return true;
  }
  return false;
}

export function propAt(x, y, liveProps, pad = 0) {
  return liveProps.find((p) => Math.hypot(x - p.x, y - (p.y - 16)) < PROP_R + pad) || null;
}

export function inWater(x, y) {
  return LAYOUT.ponds.some((p) => x > p.x * TILE + 14 && x < (p.x + p.w) * TILE - 14 && y > p.y * TILE + 14 && y < (p.y + p.h) * TILE - 14);
}

export function inBush(x, y) {
  return LAYOUT.bushes.some((b) => Math.hypot(x - b.x, y - b.y) < b.r);
}

export function randomOpenPoint(rng = Math.random, cx = MAP_W / 2, cy = MAP_H / 2, maxR = 520) {
  for (let i = 0; i < 60; i++) {
    const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * maxR;
    const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
    if (x < 120 || y < 120 || x > MAP_W - 120 || y > MAP_H - 120) continue;
    if (pointBlocked(x, y, 26) || inWater(x, y)) continue;
    return { x, y };
  }
  return { x: cx, y: cy + 60 };
}
