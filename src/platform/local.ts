import { DEFAULT_SAVE, type LeaderboardEntry, type Platform, type SaveData } from './platform';

const SAVE_KEY = 'digdon.save.v1';
const BOARD_KEY = 'digdon.board.v1';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

/** The plain web build (itch.io, local dev): saves to localStorage and keeps a local top-ten board. */
export class LocalPlatform implements Platform {
  readonly name = 'web' as const;
  readonly canShare = typeof navigator.share === 'function';
  readonly canChallenge = false;

  setLoadingProgress(): void {}

  async startGame(): Promise<void> {}

  locale(): string {
    return navigator.language.replace('-', '_');
  }

  async load(): Promise<SaveData> {
    return read(SAVE_KEY, DEFAULT_SAVE);
  }

  async save(data: SaveData): Promise<void> {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch {
      // Private mode or storage full: the run still plays, it just isn't remembered.
    }
  }

  async submitScore(score: number): Promise<void> {
    if (score <= 0) return;
    const board = read<{ scores: number[] }>(BOARD_KEY, { scores: [] });
    board.scores = [...board.scores, score].sort((a, b) => b - a).slice(0, 10);
    try {
      localStorage.setItem(BOARD_KEY, JSON.stringify(board));
    } catch {
      // See save().
    }
  }

  async leaderboard(): Promise<LeaderboardEntry[]> {
    const { scores } = read<{ scores: number[] }>(BOARD_KEY, { scores: [] });
    return scores.map((score, i) => ({ rank: i + 1, name: 'YOU', score, isPlayer: true }));
  }

  async share(_image: string, text: string): Promise<void> {
    await navigator.share?.({ title: 'Dig Don', text, url: location.href });
  }

  async challenge(): Promise<void> {}

  logEvent(name: string, params?: Record<string, string | number>): void {
    if (import.meta.env.DEV) console.debug('[event]', name, params ?? '');
  }

  onPause(handler: () => void): void {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) handler();
    });
  }
}
