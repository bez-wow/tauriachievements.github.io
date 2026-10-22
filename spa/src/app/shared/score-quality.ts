export type RunQuality = 'artifact' | 'legendary' | 'epic' | 'rare' | 'uncommon';

export function scoreQuality(score: number, bestScore: number): RunQuality {
  if (!(bestScore > 0)) {
    return 'uncommon';
  }

  if (score >= bestScore) {
    return 'artifact';
  }

  const ratio = score / bestScore;
  if (ratio >= 0.9) {
    return 'legendary';
  }

  if (ratio >= 0.84) {
    return 'epic';
  }

  return ratio >= 0.76 ? 'rare' : 'uncommon';
}
