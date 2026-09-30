import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Controls } from '../src/input/controls';
import { CameraTracker, cameraBounds, fitCamera, mobileCameraPreference, type CameraRequest } from '../src/render/camera';
import { Game, LEVELS, type LevelDef } from '../src/sim/game';
import { Cell, Grid } from '../src/sim/grid';
import { encaseKillPoints, rockKillPoints } from '../src/sim/config';
import { mulberry32, setRandom } from '../src/sim/math';
import { NO_INPUT, type Input } from '../src/sim/world';
import { Breeds, BonusItems, Sprites } from '../src/data/sprites';

const DT = 1 / 60;
const invasion = LEVELS.find(entry => entry.key === 'invasion')!;

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

describe('mobile camera', () => {
  const request = (overrides: Partial<CameraRequest> = {}): CameraRequest => ({
    width: 412, height: 648, columns: 14, rows: 18, top: 0, focus: true, platform: true, invasion: false,
    subjects: [{ pos: { x: 6, y: 12 }, facing: { x: 1, y: 0 }, moving: false }], ...overrides,
  });

  it('magnifies actual world units to readable phone sprite sizes', () => {
    for (const width of [320, 390, 412]) {
      const input = request({ width });
      const frame = new CameraTracker().update(input, DT);
      const spriteHeight = 0.9 * input.height / (2 * frame.halfHeight);
      expect(spriteHeight).toBeGreaterThan(width === 320 ? 33 : 40);
      expect(frame.halfHeight).toBeLessThan(fitCamera(input).halfHeight);
    }
  });

  it('clamps all arena corners while retaining space for the player', () => {
    for (const pos of [{ x: 0, y: 0 }, { x: 13, y: 0 }, { x: 0, y: 16 }, { x: 13, y: 16 }]) {
      const input = request({ subjects: [{ pos, facing: { x: 1, y: 0 }, moving: false }] });
      const frame = new CameraTracker().update(input, DT);
      const bounds = cameraBounds(frame, input.width / input.height);
      expect(pos.x).toBeGreaterThan(bounds.left + 0.5);
      expect(pos.x).toBeLessThan(bounds.right - 0.5);
      expect(pos.y).toBeGreaterThan(bounds.top + 0.5);
      expect(pos.y).toBeLessThan(bounds.bottom - 0.5);
    }
  });

  it('leaves invasion and desktop fit framing intact and restores focus after a peek', () => {
    const tracker = new CameraTracker();
    const input = request();
    const focused = tracker.update(input, DT);
    expect(tracker.update({ ...input, invasion: true }, DT)).toEqual(fitCamera(input));
    expect(tracker.update({ ...input, focus: false }, DT)).toEqual(fitCamera(input));
    expect(tracker.update(input, DT)).toEqual(focused);
  });

  it('does not bob on a small jump and snaps correctly after a reset or resize', () => {
    const tracker = new CameraTracker();
    const input = request();
    const before = tracker.update(input, DT);
    const jump = request({ subjects: [{ ...input.subjects[0], pos: { x: 6, y: 11 } }] });
    expect(tracker.update(jump, DT)).toEqual(before);
    tracker.reset();
    expect(tracker.update(jump, DT).y).toBeLessThan(before.y);
    expect(tracker.update({ ...jump, width: 320 }, DT).focused).toBe(true);
  });

  it('keeps separated co-op players visible without changing the logical Summit window', () => {
    const input = request({ top: 17, subjects: [
      { pos: { x: 0, y: 20 }, facing: { x: 1, y: 0 }, moving: true },
      { pos: { x: 13, y: 33 }, facing: { x: -1, y: 0 }, moving: true },
    ] });
    const frame = new CameraTracker().update(input, DT);
    const bounds = cameraBounds(frame, input.width / input.height);
    expect(bounds.left).toBeLessThan(0);
    expect(bounds.right).toBeGreaterThan(13);
    expect(bounds.top).toBeLessThan(20);
    expect(bounds.bottom).toBeGreaterThan(33);
    expect(input.top).toBe(17);
  });

  it('defaults older or invalid saves to Focus without rejecting Full', () => {
    expect(mobileCameraPreference(undefined)).toBe('focus');
    expect(mobileCameraPreference('invalid')).toBe('focus');
    expect(mobileCameraPreference('fit')).toBe('fit');
  });

  it('uses time-based follow easing and freezes a paused frame', () => {
    const input = request({ width: 320, height: 360, subjects: [
      { pos: { x: 6, y: 10 }, facing: { x: 1, y: 0 }, moving: false },
    ] });
    const destination = request({ ...input, subjects: [{ ...input.subjects[0], pos: { x: 10, y: 5 } }] });
    const slow = new CameraTracker();
    const fast = new CameraTracker();
    const before = slow.update(input, DT);
    fast.update(input, DT);
    expect(slow.update(destination, 0)).toEqual(before);
    let slowFrame = before;
    let fastFrame = before;
    for (let step = 0; step < 30; step++) slowFrame = slow.update(destination, 1 / 30);
    for (let step = 0; step < 120; step++) fastFrame = fast.update(destination, 1 / 120);
    expect(slowFrame.x).toBeCloseTo(fastFrame.x, 8);
    expect(slowFrame.y).toBeCloseTo(fastFrame.y, 8);
    expect(slowFrame.y).toBeLessThan(before.y);
  });

  it('gives Conga more upper context and honors reduced motion', () => {
    const input = request({ width: 320, height: 360, platform: false });
    const frame = new CameraTracker().update(input, DT);
    expect(new CameraTracker().update({ ...input, conga: true }, DT).y).toBeLessThan(frame.y);
    const tracker = new CameraTracker();
    tracker.update(input, DT);
    const destination = { ...input, subjects: [{ ...input.subjects[0], pos: { x: 12, y: 3 } }] };
    const immediate = tracker.update(destination, DT, true);
    expect(tracker.update(destination, DT, true)).toEqual(immediate);
  });
});

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
    const grid = Grid.fromText(invasion.layout);
    expect(grid.invaderSpawns).toHaveLength(40);
    expect(grid.playerStart).toEqual({ x: 6, y: 16 });
    expect(grid.dirtRemaining).toBe(0);
  });

  it('parses the open Bricklayer arena', () => {
    const grid = Grid.fromText(LEVELS[1].layout);
    expect(grid.playerStart).toEqual({ x: 6, y: 1 });
    expect(grid.enemySpawns).toHaveLength(5);
    expect(grid.rockCells).toHaveLength(4);
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
    const game = play(invasion.layout, true);
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
    const game = play(invasion.layout, true);
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
    const game = play(invasion.layout, true);
    game.player.pos = { x: 5, y: 16 };
    game.update(DT, { ...NO_INPUT, firePressed: true });
    run(game, 2);
    expect(game.enemies).toHaveLength(39);
    expect(game.score).toBeGreaterThanOrEqual(100);
  });
});

