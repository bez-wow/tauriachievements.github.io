export function getLadderHistoryPlayerKey(name: string, realm: string): string {
  return `${realm}::${name}`;
}

export function splitLadderHistoryPlayerKey(playerKey: string): { realm: string; name: string } {
  const separatorIndex = playerKey.indexOf('::');
  if (separatorIndex === -1) {
    return { realm: '', name: playerKey };
  }

  return {
    realm: playerKey.slice(0, separatorIndex),
    name: playerKey.slice(separatorIndex + 2)
  };
}

export function buildHistoryComparisonLabel(snapshots: readonly Date[]): string {
  if (snapshots.length < 2) {
    return '';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric'
  }).format(snapshots[snapshots.length - 2]);
}
