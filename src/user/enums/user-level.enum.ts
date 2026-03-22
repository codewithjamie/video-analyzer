export enum UserLevel {
  FREE = 1,      // 3 tries, max 3 min videos
  STANDARD = 2,  // unlimited tries, max 10 min videos
  PREMIUM = 3,   // unlimited tries, max 30 min videos
}

export const USER_LEVEL_CONFIG = {
  [UserLevel.FREE]: {
    name: 'Free',
    maxAnalyses: 3,
    maxVideoDurationSeconds: 600,    // 3 minutes
    maxVideoDurationLabel: '10 mins',
  },
  [UserLevel.STANDARD]: {
    name: 'Standard',
    maxAnalyses: Infinity,
    maxVideoDurationSeconds: 1800,    // 10 minutes
    maxVideoDurationLabel: '30 mins',
  },
  [UserLevel.PREMIUM]: {
    name: 'Premium',
    maxAnalyses: Infinity,
    maxVideoDurationSeconds: 7200,   // 30 minutes
    maxVideoDurationLabel: '120 mins',
  },
};