describe('bricklayer traps', () => {
  function start(layout: string): Game {
    const game = new Game();
    game.levels = [{ ...level(layout), key: 'bricklayer', brickLaying: true }];
    game.startNewGame(0);
    return game;
  }

  it('seals a small shared pocket for 1000 points per creature', () => {
    const game = start('XXXXXXX\nXPXBEBX\nXXXBEBX\nXXXXXXX');
    game.update(DT, NO_INPUT);
    expect(game.enemies).toHaveLength(0);
    expect(game.score).toBe(2000);
    expect(game.grid.get(4, 1)).toBe(Cell.Brick);
    expect(game.state).toBe('levelClear');
  });

  it('does not seal a pocket containing Don or larger than twelve cells', () => {
    const shared = start('XXXXX\nXPEXX\nXXXXX');
    shared.update(DT, NO_INPUT);
    expect(shared.enemies).toHaveLength(1);
    const large = start('XXXXXXXXXXXXXXXXXX\nXPX............E.X\nXXXXXXXXXXXXXXXXXX');
    large.update(DT, NO_INPUT);
    expect(large.enemies).toHaveLength(1);
  });

  it('holds the last creature in mortar without killing it', () => {
    const game = start('P....E\nXXXXXX');
    const enemy = game.enemies[0];
    for (let hit = 0; hit < 10; hit++) enemy.addMortar();
    expect(enemy.state).toBe('encased');
    expect(enemy.mortarLayers).toBe(enemy.setStages - 1);
    expect(game.state).toBe('playing');
  });
});

