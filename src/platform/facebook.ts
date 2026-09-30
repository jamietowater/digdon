import { DEFAULT_SAVE, type LeaderboardEntry, type Platform, type SaveData } from './platform';

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/** Minimal typing of the parts of the Instant Games SDK 7.1 the game uses. */
interface FBLeaderboardEntry {
  getRank(): number;
  getScore(): number;
  getPlayer(): { getName(): string | null; getPhoto(): string | null; getID(): string | null };
}
interface FBLeaderboard {
  setScoreAsync(score: number): Promise<unknown>;
  getEntriesAsync(count: number, offset: number): Promise<FBLeaderboardEntry[]>;
  getConnectedPlayerEntriesAsync(count: number, offset: number): Promise<FBLeaderboardEntry[]>;
}
interface FBInstantSDK {
  initializeAsync(): Promise<void>;
  setLoadingProgress(p: number): void;
  startGameAsync(): Promise<void>;
  getLocale(): string | null;
  getSupportedAPIs(): string[];
  onPause(cb: () => void): void;
  logEvent(name: string, value?: number, params?: Record<string, string | number>): unknown;
  getLeaderboardAsync(name: string): Promise<FBLeaderboard>;
  shareAsync(payload: { image: string; text: string; data?: object; switchContext?: boolean }): Promise<void>;
  updateAsync(payload: object): Promise<void>;
  player: {
    getID(): string | null;
    getDataAsync(keys: string[]): Promise<Record<string, unknown>>;
    setDataAsync(data: Record<string, unknown>): Promise<void>;
  };
  context: { chooseAsync(options?: object): Promise<void> };
}

declare global {
  interface Window {
    FBInstant?: FBInstantSDK;
  }
}

/** Configured on the App Dashboard (Instant Games > Leaderboards) before testing. */
export const LEADERBOARD = 'digdon_global';

/** Facebook Instant Games host: cloud saves, leaderboards, share and challenge through FBInstant. */
export class FacebookPlatform implements Platform {
  readonly name = 'facebook' as const;
  private readonly apis: Set<string>;
  private board: Promise<FBLeaderboard> | null = null;

  private constructor(private readonly fb: FBInstantSDK) {
    this.apis = new Set(fb.getSupportedAPIs());
  }

  /** initializeAsync must be the very first SDK call; a hung SDK must not pin the loader forever. */
  static async create(fb: FBInstantSDK): Promise<FacebookPlatform> {
    await withTimeout(fb.initializeAsync(), 8000, 'FBInstant.initializeAsync timed out');
    return new FacebookPlatform(fb);
  }

  get canShare(): boolean {
    return this.apis.has('shareAsync');
  }

  get canChallenge(): boolean {
    return this.apis.has('context.chooseAsync') && this.apis.has('updateAsync');
  }

  setLoadingProgress(percent: number): void {
    this.fb.setLoadingProgress(Math.max(0, Math.min(100, Math.round(percent))));
  }

  startGame(): Promise<void> {
    return this.fb.startGameAsync();
  }

  locale(): string {
    return this.fb.getLocale() ?? 'en_US';
  }

  async load(): Promise<SaveData> {
    try {
      const data = await this.fb.player.getDataAsync(['save']);
      return { ...DEFAULT_SAVE, ...((data.save as Partial<SaveData>) ?? {}) };
    } catch {
      return { ...DEFAULT_SAVE };
    }
  }

  async save(data: SaveData): Promise<void> {
    try {
      await this.fb.player.setDataAsync({ save: data });
    } catch (err) {
      console.warn('save failed', err);
    }
  }

  private leaderboardAsync(): Promise<FBLeaderboard> {
    this.board ??= this.fb.getLeaderboardAsync(LEADERBOARD);
    return this.board;
  }

  async submitScore(score: number): Promise<void> {
    if (score <= 0) return;
    try {
      await (await this.leaderboardAsync()).setScoreAsync(score);
    } catch (err) {
      console.warn('leaderboard submit failed', err);
    }
  }

  async leaderboard(scope: 'global' | 'friends'): Promise<LeaderboardEntry[]> {
    try {
      const board = await this.leaderboardAsync();
      const entries =
        scope === 'friends' ? await board.getConnectedPlayerEntriesAsync(10, 0) : await board.getEntriesAsync(10, 0);
      const me = this.fb.player.getID();
      return entries.map((e) => ({
        rank: e.getRank(),
        score: e.getScore(),
        name: e.getPlayer().getName() ?? 'Player',
        photo: e.getPlayer().getPhoto() ?? undefined,
        isPlayer: e.getPlayer().getID() === me,
      }));
    } catch (err) {
      console.warn('leaderboard read failed', err);
      return [];
    }
  }

  async share(image: string, text: string): Promise<void> {
    await this.fb.shareAsync({ image, text, data: { from: 'score' } });
  }

  async challenge(image: string, text: string): Promise<void> {
    await this.fb.context.chooseAsync();
    await this.fb.updateAsync({
      action: 'CUSTOM',
      cta: 'Beat my score',
      image,
      text,
      template: 'challenge',
      strategy: 'IMMEDIATE',
      notification: 'NO_PUSH',
    });
  }

  logEvent(name: string, params?: Record<string, string | number>): void {
    try {
      this.fb.logEvent(name, undefined, params);
    } catch {
      // Analytics must never break the game.
    }
  }

  onPause(handler: () => void): void {
    this.fb.onPause(handler);
  }
}
