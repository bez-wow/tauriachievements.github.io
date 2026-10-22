import { MythicPlusMember, MythicPlusStandingEntry, PlayerScore, playerRanks } from './mythic-plus';
import { realmSlug } from '../../game/wow';

export interface MythicPlusGuild {
  name: string;
  realm: string;
}

type GuildMember = Pick<MythicPlusMember, 'guild' | 'realm'>;

export function guildOf(member: GuildMember): MythicPlusGuild | undefined {
  return member.guild ? { name: member.guild, realm: member.realm } : undefined;
}

export function guildLadderLink(guild: MythicPlusGuild): string[] {
  return ['/mythic-plus', 'guild', realmSlug(guild.realm), guild.name];
}

export function inGuild(guild: MythicPlusGuild): (member: GuildMember) => boolean {
  const realm = realmSlug(guild.realm);
  return member => member.guild === guild.name && realmSlug(member.realm) === realm;
}

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
  rank: number;
  overallRank: number;
  overallPosition: number;
}

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

export function previousOverallRank(standing: MythicPlusStandingEntry | undefined): number | undefined {
  return standing?.[3] === undefined ? undefined : standing[1] + standing[3];
}

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
