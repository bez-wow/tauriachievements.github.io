import { GuildAnalysisPlayer } from './guild-analysis';
import { MythicPlusIndex, RunQuality, characterKey as mythicPlusCharacterKey, scoreQuality } from './mythic-plus';
import { RaidDifficulty, RaidMetric, RaidSpec, RankedScore, characterKey as raidCharacterKey } from './raid-logs';

/*
 * A guild's PvE scores page (/<guild page>/scores): each member's score on the raid leaderboard
 * and on the Mythic+ players view, exactly as those pages show it, ranked within the guild.
 * Members are found on the leaderboards by name and the guild's realm.
 */

export type GuildMember = Pick<GuildAnalysisPlayer, 'name' | 'class'>;

export interface GuildScoreRow {
  member: GuildMember;
  /** The member's place among the guild's scored members, from 1. Members tied on the leaderboard share it. */
  place: number;
  score: number;
  /** The member's rank on the whole leaderboard: every class, every realm. */
  leaderboardRank: number;
  /** The leaderboard's colour for the score, against its top score. */
  quality: RunQuality;
}

export interface GuildRaidScoreRow extends GuildScoreRow {
  /** DPS or HPS: whichever leaderboard gives the member the higher score. */
  metric: RaidMetric;
  /** The spec they played most on the kills that count there. */
  spec?: RaidSpec;
  killed: number;
  bossCount: number;
}

export interface GuildScores<T extends GuildScoreRow> {
  /** Best first. */
  rows: T[];
  /** The members the leaderboard doesn't have, A to Z. */
  unscored: GuildMember[];
}

const RAID_METRICS: ReadonlyArray<RaidMetric> = ['dps', 'hps'];

/**
 * Each member's raid score on one difficulty. Healers are ranked by HPS and everyone else by
 * DPS, and a character who played both is on both leaderboards; the member gets the higher of
 * the two scores (DPS on a tie). `rankings` are the leaderboard's unfiltered rankings
 * (rankScores of scoreCharacters, no spec).
 */
export function guildRaidScores(
  members: readonly GuildMember[],
  realm: string,
  rankings: Readonly<Record<RaidMetric, readonly RankedScore[]>>
): GuildScores<GuildRaidScoreRow> {
  const byMetric = RAID_METRICS.map(metric => ({
    metric,
    top: rankings[metric][0]?.score ?? 0,
    entries: new Map(rankings[metric].map(entry => [raidCharacterKey(entry.character), entry]))
  }));

  const rows: Array<Omit<GuildRaidScoreRow, 'place'>> = [];
  const unscored: GuildMember[] = [];
  for (const member of members) {
    const key = raidCharacterKey({ name: member.name, realm });
    let best: Omit<GuildRaidScoreRow, 'place'> | undefined;
    for (const { metric, top, entries } of byMetric) {
      const entry = entries.get(key);
      if (entry && (!best || entry.score > best.score)) {
        best = {
          member,
          metric,
          score: entry.score,
          leaderboardRank: entry.rank,
          quality: scoreQuality(entry.score, top),
          spec: entry.spec,
          killed: entry.killed,
          bossCount: entry.bosses.length
        };
      }
    }

    if (best) {
      rows.push(best);
    } else {
      unscored.push(member);
    }
  }

  rows.sort((a, b) => b.score - a.score || b.killed - a.killed || byName(a.member, b.member));
  return { rows: withPlaces(rows, (a, b) => a.score === b.score), unscored: unscored.sort(byName) };
}

/**
 * Each member's season score on the Mythic+ players view (Season, every dungeon, every realm),
 * read from the export's standings, so no dungeon file is needed. Undefined for an export
 * without standings.
 */
export function guildMythicPlusScores(
  members: readonly GuildMember[],
  realm: string,
  index: Pick<MythicPlusIndex, 'players' | 'standings'>
): GuildScores<GuildScoreRow> | undefined {
  const standings = index.standings;
  if (!standings || standings.length !== index.players.length) {
    return undefined;
  }

  const positions = new Map(index.players.map(([name, playerRealm], position) =>
    [mythicPlusCharacterKey({ name, realm: playerRealm }), position]));
  const top = standings.reduce((best, [score]) => Math.max(best, score), 0);

  const rows: Array<Omit<GuildScoreRow, 'place'>> = [];
  const unscored: GuildMember[] = [];
  for (const member of members) {
    const position = positions.get(mythicPlusCharacterKey({ name: member.name, realm }));
    const standing = position === undefined ? undefined : standings[position];
    if (standing && standing[0] > 0) {
      const [score, leaderboardRank] = standing;
      rows.push({ member, score, leaderboardRank, quality: scoreQuality(score, top) });
    } else {
      unscored.push(member);
    }
  }

  // The leaderboard's rank already breaks a score tie by total time, as the players view does.
  rows.sort((a, b) => a.leaderboardRank - b.leaderboardRank || byName(a.member, b.member));
  return { rows: withPlaces(rows, (a, b) => a.leaderboardRank === b.leaderboardRank), unscored: unscored.sort(byName) };
}

/**
 * The next easier difficulty with a kill anywhere in the raid (Mythic → Heroic → Normal), for a
 * guild with nobody scored on the one tried. Undefined below the easiest.
 */
export function easierDifficulty<T extends Pick<RaidDifficulty, 'kills'>>(difficulties: readonly T[], current: T): T | undefined {
  return difficulties.slice(0, difficulties.indexOf(current)).reverse().find(difficulty => difficulty.kills > 0);
}

/** Places from 1, in order; rows `same` calls equal share one and skip the places they take (1, 1, 3). */
function withPlaces<T extends Omit<GuildScoreRow, 'place'>>(rows: readonly T[], same: (a: T, b: T) => boolean): Array<T & { place: number }> {
  const placed: Array<T & { place: number }> = [];
  rows.forEach((row, index) => {
    const previous = placed[index - 1];
    placed.push({ ...row, place: previous && same(row, rows[index - 1]) ? previous.place : index + 1 });
  });
  return placed;
}

function byName(a: GuildMember, b: GuildMember): number {
  return a.name.localeCompare(b.name);
}
