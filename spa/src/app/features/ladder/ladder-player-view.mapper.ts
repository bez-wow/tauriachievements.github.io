import { getRaceIconPath } from '../../game/raceIconHelper';
import { buildRareAchievementCharacterKey } from '../../players/rare-achievement-groups';
import { buildRareAchievementSummaryLabel } from '../../players/rare-achievement-summary';
import { HighlightPart, LadderPlayerView, LadderRow } from './ladder.types';
import { RareAchievementSummary } from '../../players/rare-achievements.types';

export function mapLadderPlayersToView(
  rows: LadderRow[],
  searchQuery: string,
  rareAchievementsByCharacter: ReadonlyMap<string, RareAchievementSummary> = new Map<string, RareAchievementSummary>()
): LadderPlayerView[] {
  const normalizedSearchQuery = searchQuery.trim();

  return rows.map(({ player, rank }) => {
    const rareAchievementSummary = rareAchievementsByCharacter.get(
      buildRareAchievementCharacterKey(player.name, player.realm)
    );

    return {
      ...player,
      rank,
      raceIcon: getRaceIconPath(player.race, player.gender),
      classIcon: String(player.class),
      nameParts: buildHighlightParts(player.name, normalizedSearchQuery),
      guildParts: buildHighlightParts(player.guild, normalizedSearchQuery),
      gladiatorTitleCount: rareAchievementSummary?.gladiatorTitleCount ?? 0,
      gladiatorMountCount: rareAchievementSummary?.gladiatorMountCount ?? 0,
      ratedBattlegroundHeroCount: rareAchievementSummary?.ratedBattlegroundHeroCount ?? 0,
      realmFirstCount: rareAchievementSummary?.realmFirstCount ?? 0,
      isNewRareAchievementCharacter: isNewRareAchievementCharacter(player.isNewCharacter, rareAchievementSummary),
      rareAchievementSummaryLabel: buildRareAchievementSummaryLabel(rareAchievementSummary)
    };
  });
}

export function buildHighlightParts(value: string, query: string): HighlightPart[] {
  if (!value) {
    return [];
  }

  if (!query) {
    return [{ text: value, isMatch: false }];
  }

  const normalizedValue = value.toLowerCase();
  const normalizedQuery = query.toLowerCase();
  const parts: HighlightPart[] = [];
  let cursor = 0;

  while (cursor < value.length) {
    const matchIndex = normalizedValue.indexOf(normalizedQuery, cursor);
    if (matchIndex === -1) {
      parts.push({ text: value.slice(cursor), isMatch: false });
      break;
    }

    if (matchIndex > cursor) {
      parts.push({ text: value.slice(cursor, matchIndex), isMatch: false });
    }

    parts.push({
      text: value.slice(matchIndex, matchIndex + query.length),
      isMatch: true
    });

    cursor = matchIndex + query.length;
  }

  return parts;
}

function isNewRareAchievementCharacter(
  isNewCharacter: boolean,
  rareAchievementSummary: RareAchievementSummary | undefined
): boolean {
  return isNewCharacter && !!rareAchievementSummary && (
    rareAchievementSummary.gladiatorTitleCount > 0
    || rareAchievementSummary.gladiatorMountCount > 0
    || rareAchievementSummary.realmFirstCount > 0
  );
}
