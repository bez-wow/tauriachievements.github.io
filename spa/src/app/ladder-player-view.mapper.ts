import { getRaceIconPath } from '../utils/raceIconHelper';
import { buildRareAchievementCharacterKey } from './rare-achievement-groups';
import { buildRareAchievementSummaryLabel } from './rare-achievement-summary';
import { LadderAchievement } from './ladder.service';
import { HighlightPart, LadderPlayerView } from './ladder.types';
import { RareAchievementSummary } from './rare-achievements.types';

export function mapLadderPlayersToView(
  players: LadderAchievement[],
  searchQuery: string,
  rareAchievementsByCharacter: ReadonlyMap<string, RareAchievementSummary> = new Map<string, RareAchievementSummary>()
): LadderPlayerView[] {
  const normalizedSearchQuery = searchQuery.trim();

  return players.map((player, index) => {
    const rareAchievementSummary = rareAchievementsByCharacter.get(
      buildRareAchievementCharacterKey(player.name, player.realm)
    );

    return {
      rank: index + 1,
      name: player.name,
      realm: player.realm,
      race: player.race,
      gender: player.gender,
      raceIcon: getRaceIconPath(player.race, player.gender),
      classIcon: String(player.class),
      guild: player.guild,
      achievementPoints: player.achievementPoints,
      achievementPointsDelta: player.achievementPointsDelta,
      achievementRankDelta: player.achievementRankDelta,
      honorableKills: player.honorableKills,
      honorableKillsDelta: player.honorableKillsDelta,
      honorableKillsRankDelta: player.honorableKillsRankDelta,
      appearanceCount: player.appearanceCount,
      appearanceCountDelta: player.appearanceCountDelta,
      appearanceRankDelta: player.appearanceRankDelta,
      achievementsTotal: player.achievementsTotal,
      achievementsTotalDelta: player.achievementsTotalDelta,
      achievementsTotalRankDelta: player.achievementsTotalRankDelta,
      playedTime: player.playedTime,
      playedTimeDelta: player.playedTimeDelta,
      playedTimeRankDelta: player.playedTimeRankDelta,
      ilvl: player.ilvl,
      characterAge: player.characterAge,
      isNewCharacter: player.isNewCharacter,
      faction: player.faction,
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
