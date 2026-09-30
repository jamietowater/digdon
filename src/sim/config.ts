// Tuning, ported one-for-one from the Unreal defaults (v0.7.0). Grid units are cells, time is seconds.

export const Pawn = {
  moveSpeed: 4.0,
  digSpeed: 2.5,
  brickDigSpeed: 1.2,
  turboMultiplier: 1.9,
  throwCooldown: 0.7,
  arcadeThrowCooldown: 0.3,
  invaderLayCooldown: 0.6,
  digReach: 0.65,
  laneEpsilon: 1e-3,
  deathTime: 0.6,
};

export const Enemy = {
  moveSpeed: 1.8,
  ghostSpeed: 1.0,
  ghostDelay: 8.0,
  minGhostTime: 1.0,
  crackInterval: 0.6,
  setStages: 4,
  spawnIdleTime: 2.5,
  contactRange: 0.7,
};

export const Mortar = {
  range: 3.5,
  shotDisplayTime: 0.25,
  globSpeed: 11,
  globRate: 40,
  globSize: 0.22,
  dropletGravity: 24,
  nozzleOffset: 0.35,
  recoilTime: 0.18,
};

export const Rock = {
  wobbleTime: 0.6,
  fallSpeed: 8.0,
  breakTime: 0.5,
  crushWidth: 0.6,
  crushDepth: 0.9,
};

export const Trowel = {
  speed: 9,
  range: 6,
  spinRate: 1080,
  killPoints: 100,
  hitRadius: 0.6,
};

export const Fleet = {
  baseStepInterval: 0.6,
  minStepInterval: 0.06,
  stepSize: 0.25,
  dropStep: 0.5,
  maxBombs: 3,
  bombIntervalMin: 0.6,
  bombIntervalMax: 1.4,
  startDelay: 1.5,
  ufoIntervalMin: 15,
  ufoIntervalMax: 30,
  ufoSpeed: 3,
  ufoRowY: 0.6,
  ufoPoints: [500, 1000, 1500, 3000],
  ufoHitRadius: 0.7,
};

export const Bomb = {
  speed: 5,
  hitRadius: 0.45,
};

export const DonJr = {
  sideSwitchTime: 0.15,
};

export const Rules = {
  startingLives: 3,
  respawnDelay: 2.0,
  levelClearDelay: 2.5,
  interludeDelay: 2.5,
  bonusBasePoints: 2500,
  bonusCanThreshold: 2,
  bonusReach: 0.6,
  titleTime: 2.5,
  popupLife: 1.2,
  roundSpeedUp: 0.08,
};

export const Score = {
  digPoints: 10,
  encaseKill: [200, 300, 400, 500],
  rockKill: [0, 1000, 2500, 4000, 6000, 8000, 10000, 12000, 15000],
};

export function encaseKillPoints(depthBand: number): number {
  return Score.encaseKill[Math.min(3, Math.max(0, depthBand))];
}

export function rockKillPoints(crushed: number): number {
  return Score.rockKill[Math.min(Score.rockKill.length - 1, Math.max(0, crushed))];
}
