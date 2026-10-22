export function formatDuration(totalSeconds: number): string {
  const seconds = normalizeSeconds(totalSeconds);
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(pad).join(':');
}

export function formatClock(totalSeconds: number): string {
  const seconds = normalizeSeconds(totalSeconds);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  const rest = pad(seconds % 60);

  return hours > 0 ? `${hours}:${pad(minutes)}:${rest}` : `${minutes}:${rest}`;
}

function normalizeSeconds(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
