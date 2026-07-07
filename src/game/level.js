// Level model: parse a human-readable ASCII plan into a tile grid plus a list of
// entity spawn specs. Tiles carry only collision/hazard info; everything that moves
// or is collectible is an entity.

export const TILE = 32; // world pixels per tile

// Tile ids (grid values)
export const T = {
  EMPTY: 0,
  SOLID: 1,
  ONEWAY: 2, // land from above, pass through from below/sides
  LAVA: 3, // deadly, non-solid
  CRUMBLE: 4, // one-way platform that collapses ~2s after the player stands on it
};

// ASCII legend
//   '#' solid wall/ground     '=' one-way platform      '~' lava
//   '@' player spawn          'o' bone (collectible)    'G' goal portal
//   'h' horizontal fireball   'v' vertical fireball      space / '.' empty
//   'E' enemy dino (patrols)  'S' enemy dino (shoots fireballs at the T-Rex)
//   '-' crumbling platform (breaks a couple seconds after you step on it)
const TILE_CHARS = {
  "#": T.SOLID,
  "=": T.ONEWAY,
  "~": T.LAVA,
  "-": T.CRUMBLE,
};
const ENTITY_CHARS = {
  "@": "spawn",
  o: "bone",
  G: "goal",
  h: "fireballH",
  v: "fireballV",
  E: "enemyWalk",
  S: "enemyShoot",
  B: "boss", // final-level boss dino — its presence turns the level into an arena
};

export class Level {
  constructor(plan) {
    this.rows = plan.length;
    this.cols = Math.max(...plan.map((r) => r.length));
    this.grid = [];
    this.spawns = []; // { type, x, y } in world pixels (tile top-left)
    this.spawn = { x: TILE, y: TILE }; // player start, overwritten by '@'

    for (let r = 0; r < this.rows; r++) {
      const row = new Array(this.cols).fill(T.EMPTY);
      const line = plan[r];
      for (let c = 0; c < this.cols; c++) {
        const ch = line[c] || " ";
        if (ch in TILE_CHARS) {
          row[c] = TILE_CHARS[ch];
        } else if (ch in ENTITY_CHARS) {
          const type = ENTITY_CHARS[ch];
          const x = c * TILE;
          const y = r * TILE;
          if (type === "spawn") this.spawn = { x: x + TILE * 0.1, y: y - TILE * 0.9 };
          else this.spawns.push({ type, x, y, col: c, row: r });
        }
      }
      this.grid.push(row);
    }

    this.width = this.cols * TILE;
    this.height = this.rows * TILE;
  }

  // Tile id at a tile coordinate. Out-of-bounds sides/top read as solid so the
  // player can't leave the map; below the map reads as empty (fall to death).
  tileAt(col, row) {
    if (col < 0 || col >= this.cols || row < 0) return T.SOLID;
    if (row >= this.rows) return T.EMPTY;
    return this.grid[row][col];
  }
}