describe('conga', () => {
  function start(): Game {
    const game = new Game();
    game.startNewGame(LEVELS.findIndex(entry => entry.key === 'conga'));
    return game;
  }

  it('uncoils ten links after a delay and keeps them in open cells', () => {
    const game = start();
    expect(game.levelNumber).toBe(3);
    expect(game.enemies).toHaveLength(10);
    expect(game.enemies.filter(enemy => !enemy.hidden)).toHaveLength(1);
    run(game, 1);
    expect(game.enemies[0].pos).toEqual({ x: 0, y: 0 });
    run(game, 3);
    expect(game.enemies[0].pos.x).toBeGreaterThan(3);
    expect(game.enemies.filter(enemy => !enemy.hidden).length).toBeGreaterThan(5);
    expect(game.enemies.every(enemy => enemy.kind === 'conga')).toBe(true);
  });

  it('splits on a link loss, lays a brick, and pays a head bonus once', () => {
    const game = start();
    run(game, 4);
    const head = game.enemies[0];
    const tail = game.enemies[1];
    const bricks = game.grid.cells.filter(cell => cell === Cell.Brick).length;
    head.kill();
    game.update(DT, NO_INPUT);
    expect(tail.head).toBe(true);
    expect(game.score).toBe(200);
    expect(game.grid.cells.filter(cell => cell === Cell.Brick).length).toBe(bricks + 1);
    run(game, 0.2);
    expect(game.score).toBe(200);
  });

  it('freezes the whole chain on mortar and regroups survivors on death', () => {
    const game = start();
    run(game, 3);
    const head = game.enemies[0];
    head.addMortar();
    const position = { ...head.pos };
    run(game, 0.2);
    expect(head.pos).toEqual(position);
    expect(head.setStages).toBe(2);
    game.player.kill();
    run(game, 2.1);
    expect(game.enemies[0].pos).toEqual({ x: 0, y: 0 });
    expect(game.player.alive).toBe(true);
  });

  it('throws along facing, breaks girders, and awards the last head bonus', () => {
    const game = start();
    game.player.pos = { x: 0, y: 1 };
    game.update(DT, { ...NO_INPUT, throwPressed: true });
    expect(game.trowels[0].dir).toEqual({ x: 1, y: 0 });
    run(game, 0.25);
    expect(game.grid.get(2, 1)).toBe(Cell.Tunnel);
    for (const enemy of [...game.enemies]) enemy.kill();
    game.update(DT, NO_INPUT);
    expect(game.state).toBe('levelClear');
    expect(game.score).toBeGreaterThanOrEqual(200);
  });

  it('splits a crushed middle link without adding a brick or head bonus', () => {
    const game = start();
    run(game, 4);
    const middle = game.enemies[3];
    const tail = game.enemies[4];
    const bricks = game.grid.cells.filter(cell => cell === Cell.Brick).length;
    middle.crush();
    game.update(DT, NO_INPUT);
    expect(tail.head).toBe(true);
    expect(game.score).toBe(0);
    expect(game.grid.cells.filter(cell => cell === Cell.Brick).length).toBe(bricks);
    middle.kill();
    game.update(DT, NO_INPUT);
    expect(game.score).toBe(0);
  });

  it('keeps coiled links harmless and does not brick another link into the entry', () => {
    const game = start();
    const hidden = game.enemies[1];
    expect(hidden.isHarmful()).toBe(false);
    expect(hidden.canBeEncased()).toBe(false);
    game.enemies[0].kill();
    game.update(DT, NO_INPUT);
    expect(game.grid.get(0, 0)).toBe(Cell.Tunnel);
    expect(hidden.head).toBe(true);
    run(game, 3);
    expect(hidden.hidden).toBe(false);
    expect(hidden.pos.x).toBeGreaterThan(0);
  });
});

