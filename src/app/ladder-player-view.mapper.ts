import { getRaceIconPath } from '../utils/raceIconHelper';
import { LadderAchievement } from './ladder.service';
import { HighlightPart, LadderPlayerView } from './ladder.types';

export function mapLadderPlayersToView(players: LadderAchievement[], searchQuery: string): LadderPlayerView[] {
  const normalizedSearchQuery = searchQuery.trim();

  return players.map((player, index) => ({
    rank: index + 1,
    name: player.name,
    realm: player.realm,
    race: player.race,
    gender: player.gender,
    raceIcon: getRaceIconPath(player.race, player.gender),
    classIcon: String(player.class),
    guild: player.guild,
    achievementPoints: player.achievementPoints,
    honorableKills: player.honorableKills,
    faction: player.faction,
    nameParts: buildHighlightParts(player.name, normalizedSearchQuery),
    guildParts: buildHighlightParts(player.guild, normalizedSearchQuery)
  }));
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
