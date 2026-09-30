import * as THREE from 'three';
import { Sfx } from './audio/sfx';
import { Controls, withoutEdges, type InputFrame } from './input/controls';
import { FacebookPlatform } from './platform/facebook';
import { LocalPlatform } from './platform/local';
import { DEFAULT_SAVE, type Platform, type SaveData } from './platform/platform';
import { Stage } from './render/stage';
import { mobileCameraPreference } from './render/camera';
import { GameView } from './render/views';
import { Game, LEVELS } from './sim/game';
import type { GameEvent } from './sim/events';
import { drawBlockText } from './ui/blockText';
import { Hud } from './ui/hud';
import { Overview } from './ui/overview';
import { TouchPad } from './ui/touchPad';

const STEP = 1 / 60;
const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const screens = ['loading', 'menu', 'pause', 'over', 'board'] as const;
type ScreenName = (typeof screens)[number] | null;

async function createPlatform(): Promise<Platform> {
  if (window.FBInstant) {
    try {
      return await FacebookPlatform.create(window.FBInstant);
    } catch (err) {
      console.error('FBInstant failed to initialise; running as a web build', err);
    }
  }
  return new LocalPlatform();
}

function isLowEnd(): boolean {
  const memory = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 8;
  return memory <= 3 || (navigator.hardwareConcurrency ?? 8) <= 4;
}

