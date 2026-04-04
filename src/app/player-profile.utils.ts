export const DEFAULT_PLAYER_PROFILE_BUCKET_COUNT = 128;

export function getPlayerProfileKey(realm: string, name: string): string {
  return `${realm}::${name}`;
}

export function splitPlayerProfileKey(playerKey: string): { realm: string; name: string } {
  const separatorIndex = playerKey.indexOf('::');
  if (separatorIndex === -1) {
    return { realm: '', name: playerKey };
  }

  return {
    realm: playerKey.slice(0, separatorIndex),
    name: playerKey.slice(separatorIndex + 2)
  };
}

export function getPlayerProfileBucketLabel(
  playerKey: string,
  bucketCount: number = DEFAULT_PLAYER_PROFILE_BUCKET_COUNT
): string {
  return getPlayerProfileBucketIndex(playerKey, bucketCount).toString(16).padStart(2, '0');
}

export function getPlayerProfileBucketIndex(playerKey: string, bucketCount: number): number {
  const safeBucketCount = Number.isFinite(bucketCount) && bucketCount > 0
    ? Math.floor(bucketCount)
    : DEFAULT_PLAYER_PROFILE_BUCKET_COUNT;

  let hash = 2166136261;

  for (let index = 0; index < playerKey.length; index++) {
    hash ^= playerKey.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) % safeBucketCount;
}
