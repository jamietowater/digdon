import { App } from '@capacitor/app';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Preferences } from '@capacitor/preferences';
import { Share } from '@capacitor/share';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar } from '@capacitor/status-bar';
import { DEFAULT_SAVE, type Haptic, type LeaderboardEntry, type Platform, type SaveData } from './platform';

const SAVE_KEY = 'digdon.save.v1';
const BOARD_KEY = 'digdon.board.v1';

/** Preferences lives in UserDefaults, which iOS never purges the way it can purge WKWebView localStorage. */
async function read<T>(key: string, fallback: T): Promise<T> {
  try {
    const { value } = await Preferences.get({ key });
    return value ? { ...fallback, ...JSON.parse(value) } : fallback;
  } catch {
    return fallback;
  }
}

async function write(key: string, data: unknown): Promise<void> {
  try {
    await Preferences.set({ key, value: JSON.stringify(data) });
  } catch {
    // The run still plays, it just isn't remembered.
  }
}

/** The App Store build: the bundled web game inside Capacitor's native iOS shell. */
export class NativePlatform implements Platform {
  readonly name = 'ios' as const;
  readonly canShare = true;
  readonly canChallenge = false;

  setLoadingProgress(): void {}

  async startGame(): Promise<void> {
    await StatusBar.hide().catch(() => {});
    await SplashScreen.hide({ fadeOutDuration: 200 }).catch(() => {});
  }

  locale(): string {
    return navigator.language.replace('-', '_');
  }

  load(): Promise<SaveData> {
    return read(SAVE_KEY, DEFAULT_SAVE);
  }

  save(data: SaveData): Promise<void> {
    return write(SAVE_KEY, data);
  }

  async submitScore(score: number): Promise<void> {
    if (score <= 0) return;
    const board = await read<{ scores: number[] }>(BOARD_KEY, { scores: [] });
    board.scores = [...board.scores, score].sort((a, b) => b - a).slice(0, 10);
    await write(BOARD_KEY, board);
  }

  async leaderboard(): Promise<LeaderboardEntry[]> {
    const { scores } = await read<{ scores: number[] }>(BOARD_KEY, { scores: [] });
    return scores.map((score, i) => ({ rank: i + 1, name: 'YOU', score, isPlayer: true }));
  }

  async share(_image: string, text: string): Promise<void> {
    await Share.share({ title: 'Don & Mortar: Trowelblazer', text });
  }

  async challenge(): Promise<void> {}

  logEvent(name: string, params?: Record<string, string | number>): void {
    if (import.meta.env.DEV) console.debug('[event]', name, params ?? '');
  }

  haptic(kind: Haptic): void {
    const done = () => {};
    if (kind === 'success') Haptics.notification({ type: NotificationType.Success }).catch(done);
    else if (kind === 'error') Haptics.notification({ type: NotificationType.Error }).catch(done);
    else Haptics.impact({ style: kind === 'heavy' ? ImpactStyle.Heavy : kind === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light }).catch(done);
  }

  onPause(handler: () => void): void {
    void App.addListener('pause', handler);
  }
}
