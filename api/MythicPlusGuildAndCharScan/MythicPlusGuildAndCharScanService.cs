using MythicPlusExporter;
using Tauri.Core.Infrastructure;

namespace MythicPlusGuildAndCharScan;

public sealed record MythicPlusGuildAndCharScanResult(
    int RunCount,
    int CharacterCount,
    int NewGuildCount,
    int NewGuildlessCharacterCount,
    IReadOnlyList<string> Failures
);

/// <summary>
/// Feeds every character on the Mythic+ leaderboards into the scan inputs: their guilds go
/// to the realm guild lists, characters without a guild to guildless-characters.txt. Both
/// files are only appended to, so a leaderboard that fails to load just means fewer names
/// today; everything that was read is still kept.
/// </summary>
public sealed class MythicPlusGuildAndCharScanService(
    string guildsDirectory,
    string guildlessCharactersPath,
    ITauriApiClient apiClient
)
{
    private readonly ChallengeLeaderboardReader _reader = new(apiClient);

    public async Task<MythicPlusGuildAndCharScanResult> ScanAsync(
        IReadOnlyList<string> realms,
        CancellationToken cancellationToken
    )
    {
        ChallengeIndex index;
        try
        {
            index = await _reader.ReadIndexAsync(realms[0], cancellationToken);
        }
        catch (InvalidOperationException ex)
        {
            return new MythicPlusGuildAndCharScanResult(0, 0, 0, 0, [ex.Message]);
        }

        var leaderboards = await _reader.ReadLeaderboardsAsync(index, realms, cancellationToken);
        var runs = leaderboards.RunsByChallengeId.Values.SelectMany(mapRuns => mapRuns).ToList();

        // A character can show up in many runs. The newest run decides their guild, so
        // someone who has joined a guild since an old run is not listed as guildless.
        var characters = runs.OrderByDescending(run => run.CompletedAt)
            .SelectMany(run => run.Members)
            .Select(member => new SeenCharacter(member.Name, member.Realm, member.Guild))
            .DistinctBy(character => $"{character.Name}|{character.Realm}".ToLowerInvariant())
            .ToList();

        var newGuildCount = GuildListFiles.AddNewGuilds(guildsDirectory, characters);
        var newGuildlessCount = GuildListFiles.AddNewGuildlessCharacters(
            guildlessCharactersPath,
            characters
        );

        return new MythicPlusGuildAndCharScanResult(
            runs.Count,
            characters.Count,
            newGuildCount,
            newGuildlessCount,
            leaderboards.Failures
        );
    }
}
