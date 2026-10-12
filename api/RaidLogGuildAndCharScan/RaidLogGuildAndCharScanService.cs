using System.Collections.Concurrent;
using System.Text.Json;
using RaidLogExporter;
using Tauri.Core.Helpers;
using Tauri.Core.Infrastructure;

namespace RaidLogGuildAndCharScan;

/// <param name="RaiderCount">Distinct characters in the raid log export.</param>
/// <param name="NotFoundCount">Raiders the API no longer knows (renamed, deleted, moved away).</param>
/// <param name="Failures">Raiders whose character sheet could not be read this time.</param>
public sealed record RaidLogGuildAndCharScanResult(
    int RaiderCount,
    int NotFoundCount,
    int NewGuildCount,
    int NewGuildlessCharacterCount,
    IReadOnlyList<string> Failures
);

/// <summary>
/// Feeds every character who has an Emerald Nightmare kill in the raid log export into the scan
/// inputs: their guilds go to the realm guild lists, characters without a guild to
/// guildless-characters.txt. Logs only name the guild of members with an armory link, so
/// Evermoon raiders come without one; every raider's current guild is read from their character
/// sheet instead. Both files are only appended to, so a sheet that fails to load just means
/// one name fewer today.
/// </summary>
public sealed class RaidLogGuildAndCharScanService(
    string raidLogDirectory,
    string guildsDirectory,
    string guildlessCharactersPath,
    ITauriApiClient apiClient
)
{
    private const string CharacterSheetEndpoint = "character-sheet";
    private const int MaxParallelLookups = 32;
    private const int ProgressInterval = 1000;

    public async Task<RaidLogGuildAndCharScanResult> ScanAsync(CancellationToken cancellationToken)
    {
        var export = RaidLogFileReader.Read(raidLogDirectory);
        if (export.Logs.Count == 0)
        {
            return new RaidLogGuildAndCharScanResult(
                0,
                0,
                0,
                0,
                [$"No raid log export in {raidLogDirectory}; run RaidLogExporter first."]
            );
        }

        var raiders = export
            .Logs.Values.SelectMany(log => log.Members)
            .Select(member => (member.Name, member.Realm))
            .DistinctBy(raider => $"{raider.Name}|{raider.Realm}".ToLowerInvariant())
            .OrderBy(raider => raider.Realm, StringComparer.Ordinal)
            .ThenBy(raider => raider.Name, StringComparer.Ordinal)
            .ToList();

        Console.WriteLine($"Looking up the guilds of {raiders.Count} raiders...");

        var characters = new ConcurrentBag<SeenCharacter>();
        var failures = new ConcurrentBag<string>();
        var notFoundCount = 0;
        var done = 0;

        await Parallel.ForEachAsync(
            raiders,
            new ParallelOptions
            {
                MaxDegreeOfParallelism = MaxParallelLookups,
                CancellationToken = cancellationToken,
            },
            async (raider, token) =>
            {
                var label = $"{raider.Name}-{raider.Realm}";
                if (!CharacterHelpers.TryResolveRealm(raider.Realm, out var apiRealm, out _))
                {
                    failures.Add($"{label}: unknown realm.");
                }
                else
                {
                    var result = await apiClient.FetchResponseElementAsync(
                        CharacterSheetEndpoint,
                        new { r = apiRealm, n = raider.Name },
                        label,
                        token
                    );

                    if (
                        result.Succeeded
                        && result.ResponseElement is { } response
                        && TryReadGuildName(response, out var guild)
                    )
                    {
                        characters.Add(new SeenCharacter(raider.Name, raider.Realm, guild));
                    }
                    else if (
                        result.ApiErrorCode == TauriApiResponseResult.CharacterNotFoundErrorCode
                    )
                    {
                        Interlocked.Increment(ref notFoundCount);
                    }
                    else
                    {
                        failures.Add(
                            $"{label}: {result.FailureMessage ?? "no guild in the sheet."}"
                        );
                    }
                }

                var count = Interlocked.Increment(ref done);
                if (count % ProgressInterval == 0)
                {
                    Console.WriteLine($"  {count} of {raiders.Count} raiders looked up");
                }
            }
        );

        var newGuildCount = GuildListFiles.AddNewGuilds(guildsDirectory, characters);
        var newGuildlessCount = GuildListFiles.AddNewGuildlessCharacters(
            guildlessCharactersPath,
            characters
        );

        return new RaidLogGuildAndCharScanResult(
            raiders.Count,
            notFoundCount,
            newGuildCount,
            newGuildlessCount,
            [.. failures.Order(StringComparer.Ordinal)]
        );
    }

    /// <summary>
    /// A guildless character's sheet has an empty <c>guildName</c>. A sheet without the field
    /// says nothing, so it must not make the character guildless.
    /// </summary>
    private static bool TryReadGuildName(JsonElement response, out string guild)
    {
        if (
            response.ValueKind == JsonValueKind.Object
            && response.TryGetProperty("guildName", out var guildName)
            && guildName.ValueKind == JsonValueKind.String
        )
        {
            guild = guildName.GetString()!.Trim();
            return true;
        }

        guild = "";
        return false;
    }
}