async function boot(): Promise<void> {
  document.querySelectorAll<HTMLCanvasElement>('canvas.title').forEach((c) => drawBlockText(c, c.dataset.text ?? '', 10));
  const platform = await createPlatform();
  platform.setLoadingProgress(10);

  let save: SaveData = { ...DEFAULT_SAVE, ...(await platform.load()) };
  save.mobileCamera = mobileCameraPreference(save.mobileCamera);
  platform.setLoadingProgress(40);

  const canvas = $<HTMLCanvasElement>('#game');
  const stage = new Stage(canvas, isLowEnd());
  stage.mobileCamera = save.mobileCamera;
  const view = new GameView(stage);
  const game = new Game();
  game.hiScore = save.hiScore;
  const controls = new Controls(window);
  const sfx = new Sfx();
  sfx.setMuted(save.muted);
  const hud = new Hud(stage);
  const coarse = window.matchMedia('(pointer: coarse)');
  const pad = new TouchPad(controls.touch);
  const overview = new Overview(stage);
  pad.enabled = coarse.matches || 'ontouchstart' in window;
  window.addEventListener(
    'touchstart',
    () => {
      pad.enable();
      hud.setHint('');
    },
    { once: true, passive: true },
  );
  const persist = () => void platform.save(save);
  document.querySelectorAll<HTMLInputElement>('input[name="camera"]').forEach(input => {
    input.checked = input.value === save.mobileCamera;
    input.addEventListener('change', () => {
      if (!input.checked) return;
      save.mobileCamera = mobileCameraPreference(input.value);
      stage.mobileCamera = save.mobileCamera;
      overview.reset();
      stage.resize();
      persist();
    });
  });
  // Warm up shaders behind the loading screen so the first frame of play doesn't hitch.
  stage.renderer.compile(stage.scene, stage.camera);
  platform.setLoadingProgress(90);

  let screen: ScreenName = 'loading';
  let returnTo: ScreenName = 'menu';
  const show = (name: ScreenName) => {
    screen = name;
    if (name === 'menu') $<HTMLDetailsElement>('#level-select').open = false;
    if (name !== null) {
      pad.reset();
      overview.reset();
      carry = null;
    }
    for (const s of screens) $(`#screen-${s}`).hidden = s !== name;
    const first = name ? $(`#screen-${name}`).querySelector<HTMLButtonElement>('button:not([hidden])') : null;
    if (first && !pad.enabled) first.focus({ preventScroll: true });
  };

  const refreshSound = () => {
    document.querySelectorAll('.sound-toggle').forEach((b) => (b.textContent = save.muted ? 'SOUND OFF' : 'SOUND ON'));
    $('#btn-mute').innerHTML = save.muted
      ? '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="2"/></svg>'
      : '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8a5 5 0 010 8M18.5 5.5a9 9 0 010 13" stroke="currentColor" stroke-width="2" fill="none"/></svg>';
  };
  const toggleSound = () => {
    save.muted = !save.muted;
    sfx.setMuted(save.muted);
    refreshSound();
    persist();
  };
  refreshSound();
  $('.version').textContent = `v${__APP_VERSION__}`;

  const refreshBest = () => ($('.best-score').textContent = String(save.hiScore).padStart(6, '0'));
  refreshBest();

  const startGame = (single: number | null) => {
    game.startNewGame(single, window.innerWidth > 600 && $<HTMLInputElement>('#summit-coop').checked);
    platform.logEvent('game_start', { mode: single === null ? 'full' : LEVELS[single].key });
    hud.show(true);
    show(null);
  };

  const pause = (on: boolean) => {
    if (game.state === 'menu' || game.state === 'gameOver') return;
    game.togglePause(on);
    if (on) {
      sfx.suspend();
      show('pause');
    } else {
      sfx.resume();
      show(null);
    }
  };

  const toMenu = () => {
    game.enterMenu();
    hud.show(false);
    pad.setMode(null);
    refreshBest();
    show('menu');
  };

  const scoreCard = (): string => {
    const shot = view.racing ? $<HTMLCanvasElement>('#race') : stage.snapshot();
    const card = document.createElement('canvas');
    card.width = 1200;
    card.height = 630;
    const ctx = card.getContext('2d')!;
    const grad = ctx.createLinearGradient(0, 0, 0, 630);
    grad.addColorStop(0, '#2a1a14');
    grad.addColorStop(1, '#120b09');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1200, 630);
    const h = 590;
    const w = Math.min(560, (shot.width / shot.height) * h);
    ctx.drawImage(shot, 1200 - w - 20, 20, w, h);
    const title = document.createElement('canvas');
    drawBlockText(title, 'DIG DON', 12);
    ctx.drawImage(title, 40, 60, 560, (560 / title.width) * title.height);
    ctx.fillStyle = '#f4ecd8';
    ctx.font = 'bold 44px ui-monospace, Menlo, Consolas, monospace';
    ctx.fillText('I scored', 44, 290);
    ctx.fillStyle = '#ffd95a';
    ctx.font = 'bold 96px ui-monospace, Menlo, Consolas, monospace';
    ctx.fillText(game.score.toLocaleString('en-US'), 40, 390);
    ctx.fillStyle = '#f4ecd8';
    ctx.font = 'bold 36px ui-monospace, Menlo, Consolas, monospace';
    ctx.fillText(`Round ${game.round}. Can you dig deeper?`, 44, 470);
    return card.toDataURL('image/jpeg', 0.85);
  };

  const renderBoard = async (scope: 'global' | 'friends') => {
    document.querySelectorAll<HTMLButtonElement>('.tab').forEach((t) => t.classList.toggle('on', t.dataset.scope === scope));
    const list = $('#board-list');
    list.replaceChildren(Object.assign(document.createElement('li'), { className: 'empty', textContent: 'Loading…' }));
    const entries = await platform.leaderboard(scope);
    list.replaceChildren(
      ...(entries.length
        ? entries.map((e) => {
            const li = document.createElement('li');
            if (e.isPlayer) li.className = 'me';
            const rank = Object.assign(document.createElement('span'), { textContent: `${e.rank}.` });
            const name = Object.assign(document.createElement('span'), { className: 'name', textContent: e.name });
            const score = Object.assign(document.createElement('b'), { textContent: e.score.toLocaleString('en-US') });
            const parts: HTMLElement[] = [rank];
            if (e.photo) parts.push(Object.assign(document.createElement('img'), { src: e.photo, alt: '' }));
            li.append(...parts, name, score);
            return li;
          })
        : [Object.assign(document.createElement('li'), { className: 'empty', textContent: 'No scores yet. Be the first!' })]),
    );
  };
  // Friends only means something on Facebook.
  if (platform.name !== 'facebook') $('.tabs').hidden = true;
  const openBoard = (from: ScreenName) => {
    returnTo = from;
    show('board');
    void renderBoard(platform.name === 'facebook' ? 'friends' : 'global');
  };

  const actions: Record<string, () => void> = {
    play: () => startGame(null),
    'level-0': () => startGame(0),
    'level-1': () => startGame(1),
    'level-2': () => startGame(2),
    'level-3': () => startGame(3),
    'level-4': () => startGame(4),
    'level-5': () => startGame(5),
    'level-6': () => startGame(6),
    leaderboard: () => openBoard(screen),
    sound: toggleSound,
    resume: () => pause(false),
    menu: toMenu,
    again: () => startGame(game.singleLevel),
    back: () => show(returnTo),
    share: () => {
      platform
        .share(scoreCard(), `I scored ${game.score.toLocaleString('en-US')} in Dig Don!`)
        .then(() => platform.logEvent('share'))
        .catch(() => {});
    },
    challenge: () => {
      platform
        .challenge(scoreCard(), `I scored ${game.score.toLocaleString('en-US')} in Dig Don. Beat that!`)
        .then(() => platform.logEvent('challenge'))
        .catch(() => {});
    },
  };
  document.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!target) return;
    const action = target.dataset.action;
    if (action && actions[action]) {
      sfx.click();
      actions[action]();
    } else if (target.dataset.scope) {
      void renderBoard(target.dataset.scope as 'global' | 'friends');
    }
  });
  $('#btn-pause').addEventListener('click', () => pause(true));
  $('#btn-mute').addEventListener('click', toggleSound);
  // Arrow keys move between menu buttons.
  window.addEventListener('keydown', (e) => {
    if (!screen || (e.code !== 'ArrowDown' && e.code !== 'ArrowUp')) return;
    const buttons = [...$(`#screen-${screen}`).querySelectorAll<HTMLElement>('.menu button:not([hidden]), .menu summary')]
      .filter(button => button.checkVisibility());
    const i = buttons.indexOf(document.activeElement as HTMLElement);
    const next = buttons[(i + (e.code === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length] ?? buttons[0];
    next?.focus();
    e.preventDefault();
  });

  platform.onPause(() => pause(true));

  const onGameEvents = (events: GameEvent[]) => {
    for (const e of events) {
      sfx.play(e);
      if (e.type === 'levelStart') {
        const key = game.level.key;
        overview.reset();
        pad.setMode(key);
        $('#overview').hidden = !!game.race;
        hud.setHint(
          pad.enabled || game.isPlatformLevel
            ? ''
            : key === 'drive'
              ? 'Steer: ← →   Gas: ↑   Brake: ↓   Brick: Space / J   Pause: Q'
            : key === 'invasion'
              ? 'Move: ← →   Throw: Space / S   Brick above: D   Pause: Q'
              : key === 'bricklayer' || key === 'conga'
                ? 'Move: arrows   Turbo: A   Trowel: S   Mortar: Space / J   Lay brick: D   Pause: Q'
                : 'Move: arrows   Turbo: A   Trowel: S   Mortar: Space / J   Pause: Q',
        );
        platform.logEvent('level_start', { level: e.level, round: e.round });
      } else if (e.type === 'levelClear') {
        platform.logEvent('level_clear', { level: e.level, round: e.round });
      } else if (e.type === 'gameOver') {
        const best = e.score > save.hiScore;
        save.hiScore = Math.max(save.hiScore, e.score);
        persist();
        void platform.submitScore(e.score);
        platform.logEvent('game_over', { score: e.score, round: game.round });
        $('#over-score').textContent = e.score.toLocaleString('en-US');
        $('#over-best').textContent = best ? 'NEW HIGH SCORE!' : `BEST ${save.hiScore.toLocaleString('en-US')}`;
        $<HTMLButtonElement>('[data-action="share"]').hidden = !platform.canShare;
        $<HTMLButtonElement>('[data-action="challenge"]').hidden = !platform.canChallenge;
        setTimeout(() => show('over'), 900);
      }
    }
    if (game.hiScore > save.hiScore && (game.state === 'levelClear' || game.state === 'dying')) {
      save.hiScore = game.hiScore;
      persist();
    }
  };

  new ResizeObserver(() => {
    pad.reset();
    overview.reset();
    stage.resize();
  }).observe($('#view'));

  let last = performance.now();
  let acc = 0;
  let carry: InputFrame | null = null;
  const frame = (now: number) => {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    let input = controls.poll();
    if (carry) {
      // Edges from a frame that ran no sim step aren't lost.
      input = {
        ...input,
        firePressed: input.firePressed || carry.firePressed,
        throwPressed: input.throwPressed || carry.throwPressed,
        player2: {
          ...(input.player2 ?? { moveX: 0, moveY: 0, firePressed: false, throwPressed: false, brickHeld: false, turboHeld: false }),
          firePressed: !!(input.player2?.firePressed || carry.player2?.firePressed),
          throwPressed: !!(input.player2?.throwPressed || carry.player2?.throwPressed),
        },
      };
      carry = null;
    }

    if (screen === null && game.state !== 'menu' && game.state !== 'gameOver') {
      if (input.pausePressed) pause(true);
    } else if (screen === 'pause') {
      if (input.pausePressed) pause(false);
      else if (input.backPressed) toMenu();
    }

    const before = game.hasArena ? { ...game.player.pos } : null;
    if (screen === null || screen === 'over') {
      acc += dt;
      let first = true;
      while (acc >= STEP) {
        game.update(STEP, first ? input : withoutEdges(input));
        first = false;
        acc -= STEP;
      }
      if (first) carry = input;
    }
    const events = game.events.drain();
    const moved = !!before && game.hasArena && (before.x !== game.player.pos.x || before.y !== game.player.pos.y);
    if (events.length || moved) {
      onGameEvents(events);
      view.onEvents(events, game);
      hud.onEvents(events);
    }
    stage.mobile = pad.enabled;
    view.update(game, dt);
    $('#camera-setting').hidden = !stage.mobileView;
    overview.update(game, screen === null && !$('#pad').hidden && !game.race, dt);
    hud.update(game, dt);
    sfx.engine(screen === null && game.race && game.isPlaying() ? game.race.speedRatio : null);
    if (!view.racing) stage.render();
  };

  platform.setLoadingProgress(100);
  await platform.startGame();
  show('menu');
  const loop = (t: number) => {
    frame(t);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame((t) => {
    last = t;
    loop(t);
  });
  if (import.meta.env.DEV) {
    // Background tabs get no animation frames; keep the dev build ticking so automated checks can see it.
    setInterval(() => {
      const now = performance.now();
      if (document.hidden || now - last > 100) frame(now);
    }, 1000 / 30);
  }
  // Keep a reference for debugging from the console in development.
  if (import.meta.env.DEV) Object.assign(window, { game, stage, THREE });
}

boot().catch((err) => {
  console.error(err);
  $('#screen-loading .sub').textContent = 'Something went wrong. Please reload.';
});