describe('platform movement', () => {
  function start(layout: string, platform: 'scaffold' | 'summit' = 'scaffold'): Game {
    const game = new Game();
    game.levels = [{ ...level(layout), platform }];
    game.startNewGame(0);
    if (!game.grid.markers.has('K')) game.scaffold = null;
    if (game.grid.height < 18) game.summit = null;
    return game;
  }

  it('jumps and lands without digging the supporting girder', () => {
    const game = start('.....\n.....\n..P..\nBBBBB');
    game.update(DT, { ...NO_INPUT, firePressed: true });
    expect(game.player.pos.y).toBeLessThan(2);
    run(game, 0.8);
    expect(game.player.pos.y).toBe(2);
    expect(game.player.platform.grounded).toBe(true);
    expect(game.grid.get(2, 3)).toBe(Cell.Brick);
  });

  it('runs scaffold cans, mallet pickups, persistent collectibles and rescue', () => {
    const game = start('..............\n..K.........D.\nBBBBBBBBBBBBBB\n..............\nO.P.M.U.......\nBBBBBBBBBBBBBB');
    run(game, 2.2);
    expect(game.scaffold!.hazards.some(hazard => hazard.kind === 'can')).toBe(true);
    game.player.pos = { x: 4, y: 4 };
    game.update(DT, NO_INPUT);
    expect(game.player.platform.mallet).toBeGreaterThan(7);
    expect(game.scaffold!.trowelHit({ x: 6, y: 4 })).toBe(true);
    expect(game.score).toBe(800);
    game.player.kill();
    run(game, 2.1);
    expect(game.scaffold!.items).toHaveLength(0);
    expect(game.scaffold!.mallets).toHaveLength(1);
    expect(game.scaffold!.hazards).toHaveLength(0);
    game.player.pos = { x: 12, y: 1 };
    game.update(DT, NO_INPUT);
    expect(game.state).toBe('levelClear');
    expect(game.score).toBe(5800);
  });

  it('climbs a ladder from its foot to the top and back', () => {
    const game = start('.....\nBBHBB\n..H..\n..P..\nBBBBB');
    run(game, 1.3, { moveY: -1 });
    expect(game.player.pos.y).toBe(0);
    expect(game.player.platform.climbing).toBeNull();
    run(game, 1.3, { moveY: 1 });
    expect(game.player.pos.y).toBe(3);
    expect(game.player.platform.grounded).toBe(true);
  });

  it('smashes a summit ceiling and can jump through the new opening', () => {
    const game = start('.....\n.....\nBBBBB\n.....\n..P..\nBBBBB', 'summit');
    game.update(DT, { ...NO_INPUT, firePressed: true });
    run(game, 0.9);
    expect(game.grid.get(2, 2)).toBe(Cell.Tunnel);
    expect(game.player.pos.y).toBe(4);
    game.update(DT, { ...NO_INPUT, firePressed: true });
    run(game, 0.35);
    run(game, 0.45, { moveX: 1 });
    expect(game.player.pos.y).toBe(1);
  });
});

