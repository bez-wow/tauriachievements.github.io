import {
  GLADIATOR_MOUNT_OPTIONS,
  REALM_FIRST_OPTIONS,
  R1_GLADIATOR_OPTIONS,
  RATED_BATTLEGROUND_OPTIONS
} from './rare-achievement-groups';
import {
  RareAchievementCharacter,
  RareAchievementDefinition,
  RareAchievementSummary
} from './rare-achievements.types';

const GLADIATOR_TITLE_ID_ORDER = R1_GLADIATOR_OPTIONS.map((option) => option.value);
const GLADIATOR_MOUNT_ID_ORDER = GLADIATOR_MOUNT_OPTIONS.map((option) => option.value);
const RATED_BATTLEGROUND_HERO_ID_ORDER = RATED_BATTLEGROUND_OPTIONS.map((option) => option.value);
const REALM_FIRST_ID_ORDER = REALM_FIRST_OPTIONS.map((option) => option.value);

export const GLADIATOR_TITLE_IDS: ReadonlySet<number> = new Set<number>(GLADIATOR_TITLE_ID_ORDER);
export const GLADIATOR_MOUNT_IDS: ReadonlySet<number> = new Set<number>(GLADIATOR_MOUNT_ID_ORDER);
export const RATED_BATTLEGROUND_HERO_IDS: ReadonlySet<number> = new Set<number>(RATED_BATTLEGROUND_HERO_ID_ORDER);
export const REALM_FIRST_IDS: ReadonlySet<number> = new Set<number>(REALM_FIRST_ID_ORDER);

const TRACKED_ACHIEVEMENT_FALLBACK_LABELS = new Map<number, string>([
  ...R1_GLADIATOR_OPTIONS.map((option) => [option.value, option.label] as const),
  ...GLADIATOR_MOUNT_OPTIONS.map((option) => [option.value, option.label] as const),
  ...RATED_BATTLEGROUND_OPTIONS.map((option) => [option.value, option.label] as const),
  ...REALM_FIRST_OPTIONS.map((option) => [option.value, option.label] as const)
]);

export function buildRareAchievementNamesById(
  achievements: ReadonlyArray<RareAchievementDefinition>
): Map<number, string> {
  return new Map(achievements.map((achievement) => [achievement.id, achievement.name] as const));
}

export function summarizeRareAchievements(
  character: RareAchievementCharacter,
  achievementNamesById: ReadonlyMap<number, string>
): RareAchievementSummary | undefined {
  const ownedAchievementIds = new Set(character.achievements.map((achievement) => achievement.id));
  const gladiatorTitles = collectOwnedAchievementNames(
    ownedAchievementIds,
    GLADIATOR_TITLE_ID_ORDER,
    achievementNamesById
  );
  const gladiatorMounts = collectOwnedAchievementNames(
    ownedAchievementIds,
    GLADIATOR_MOUNT_ID_ORDER,
    achievementNamesById
  );
  const ratedBattlegroundHeroTitles = collectOwnedAchievementNames(
    ownedAchievementIds,
    RATED_BATTLEGROUND_HERO_ID_ORDER,
    achievementNamesById
  );
  const realmFirstAchievements = collectOwnedAchievementNames(
    ownedAchievementIds,
    REALM_FIRST_ID_ORDER,
    achievementNamesById
  );
  const achievementNames = [
    ...gladiatorTitles,
    ...gladiatorMounts,
    ...ratedBattlegroundHeroTitles,
    ...realmFirstAchievements
  ];

  if (achievementNames.length === 0) {
    return undefined;
  }

  return {
    gladiatorTitleCount: gladiatorTitles.length,
    gladiatorMountCount: gladiatorMounts.length,
    ratedBattlegroundHeroCount: ratedBattlegroundHeroTitles.length,
    realmFirstCount: realmFirstAchievements.length,
    achievementNames
  };
}

export function buildRareAchievementSummaryLabel(summary: RareAchievementSummary | undefined): string | undefined {
  if (!summary) {
    return undefined;
  }

  if (summary.achievementNames.length > 0) {
    return summary.achievementNames.join(', ');
  }

  const parts: string[] = [];

  if (summary.gladiatorTitleCount > 0) {
    parts.push(pluralize(summary.gladiatorTitleCount, 'Gladiator title'));
  }

  if (summary.gladiatorMountCount > 0) {
    parts.push(pluralize(summary.gladiatorMountCount, 'Gladiator mount'));
  }

  if (summary.ratedBattlegroundHeroCount > 0) {
    parts.push(pluralize(summary.ratedBattlegroundHeroCount, 'Rated battleground hero title'));
  }

  if (summary.realmFirstCount > 0) {
    parts.push(pluralize(summary.realmFirstCount, 'Realm first achievement'));
  }

  return parts.join(' & ');
}

function collectOwnedAchievementNames(
  ownedAchievementIds: ReadonlySet<number>,
  trackedAchievementIds: ReadonlyArray<number>,
  achievementNamesById: ReadonlyMap<number, string>
): string[] {
  const names: string[] = [];

  for (const achievementId of trackedAchievementIds) {
    if (!ownedAchievementIds.has(achievementId)) {
      continue;
    }

    const achievementName = achievementNamesById.get(achievementId)
      ?? TRACKED_ACHIEVEMENT_FALLBACK_LABELS.get(achievementId);

    if (achievementName) {
      names.push(achievementName);
    }
  }

  return names;
}

function pluralize(count: number, singularLabel: string): string {
  return `${count.toLocaleString()} ${singularLabel}${count === 1 ? '' : 's'}`;
}
