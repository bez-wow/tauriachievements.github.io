using System.Collections.Concurrent;
using System.Text.Json;
using Tauri.Core.Helpers;
using Tauri.Core.Infrastructure;

namespace RaidLogExporter;

/// <summary>
/// Names the guilds the API could not (see <see cref="RaidLogResponseParser"/>): Evermoon
/// guilds credited on Tauri logs. The likely name is the current guild most of that guild's
/// raiders are in, from the ladder's Players.csv. A name counts only once <c>guild-info</c> on
/// the guild's own realm answers with the same guild id, which also gives its real faction.
/// A guild no candidate confirms stays unnamed and is tried again next run.
/// </summary>
public sealed class RaidGuildResolver(
    ITauriApiClient apiClient,
    PlayerGuildDirectory guildDirectory
)
{
    private const string GuildInfoEndpoint = "guild-info";
    private const int MaxCandidates = 3;
    private const int MaxParallelGuilds = 4;

    public async Task<IReadOnlyList<RaidLog>> ResolveAsync(
        IReadOnlyList<RaidLog> logs,
        CancellationToken cancellationToken
    )
    {
        var groups = logs.Where(log => log.Guild is not null)
            .GroupBy(log => (log.Guild!.Realm, log.Guild.Id))
            .ToList();
        var resolved = new Dictionary<(string Realm, int Id), RaidGuild>();
        var unnamed = new List<IGrouping<(string Realm, int Id), RaidLog>>();

        foreach (var group in groups)
        {
            // A name is either the API's for a guild of the log's realm, or one confirmed by an
            // earlier run; the latest kill has the current one.
            var named = group
                .Where(log => log.Guild!.Name.Length > 0)
                .MaxBy(log => log.KilledAt)
                ?.Guild;
            if (named is not null)
            {
                resolved[group.Key] = named;
            }
            else
            {
                unnamed.Add(group);
            }
        }

        var lookups = new ConcurrentDictionary<(string Realm, int Id), RaidGuild>();
        await Parallel.ForEachAsync(
            unnamed,
            new ParallelOptions
            {
                MaxDegreeOfParallelism = MaxParallelGuilds,
                CancellationToken = cancellationToken,
            },
            async (group, token) =>
            {
                lookups[group.Key] =
                    await LookUpAsync(group.Key.Realm, group.Key.Id, group, token)
                    ?? new RaidGuild(
                        group.Key.Id,
                        "",
                        group.Key.Realm,
                        RaidLogResponseParser.MajorityFaction(group.SelectMany(log => log.Members))
                    );
            }
        );

        foreach (var (key, guild) in lookups)
        {
            resolved[key] = guild;
        }

        if (unnamed.Count > 0)
        {
            var named = lookups.Values.Count(guild => guild.Name.Length > 0);
            Console.WriteLine($"  Named {named} of {unnamed.Count} guilds the logs did not name.");
        }

        return
        [
            .. logs.Select(log =>
                log.Guild is null
                    ? log
                    : log with
                    {
                        Guild = resolved[(log.Guild.Realm, log.Guild.Id)],
                    }
            ),
        ];
    }

    /// <summary>
    /// The guilds the guild's raiders are in now, most common first. Only raiders of the guild's
    /// realm count; Players.csv knows their current guild, a log only the guild of linked members.
    /// </summary>
    public IReadOnlyList<string> Candidates(string realm, IEnumerable<RaidLog> logs) =>
        [
            .. logs.SelectMany(log => log.Members)
                .Where(member => member.Realm == realm)
                .Select(member => guildDirectory.Find(member.Realm, member.Name) ?? member.Guild)
                .Where(guild => guild.Length > 0)
                .GroupBy(guild => guild, StringComparer.Ordinal)
                .OrderByDescending(group => group.Count())
                .ThenBy(group => group.Key, StringComparer.Ordinal)
                .Take(MaxCandidates)
                .Select(group => group.Key),
        ];

    private async Task<RaidGuild?> LookUpAsync(
        string realm,
        int id,
        IEnumerable<RaidLog> logs,
        CancellationToken cancellationToken
    )
    {
        if (!CharacterHelpers.TryResolveRealm(realm, out var apiRealm, out _))
        {
            return null;
        }

        foreach (var candidate in Candidates(realm, logs))
        {
            var result = await apiClient.FetchResponseElementAsync(
                GuildInfoEndpoint,
                new { r = apiRealm, gn = candidate },
                $"guild '{candidate}' on {apiRealm}",
                cancellationToken
            );

            if (
                result.Succeeded
                && result.ResponseElement is { ValueKind: JsonValueKind.Object } response
                && response.TryGetProperty("guildid", out var guildId)
                && guildId.TryGetInt32(out var foundId)
                && foundId == id
            )
            {
                var name =
                    response.TryGetProperty("guildName", out var guildName)
                    && guildName.GetString() is { Length: > 0 } confirmed
                        ? confirmed
                        : candidate;
                var faction =
                    response.TryGetProperty("gFaction", out var gFaction)
                    && gFaction.TryGetInt32(out var factionId)
                    && factionId == RaidCatalog.Horde
                        ? RaidCatalog.Horde
                        : RaidCatalog.Alliance;
                return new RaidGuild(id, name.Trim(), realm, faction);
            }
        }

        return null;
    }
}