describe('summit', () => {
  function start(): Game {
    const game = new Game();
    game.startNewGame(LEVELS.findIndex(entry => entry.key === 'summit'));
    return game;
  }

  it('loads the full mountain and scrolls only up; respawns within the view', () => {
    const game = start();
    expect([game.grid.width, game.grid.height]).toEqual([14, 35]);
    expect(game.summit!.viewTop).toBe(17);
    game.player.pos = { x: 5, y: 24 };
    run(game, 0.5);
    expect(game.summit!.viewTop).toBeCloseTo(14);
    game.player.pos = { x: 5, y: 33 };
    game.update(DT, NO_INPUT);
    expect(game.state).toBe('dying');
    run(game, 2.1);
    expect(game.player.pos.y).toBeLessThan(game.summit!.viewTop + 17);
    expect(game.summit!.viewTop).toBeLessThanOrEqual(14.01);
  });

  it('scores broken bricks, spawns repair lobsters and wins only by reaching the UFO', () => {
    const game = start();
    game.update(DT, { ...NO_INPUT, firePressed: true });
    run(game, 0.8);
    expect(game.grid.get(3, 31)).toBe(Cell.Tunnel);
    expect(game.score).toBe(10);
    run(game, 6);
    expect(game.summit!.creatures.some(creature => creature.kind === 'lobster')).toBe(true);
    expect(game.summit!.trowelHit(game.summit!.ufo!.pos)).toBe(false);
    game.player.pos = { ...game.summit!.ufo!.pos };
    game.update(DT, NO_INPUT);
    expect(game.state).toBe('levelClear');
    expect(game.score).toBeGreaterThan(7000);
  });

  it('exports all six layouts and every platform sprite used by the renderer', () => {
    expect(LEVELS.map(entry => entry.key)).toEqual(['dig', 'bricklayer', 'conga', 'invasion', 'scaffold', 'summit']);
    for (const name of ['CanSlinger', 'DonJr', 'Mallet', 'Can', 'Drum', 'Flame', 'Flag', 'Cactus', 'ChiliAmigo', 'CactusAmigo', 'Luchador']) {
      expect(Sprites.characters[name], name).toBeDefined();
    }
    expect(Breeds.some(breed => breed.name === 'Lobster')).toBe(true);
    expect(Breeds.some(breed => breed.name === 'Dragon')).toBe(true);
  });

  it('supports a second climber with independent movement and respawn', () => {
    const game = new Game();
    game.startNewGame(5, true);
    expect(game.player2!.pos).toEqual({ x: 6, y: 33 });
    const primary = { ...game.player.pos };
    run(game, 0.2, { player2: { ...NO_INPUT, moveX: 1 } });
    expect(game.player2!.pos.x).toBeGreaterThan(6);
    expect(game.player.pos).toEqual(primary);
    game.player2!.kill();
    expect(game.state).toBe('playing');
    expect(game.lives).toBe(3);
    run(game, 2.1);
    expect(game.player2!.alive).toBe(true);
  });

  it('repairs a smashed floor but waits while a climber occupies the hole', () => {
    const game = start();
    run(game, 6);
    const lobster = game.summit!.creatures.find(creature => creature.kind === 'lobster')!;
    lobster.pos = { x: 4, y: 30 };
    lobster.lastColumn = 4;
    lobster.direction = -1;
    lobster.age = 1;
    game.grid.removeBrick(3, 31);
    game.onBrickBroken({ x: 3, y: 31 });
    game.player.pos = { x: 3, y: 31 };
    game.player.platform.climbing = { top: 31, bottom: 31 };
    run(game, 1);
    expect(game.grid.get(3, 31)).toBe(Cell.Tunnel);
    game.player.pos = { x: 3, y: 33 };
    game.player.platform.reset();
    run(game, 0.2);
    expect(game.grid.get(3, 31)).toBe(Cell.Brick);
    expect(game.summit!.broken.has('3,31')).toBe(false);
    lobster.pos = { x: 3, y: 30 };
    game.grid.removeBrick(3, 31);
    const score = game.score;
    game.onBrickBroken({ x: 3, y: 31 });
    expect(game.summit!.creatures.includes(lobster)).toBe(false);
    expect(game.score - score).toBe(510);
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
