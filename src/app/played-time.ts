const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 60 * SECONDS_PER_MINUTE;
const SECONDS_PER_DAY = 24 * SECONDS_PER_HOUR;

export function formatPlayedTime(playedTimeSeconds: number | null | undefined): string {
  const totalSeconds = normalizeSeconds(playedTimeSeconds);
  const days = Math.floor(totalSeconds / SECONDS_PER_DAY);
  const hours = Math.floor((totalSeconds % SECONDS_PER_DAY) / SECONDS_PER_HOUR);
  const minutes = Math.floor((totalSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

export function formatSignedPlayedTime(deltaSeconds: number): string {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds === 0) {
    return '0m';
  }

  const sign = deltaSeconds > 0 ? '+' : '-';
  return `${sign}${formatPlayedTime(Math.abs(deltaSeconds))}`;
}

function normalizeSeconds(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.floor(value);
}
