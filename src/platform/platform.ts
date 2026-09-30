export interface SaveData {
  hiScore: number;
  muted: boolean;
  /** Level keys whose tutorial has been completed. */
  tutorials: string[];
}

export const DEFAULT_SAVE: SaveData = { hiScore: 0, muted: false, tutorials: [] };

export interface LeaderboardEntry {
  rank: number;
  name: string;
  score: number;
  photo?: string;
  isPlayer: boolean;
}

/** Everything the game needs from wherever it is hosted: Facebook Instant Games, or a plain web page. */
export interface Platform {
  readonly name: 'facebook' | 'web';
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
  onPause(handler: () => void): void;
}
