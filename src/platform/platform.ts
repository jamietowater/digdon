export interface SaveData {
  hiScore: number;
  muted: boolean;
  /** Level keys whose tutorial has been completed. */
  tutorials: string[];
  mobileCamera: 'focus' | 'fit';
}

export const DEFAULT_SAVE: SaveData = { hiScore: 0, muted: false, tutorials: [], mobileCamera: 'focus' };

export interface LeaderboardEntry {
  rank: number;
  name: string;
  score: number;
  photo?: string;
  isPlayer: boolean;
}

/** Tactile feedback strengths; hosts without a vibration motor ignore them. */
export type Haptic = 'light' | 'medium' | 'heavy' | 'success' | 'error';

/** Everything the game needs from wherever it is hosted: Facebook Instant Games, a plain web page, or the iOS app. */
export interface Platform {
  readonly name: 'facebook' | 'web' | 'ios';
  /** Up to startGame(): show loading progress 0..100. */
  setLoadingProgress(percent: number): void;
  startGame(): Promise<void>;
  locale(): string;
  load(): Promise<SaveData>;
  save(data: SaveData): Promise<void>;
  submitScore(score: number): Promise<void>;
  leaderboard(scope: 'global' | 'friends'): Promise<LeaderboardEntry[]>;
  readonly canShare: boolean;
  share(image: string, text: string): Promise<void>;
  readonly canChallenge: boolean;
  challenge(image: string, text: string): Promise<void>;
  logEvent(name: string, params?: Record<string, string | number>): void;
  haptic(kind: Haptic): void;
  onPause(handler: () => void): void;
}
