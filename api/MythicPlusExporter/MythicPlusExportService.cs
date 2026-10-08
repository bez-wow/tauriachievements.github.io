using System.Text.Json;
using Tauri.Core.Infrastructure;

namespace MythicPlusExporter;

public sealed record MythicPlusExportResult(
    MythicPlusDataset Dataset,
    int PreviousRunCount,
    string OutputDirectory
);

internal sealed record PreviousMythicPlusSnapshot(
    int RunCount,
    string? SeasonId,
    DateTimeOffset? GeneratedAt,
    IReadOnlyDictionary<(string Realm, string Name), MythicPlusStanding> Standings
);

/// <summary>
/// Reads every challenge map's leaderboard for each realm group and publishes the
/// /mythic-plus data files. Evermoon and Tauri share one leaderboard, so asking either realm
/// returns both; WoD keeps its own. Nothing is written unless every leaderboard was read,
/// so a flaky API never publishes a partial season.
/// </summary>
public sealed class MythicPlusExportService(
    string outputDirectory,
    ITauriApiClient apiClient,
    TimeProvider? timeProvider = null
)
{
    /// <summary>
    /// Leaderboards only grow during a season, so fewer runs than last time means the API
    /// returned a partial answer. A small allowance covers runs the server itself removed.
    /// </summary>
    private const double MaxShrinkFraction = 0.02;

    private readonly ChallengeLeaderboardReader _reader = new(apiClient);
    private readonly TimeProvider _timeProvider = timeProvider ?? TimeProvider.System;

    public async Task<MythicPlusExportResult> ExportAsync(
        MythicPlusExporterOptions options,
        CancellationToken cancellationToken
    )
    {
        var index = await _reader.ReadIndexAsync(options.Realms[0], cancellationToken);
        var leaderboards = await _reader.ReadLeaderboardsAsync(
            index,
            options.Realms,
            cancellationToken
        );
        // Every run in the files was on the leaderboards by now, so this is how current they are.
        var scannedAt = _timeProvider.GetUtcNow();

        if (leaderboards.Failures.Count > 0)
        {
            throw new InvalidOperationException(
                "Could not read every leaderboard, nothing was written:"
                    + Environment.NewLine
                    + string.Join(Environment.NewLine, leaderboards.Failures)
            );
        }

        var dataset = MythicPlusDatasetBuilder.Build(index, leaderboards.RunsByChallengeId);
        var previous = ReadPreviousSnapshot();
        var previousRunCount = previous.RunCount;

        if (
            !options.AllowShrink
            && previousRunCount > 0
            && dataset.RunCount < previousRunCount * (1 - MaxShrinkFraction)
        )
        {
            throw new InvalidOperationException(
                $"The leaderboards shrank from {previousRunCount} to {dataset.RunCount} runs, "
                    + "so the API probably answered only in part. Nothing was written. "
                    + "Run again later, or pass --allow-shrink if the drop is real (a new season)."
            );
        }

        var currentStandings = MythicPlusStandings.Build(dataset);
        var comparable =
            previous.SeasonId == MythicPlusCatalog.Season.Id
            && previous.GeneratedAt is not null
            && previous.Standings.Count > 0;
        var standings = comparable
            ? MythicPlusStandings.Compare(currentStandings, previous.Standings)
            : currentStandings;

        await MythicPlusFileWriter.WriteAsync(
            outputDirectory,
            dataset,
            standings,
            scannedAt,
            comparable ? previous.GeneratedAt : null,
            cancellationToken
        );
        return new MythicPlusExportResult(dataset, previousRunCount, outputDirectory);
    }

    private PreviousMythicPlusSnapshot ReadPreviousSnapshot()
    {
        var indexPath = Path.Combine(outputDirectory, MythicPlusFileWriter.IndexFileName);
        if (!File.Exists(indexPath))
        {
            return EmptyPreviousSnapshot();
        }

        try
        {
            using var document = JsonDocument.Parse(File.ReadAllBytes(indexPath));
            var root = document.RootElement;
            var runCount = ReadRunCount(root);
            var seasonId =
                root.TryGetProperty("season", out var season)
                && season.TryGetProperty("id", out var id)
                    ? id.GetString()
                    : null;
            var generatedAt =
                root.TryGetProperty("generatedAt", out var generated)
                && DateTimeOffset.TryParse(generated.GetString(), out var parsedGeneratedAt)
                    ? parsedGeneratedAt
                    : (DateTimeOffset?)null;
            var players = ReadPlayerKeys(root);
            var standings = ReadStandings(root, players);

            // Migration path for the index format from before compact standings existed. This
            // reads the old dungeon files once; every later scan uses `standings` from index.json.
            if (standings.Count == 0 && players.Count > 0)
            {
                standings = ReadLegacyStandings(root, players);
            }

            return new PreviousMythicPlusSnapshot(runCount, seasonId, generatedAt, standings);
        }
        catch (Exception error) when (error is JsonException or IOException)
        {
            return EmptyPreviousSnapshot();
        }
    }

    private static int ReadRunCount(JsonElement root) =>
        root.TryGetProperty("dungeons", out var dungeons)
        && dungeons.ValueKind == JsonValueKind.Array
            ? dungeons
                .EnumerateArray()
                .Sum(dungeon =>
                    dungeon.TryGetProperty("runCount", out var count)
                    && count.TryGetInt32(out var value)
                        ? value
                        : 0
                )
            : 0;

    private static List<(string Realm, string Name)> ReadPlayerKeys(JsonElement root)
    {
        if (
            !root.TryGetProperty("players", out var players)
            || players.ValueKind != JsonValueKind.Array
        )
        {
            return [];
        }

        return players
            .EnumerateArray()
            .Where(player =>
                player.ValueKind == JsonValueKind.Array && player.GetArrayLength() >= 2
            )
            .Select(player => (player[1].GetString() ?? "", player[0].GetString() ?? ""))
            .ToList();
    }

    private static Dictionary<(string Realm, string Name), MythicPlusStanding> ReadStandings(
        JsonElement root,
        IReadOnlyList<(string Realm, string Name)> players
    )
    {
        if (
            !root.TryGetProperty("standings", out var standings)
            || standings.ValueKind != JsonValueKind.Array
            || standings.GetArrayLength() != players.Count
        )
        {
            return [];
        }

        var result = new Dictionary<(string Realm, string Name), MythicPlusStanding>();
        var position = 0;
        foreach (var standing in standings.EnumerateArray())
        {
            if (standing.ValueKind != JsonValueKind.Array || standing.GetArrayLength() < 2)
            {
                return [];
            }

            var (realm, name) = players[position++];
            result[(realm, name)] = new MythicPlusStanding(
                name,
                realm,
                standing[0].GetDouble(),
                standing[1].GetInt32()
            );
        }

        return result;
    }

    private Dictionary<(string Realm, string Name), MythicPlusStanding> ReadLegacyStandings(
        JsonElement root,
        IReadOnlyList<(string Realm, string Name)> players
    )
    {
        if (
            !root.TryGetProperty("dungeons", out var dungeons)
            || dungeons.ValueKind != JsonValueKind.Array
        )
        {
            return [];
        }

        var expectedTables = root.TryGetProperty("tables", out var tables)
            ? tables.GetString()
            : null;
        var scores = new double[players.Count];

        foreach (var dungeon in dungeons.EnumerateArray())
        {
            var slug = dungeon.TryGetProperty("id", out var id) ? id.GetString() : null;
            if (string.IsNullOrWhiteSpace(slug))
            {
                return [];
            }

            var path = Path.Combine(outputDirectory, slug + ".json");
            if (!File.Exists(path))
            {
                return [];
            }

            using var document = JsonDocument.Parse(File.ReadAllBytes(path));
            var file = document.RootElement;
            if (
                expectedTables is not null
                && (
                    !file.TryGetProperty("tables", out var fileTables)
                    || fileTables.GetString() != expectedTables
                )
            )
            {
                return [];
            }
            if (!file.TryGetProperty("runs", out var runs) || runs.ValueKind != JsonValueKind.Array)
            {
                return [];
            }

            var dungeonBest = new double[players.Count];
            foreach (var run in runs.EnumerateArray())
            {
                if (run.ValueKind != JsonValueKind.Array || run.GetArrayLength() < 6)
                {
                    continue;
                }

                var score = run[3].GetDouble();
                foreach (var member in run[5].EnumerateArray())
                {
                    if (
                        member.ValueKind == JsonValueKind.Array
                        && member.GetArrayLength() >= 1
                        && member[0].TryGetInt32(out var playerIndex)
                        && playerIndex >= 0
                        && playerIndex < players.Count
                        && score > dungeonBest[playerIndex]
                    )
                    {
                        dungeonBest[playerIndex] = score;
                    }
                }
            }

            for (var playerIndex = 0; playerIndex < scores.Length; playerIndex++)
            {
                scores[playerIndex] += dungeonBest[playerIndex];
            }
        }

        var ranked = players
            .Select(
                (player, index) =>
                    new MythicPlusStanding(
                        player.Name,
                        player.Realm,
                        MythicPlusStandings.RoundScore(scores[index]),
                        Rank: 0
                    )
            )
            .OrderByDescending(standing => standing.Score)
            .ThenBy(standing => $"{standing.Name}|{standing.Realm}", StringComparer.Ordinal)
            .Select((standing, index) => standing with { Rank = index + 1 });

        return ranked.ToDictionary(
            standing => (standing.Realm, standing.Name),
            standing => standing
        );
    }

    private static PreviousMythicPlusSnapshot EmptyPreviousSnapshot() =>
        new(0, null, null, new Dictionary<(string Realm, string Name), MythicPlusStanding>());
}
