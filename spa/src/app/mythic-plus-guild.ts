import { MythicPlusMember, MythicPlusStandingEntry, PlayerScore, playerRanks } from './mythic-plus';
import { realmSlug } from './mythic-plus-profile';

/*
 * The pure parts of /mythic-plus/guild/:realm/:guild, a guild's own Mythic+ ladder: naming the
 * guild in URLs, picking its members out of a ranking, and how they moved inside the guild.
 */

/** A guild is its name on its realm: guilds of the same name on two realms are two guilds. */
export interface MythicPlusGuild {
  name: string;
  realm: string;
}

type GuildMember = Pick<MythicPlusMember, 'guild' | 'realm'>;

/** The character's guild, or undefined when they have none. */
export function guildOf(member: GuildMember): MythicPlusGuild | undefined {
  return member.guild ? { name: member.guild, realm: member.realm } : undefined;
}

/** Router commands for a guild's ladder. The realm is the profile URLs' slug, the name as it is. */
export function guildLadderLink(guild: MythicPlusGuild): string[] {
  return ['/mythic-plus', 'guild', realmSlug(guild.realm), guild.name];
}

/**
 * Whether a character is in the guild: the same name on the same realm. As a rankPlayers
 * include it keeps every run a member played, with guildmates or not.
 */
export function inGuild(guild: MythicPlusGuild): (member: GuildMember) => boolean {
  const realm = realmSlug(guild.realm);
  return member => member.guild === guild.name && realmSlug(member.realm) === realm;
}

/**
 * The guild a URL names, from the export's characters. The realm is matched without regard to
 * case. The name is matched exactly first, then without regard to case, so a typed
 * `/evermoon/skill issue` still finds Skill Issue. Undefined when no character is in it.
 */
export function findGuild(characters: Iterable<GuildMember>, realm: string, name: string): MythicPlusGuild | undefined {
  const wantedRealm = realmSlug(realm);
  const folded = foldCase(name);
  let caseless: MythicPlusGuild | undefined;
  for (const character of characters) {
    if (!character.guild || realmSlug(character.realm) !== wantedRealm) {
      continue;
    }

    if (character.guild === name) {
      return { name, realm: character.realm };
    }
    if (!caseless && foldCase(character.guild) === folded) {
      caseless = { name: character.guild, realm: character.realm };
    }
  }

  return caseless;
}

export interface GuildLadderEntry {
  player: PlayerScore;
  /** Place in the guild; the same score and total time share it (playerRanks). */
  rank: number;
  /** Place among every character of the ranking, shared the same way. */
  overallRank: number;
  /** The row (1-based) the character is on in the whole ranking; can be below `overallRank`. */
  overallPosition: number;
}

/**
 * The guild's members out of a ranking of every character (rankPlayers), each with their place
 * in the guild and on the whole leaderboard. Their scores are the leaderboard's, since every run
 * they played counts; only the ranks are counted again inside the guild.
 */
export function guildLadder(ranking: readonly PlayerScore[], guild: MythicPlusGuild): GuildLadderEntry[] {
  const isMember = inGuild(guild);
  const overall = playerRanks(ranking);
  const members: Array<Omit<GuildLadderEntry, 'rank'>> = [];
  ranking.forEach((player, index) => {
    if (isMember(player.member)) {
      members.push({ player, overallRank: overall[index], overallPosition: index + 1 });
    }
  });

  const ranks = playerRanks(members.map(member => member.player));
  return members.map((member, index) => ({ ...member, rank: ranks[index] }));
}

/** A character's overall rank in the previous scan: rank plus rank change. Undefined when new since then. */
export function previousOverallRank(standing: MythicPlusStandingEntry | undefined): number | undefined {
  return standing?.[3] === undefined ? undefined : standing[1] + standing[3];
}

/**
 * Guild-rank changes since the previous scan. The standings only keep overall changes, but
 * ordering the guild by its members' previous overall ranks gives their previous guild ranks
 * (shared on a tie, like every rank). Members new since the last scan have none: they are left
 * out, so they only push the others down from where they stand now.
 *
 * The guild is today's: someone who joined since the last scan counts as if they were in it then.
 *
 * Returns previous minus current guild rank by key, so a positive change means they climbed.
 */
export function guildRankChanges(
  members: ReadonlyArray<{ key: string; rank: number; previousOverallRank?: number }>
): Map<string, number> {
  const returning = members
    .flatMap(({ key, rank, previousOverallRank: previous }) => previous === undefined ? [] : [{ key, rank, previous }])
    .sort((a, b) => a.previous - b.previous);

  const changes = new Map<string, number>();
  let previousRank = 0;
  returning.forEach((member, index) => {
    if (index === 0 || member.previous !== returning[index - 1].previous) {
      previousRank = index + 1;
    }
    changes.set(member.key, previousRank - member.rank);
  });
  return changes;
}

function foldCase(value: string): string {
  return value.normalize('NFC').toLocaleLowerCase();
}
