import { Rules } from '../sim/config';
import type { GameEvent } from '../sim/events';
import type { Game } from '../sim/game';
import { ACTOR_Z, type Stage } from '../render/stage';
import { drawBlockText, toRoman } from './blockText';
import * as THREE from 'three';

interface Popup {
  el: HTMLElement;
  world: THREE.Vector3;
  age: number;
}

const pad6 = (n: number) => String(Math.min(999999, n)).padStart(6, '0');

/** Score line, lives, score popups and the centre banners (DigHUD, as DOM). */
export class Hud {
  private readonly root = document.getElementById('hud')!;
  private readonly score = document.getElementById('hud-score')!;
  private readonly hi = document.getElementById('hud-hi')!;
  private readonly levelEl = document.getElementById('hud-level')!;
  private readonly goal = document.getElementById('hud-goal')!;
  private readonly lives = document.getElementById('hud-lives')!;
  private readonly popups = document.getElementById('popups')!;
  private readonly banner = document.getElementById('banner')!;
  private readonly hint = document.getElementById('hint')!;
  private live: Popup[] = [];
  private bannerKey = '';
  private text = '';

  constructor(private readonly stage: Stage) {}

  show(visible: boolean): void {
    this.root.hidden = !visible;
    if (!visible) {
      this.clearPopups();
      this.setBanner('', () => {});
      this.hint.textContent = '';
    }
  }

  setHint(text: string): void {
    this.hint.textContent = text;
  }

  onEvents(events: readonly GameEvent[]): void {
    for (const e of events) {
      if (e.type !== 'score') continue;
      const el = document.createElement('div');
      el.className = 'popup';
      el.textContent = String(e.points);
      this.popups.append(el);
      this.live.push({ el, world: new THREE.Vector3(e.at.x, -e.at.y, ACTOR_Z), age: 0 });
    }
  }

  private clearPopups(): void {
    for (const p of this.live) p.el.remove();
    this.live = [];
  }

  update(game: Game, dt: number): void {
    const text = [
      pad6(game.score),
      pad6(game.hiScore),
      `LV ${game.levelNumber} · RD ${game.round}`,
      game.hasArena ? (game.level.invaders ? `INVADERS ${game.enemies.length}` : `DIRT ${game.grid.dirtRemaining}`) : '',
      '■'.repeat(Math.max(0, game.lives)),
    ];
    const joined = text.join('|');
    if (joined !== this.text) {
      this.text = joined;
      this.score.textContent = text[0];
      this.hi.textContent = text[1];
      this.levelEl.textContent = text[2];
      this.goal.textContent = text[3];
      this.lives.textContent = text[4];
    }

    if (!game.paused) {
      for (let i = this.live.length - 1; i >= 0; i--) {
        const p = this.live[i];
        p.age += dt;
        if (p.age > Rules.popupLife) {
          p.el.remove();
          this.live.splice(i, 1);
          continue;
        }
        // Rise ~0.5 cells a second and fade, like the Unreal popups.
        const s = this.stage.project(p.world.clone().setY(p.world.y + p.age * 0.53));
        p.el.style.left = `${s.x}px`;
        p.el.style.top = `${s.y}px`;
        p.el.style.opacity = String(1 - p.age / Rules.popupLife);
      }
    }
    this.updateBanner(game);
  }

  private updateBanner(game: Game): void {
    let key = '';
    if (game.state === 'playing' && game.levelTime < Rules.titleTime) key = `title:${game.levelSerial}`;
    else if (game.state === 'dying') key = game.lives > 0 ? 'ouch' : 'last';
    else if (game.state === 'levelClear') key = 'clear';
    else if (game.state === 'interlude') key = `interlude:${game.round}`;

    if (key.startsWith('title')) {
      const fade = 1 - Math.min(1, Math.max(0, (game.levelTime - (Rules.titleTime - 0.8)) / 0.8));
      this.banner.style.opacity = String(fade);
    } else {
      this.banner.style.opacity = '1';
    }
    if (key === this.bannerKey) return;
    this.setBanner(key, () => {
      if (key.startsWith('title')) return [span(game.levelTitle, 'banner-text banner-title')];
      if (key === 'ouch') return [span('OUCH!', 'banner-text banner-ouch')];
      if (key === 'last') return [span('LAST LIFE LOST', 'banner-text banner-ouch')];
      if (key === 'clear') return [span('ROUND CLEAR!', 'banner-text banner-clear')];
      if (key.startsWith('interlude')) {
        const next = game.levels[game.singleLevel ?? (game.round - 1) % game.levels.length];
        const level = document.createElement('canvas');
        drawBlockText(level, 'LEVEL', 6);
        level.style.width = 'min(52vw, 240px)';
        const numeral = document.createElement('canvas');
        drawBlockText(numeral, toRoman(game.round), 14);
        numeral.style.width = `min(${Math.min(80, 16 * toRoman(game.round).length)}vw, ${120 * toRoman(game.round).length}px)`;
        return [level, numeral, span(next.title, 'banner-small')];
      }
      return [];
    });
  }

  private setBanner(key: string, build: () => HTMLElement[] | void): void {
    this.bannerKey = key;
    this.banner.replaceChildren(...(build() ?? []));
  }
}

function span(text: string, cls: string): HTMLElement {
  const el = document.createElement('div');
  el.className = cls;
  el.textContent = text;
  return el;
}
