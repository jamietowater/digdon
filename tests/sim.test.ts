import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Controls } from '../src/input/controls';
import { Game, LEVELS, type LevelDef } from '../src/sim/game';
import { Cell, Grid } from '../src/sim/grid';
import { encaseKillPoints, rockKillPoints } from '../src/sim/config';
import { mulberry32, setRandom } from '../src/sim/math';
import { NO_INPUT, type Input } from '../src/sim/world';
import { Breeds, BonusItems, Sprites } from '../src/data/sprites';

const DT = 1 / 60;

function level(layout: string, invaders = false): LevelDef {
  return { key: invaders ? 'invasion' : 'dig', title: 'TEST', layout, invaders, brickLaying: invaders };
}

function play(layout: string, invaders = false): Game {
  const game = new Game();
  game.levels = [level(layout, invaders)];
  game.startNewGame(0);
  return game;
}

function run(game: Game, seconds: number, input: Partial<Input> = {}): void {
  const frames = Math.round(seconds / DT);
  for (let i = 0; i < frames; i++) game.update(DT, { ...NO_INPUT, ...input });
}

beforeEach(() => setRandom(mulberry32(7)));
afterEach(() => vi.unstubAllGlobals());

describe('hosted input', () => {
  it('keeps keyboard and touch available when the host blocks gamepads', () => {
    vi.stubGlobal('navigator', {
      getGamepads: () => { throw new DOMException('gamepad denied', 'SecurityError'); },
    });
    const controls = new Controls({ addEventListener: () => {} } as unknown as Window);
    controls.touch.moveX = 1;
    expect(controls.poll().moveX).toBe(1);
  });
});

describe('grid', () => {
  it('parses arena 01 like the Unreal build', () => {
    const grid = Grid.fromText(LEVELS[0].layout);
    expect([grid.width, grid.height]).toEqual([14, 18]);
    expect(grid.playerStart).toEqual({ x: 6, y: 1 });
    expect(grid.enemySpawns).toHaveLength(4);
    expect(grid.rockCells).toHaveLength(4);
    expect(grid.get(0, 17)).toBe(Cell.Bedrock);
    expect(grid.get(-1, 0)).toBe(Cell.Bedrock);
  });

  it('parses the invasion formation', () => {
    const grid = Grid.fromText(LEVELS[1].layout);
    expect(grid.invaderSpawns).toHaveLength(40);
    expect(grid.playerStart).toEqual({ x: 6, y: 16 });
    expect(grid.dirtRemaining).toBe(0);
  });

  it('finds the shortest tunnel route and refuses dirt', () => {
    const grid = Grid.fromText(['.....', '.###.', '.....'].join('\n'));
    expect(grid.findPath({ x: 0, y: 0 }, { x: 4, y: 0 })).toHaveLength(4);
    expect(grid.findPath({ x: 0, y: 0 }, { x: 2, y: 1 })).toBeNull();
  });

  it('bands depth into four strata', () => {
    const grid = Grid.fromText(LEVELS[0].layout);
    expect([1, 5, 9, 16].map((r) => grid.depthBand(r))).toEqual([0, 1, 2, 3]);
  });
});

describe('player', () => {
  it('digs at dig speed and scores 10 per cell', () => {
    const game = play(['P#####', 'XXXXXX'].join('\n'));
    run(game, 1, { moveX: 1 });
    expect(game.player.pos.x).toBeCloseTo(2.5, 2);
    expect(game.score).toBe(30);
  });

  it('corner assist carries him to the next lane before turning', () => {
    const game = play(['......', '......', 'P.....', 'XXXXXX'].join('\n'));
    run(game, 0.1, { moveX: 1 });
    expect(game.player.pos.x).toBeCloseTo(0.4, 5);
    run(game, 0.25, { moveY: -1 });
    expect(game.player.pos.x).toBe(1);
    expect(game.player.pos.y).toBeLessThan(2);
  });

  it('is stopped by rocks and bedrock', () => {
    const game = play(['PR....', 'XXXXXX'].join('\n'));
    run(game, 1, { moveX: 1 });
    expect(game.player.pos.x).toBe(0);
  });
});

describe('mortar', () => {
  it('sets a creature solid after four layers and pays by depth', () => {
    const game = play(['P..E..', '######', 'XXXXXX'].join('\n'));
    const enemy = game.enemies[0];
    expect(enemy.breed.extraSetStages).toBe(0);
    for (let i = 0; i < 4; i++) {
      game.update(DT, { ...NO_INPUT, firePressed: true });
      game.update(DT, NO_INPUT);
    }
    expect(game.enemies).toHaveLength(0);
    expect(game.score).toBe(encaseKillPoints(0));
    expect(game.state).toBe('levelClear');
  });

  it('cracks off a layer at a time once the spray stops', () => {
    const game = play(['P..E..', '######', 'XXXXXX'].join('\n'));
    game.update(DT, { ...NO_INPUT, firePressed: true });
    expect(game.enemies[0].state).toBe('encased');
    run(game, 0.7);
    expect(game.enemies[0].state).toBe('chase');
  });
});

describe('falling can', () => {
  it('waits for Don to step away, wobbles, falls and crushes', () => {
    const game = play(['..R...', '..#...', 'P.#...', '..#...', '..E...', 'XXXXXX'].join('\n'));
    const rock = game.rocks[0];
    game.grid.dig(2, 1);
    game.player.pos = { x: 2, y: 1 };
    run(game, 0.2);
    expect(rock.state).toBe('idle');
    game.player.pos = { x: 0, y: 2 };
    run(game, 0.1);
    expect(rock.state).toBe('wobble');
    game.grid.dig(2, 2);
    game.grid.dig(2, 3);
    run(game, 1.5);
    expect(game.enemies).toHaveLength(0);
    expect(game.score).toBe(rockKillPoints(1));
  });
});

describe('invasion', () => {
  it('puts collected bonuses on the shelf only after a clear and resets them for a new run', () => {
    const game = play(['P..E..', '......', 'XXXXXX'].join('\n'));
    game.onRockDropped();
    game.onRockDropped();
    expect(game.bonus).not.toBeNull();
    game.player.pos = { ...game.bonus!.cell };
    game.update(DT, NO_INPUT);
    expect(game.bonus).toBeNull();
    expect(game.collectedItems).toEqual([]);
    game.enemies[0].kill();
    run(game, 5.1);
    expect(game.collectedItems).toEqual([0]);
    expect(game.round).toBe(2);
    game.startNewGame(0);
    expect(game.collectedItems).toEqual([]);
  });

  it('keeps the march beat measured when half the fleet is gone', () => {
    const game = play(LEVELS[1].layout, true);
    for (const enemy of [...game.enemies].slice(0, 20)) enemy.kill();
    game.fleet!.regroup();
    let steps = 0;
    for (let frame = 0; frame < 6 / DT; frame++) {
      game.fleet!.bombs = [];
      game.update(DT, NO_INPUT);
      steps += game.events.drain().filter((event) => event.type === 'fleetStep').length;
    }
    expect(steps).toBeGreaterThanOrEqual(7);
    expect(steps).toBeLessThanOrEqual(10);
  });

  it('marches, drops at the edge and speeds up as it thins', () => {
    const game = play(LEVELS[1].layout, true);
    const first = game.enemies[0];
    const startX = first.pos.x;
    const march = (seconds: number) => {
      for (let i = 0; i < Math.round(seconds / DT); i++) {
        game.fleet!.bombs = [];
        game.update(DT, NO_INPUT);
      }
    };
    march(1.5 + 0.61);
    expect(first.pos.x).toBeCloseTo(startX + 0.25, 5);
    const y = first.pos.y;
    march(0.6 * 14);
    expect(game.state).toBe('playing');
    expect(first.pos.y).toBeGreaterThan(y);
  });

  it('throws straight up and knocks out the lowest invader', () => {
    const game = play(LEVELS[1].layout, true);
    game.player.pos = { x: 5, y: 16 };
    game.update(DT, { ...NO_INPUT, firePressed: true });
    run(game, 2);
    expect(game.enemies).toHaveLength(39);
    expect(game.score).toBeGreaterThanOrEqual(100);
  });
});

describe('scoring and data', () => {
  it('uses the Unreal score tables', () => {
    expect([0, 1, 2, 3, 4].map(encaseKillPoints)).toEqual([200, 300, 400, 500, 500]);
    expect([1, 2, 8, 20].map(rockKillPoints)).toEqual([1000, 2500, 15000, 15000]);
  });

  it('exports every sprite with rows that fit the declared width', () => {
    const all = [...Object.values(Sprites.characters), ...Breeds, ...BonusItems];
    for (const s of all) {
      expect(s.rows).toHaveLength(s.height);
      for (const r of [...s.rows, ...(s.stride ?? [])]) expect(r.length).toBeLessThanOrEqual(s.width + 1);
    }
    expect(Breeds).toHaveLength(12);
    expect(BonusItems).toHaveLength(10);
  });
});
