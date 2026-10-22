using System.Globalization;
using System.Text.Json;

namespace RaidLogExporter;

/// <param name="Logs">Every kill the boss files hold, keyed by log.</param>
/// <param name="LogCount">How many kills the index listed.</param>
/// <param name="Items">The item names already looked up.</param>
/// <param name="GeneratedAt">When that export read the rankings.</param>
/// <param name="Changes">What that export added since the one before it.</param>
/// <param name="OutOfDate">
/// Written in an older format, so its logs lack what this one adds: they still tell which kills
/// are new, but every log is read again.
/// </param>
public sealed record PreviousRaidExport(
    IReadOnlyDictionary<RaidLogKey, RaidLog> Logs,
    int LogCount,
    IReadOnlyDictionary<int, RaidItem> Items,
    DateTimeOffset? GeneratedAt = null,
    RaidScanChanges? Changes = null,
    bool OutOfDate = false
)
{
    public static readonly PreviousRaidExport Empty = new(
        new Dictionary<RaidLogKey, RaidLog>(),
        0,
        new Dictionary<int, RaidItem>()
    );
}

/// <summary>
/// Reads an earlier export back. Logs never change once written, so a later run only asks the
/// API for kills that are not in the boss files yet. Files of an older format are read as far as
/// they go (<see cref="PreviousRaidExport.OutOfDate"/>). Any file it cannot read, or one of a newer
/// format, makes it return nothing, and the run then reads every log again.
/// </summary>
public static class RaidLogFileReader
{
    public static PreviousRaidExport Read(string outputDirectory)
    {
        var indexPath = Path.Combine(outputDirectory, RaidLogFileWriter.IndexFileName);
        if (!File.Exists(indexPath))
        {
            return PreviousRaidExport.Empty;
        }

        try
        {
            using var index = JsonDocument.Parse(File.ReadAllBytes(indexPath));
            var root = index.RootElement;
            var oldestVersion = ReadVersion(root);
            if (oldestVersion is null)
            {
                return PreviousRaidExport.Empty;
            }

            var logs = new Dictionary<RaidLogKey, RaidLog>();
            foreach (var boss in RaidCatalog.Bosses)
            {
                foreach (var difficulty in RaidCatalog.Difficulties)
                {
                    var path = Path.Combine(
                        outputDirectory,
                        RaidCatalog.BossFileName(boss, difficulty)
                    );
                    if (!File.Exists(path))
                    {
                        continue;
                    }

                    using var file = JsonDocument.Parse(File.ReadAllBytes(path));
                    if (ReadVersion(file.RootElement) is not { } version)
                    {
                        return PreviousRaidExport.Empty;
                    }

                    oldestVersion = Math.Min(oldestVersion.Value, version);
                    foreach (var log in ReadEncounter(file.RootElement, boss, difficulty))
                    {
                        logs[log.Key] = log;
                    }
                }
            }

            var logCount = root.TryGetProperty("logs", out var indexLogs)
                ? indexLogs.GetArrayLength()
                : 0;
            return new PreviousRaidExport(
                logs,
                logCount,
                ReadItems(root),
                ReadTimestamp(root, "generatedAt"),
                ReadChanges(root),
                oldestVersion < RaidLogFileWriter.FormatVersion
            );
        }
        catch (Exception error)
            when (error
                    is JsonException
                        or IOException
                        or InvalidOperationException
                        or IndexOutOfRangeException
                        or KeyNotFoundException
            )
        {
            Console.Error.WriteLine(
                $"Could not read the previous raid log export ({error.Message}); reading every log again."
            );
            return PreviousRaidExport.Empty;
        }
    }

    public static IReadOnlyDictionary<int, RaidSpellTooltip> ReadTalentTooltips(
        string outputDirectory
    )
    {
        var path = Path.Combine(outputDirectory, RaidLogFileWriter.TalentTooltipsFileName);
        if (!File.Exists(path))
        {
            return new Dictionary<int, RaidSpellTooltip>();
        }

        try
        {
            using var file = JsonDocument.Parse(File.ReadAllBytes(path));
            var root = file.RootElement;
            if (
                !root.TryGetProperty("version", out var version)
                || !version.TryGetInt32(out var number)
                || number != RaidLogFileWriter.TalentTooltipsFormatVersion
            )
            {
                return new Dictionary<int, RaidSpellTooltip>();
            }

            return root.GetProperty("spells")
                .EnumerateArray()
                .Select(spell => new RaidSpellTooltip(
                    spell[0].GetInt32(),
                    [.. spell[1].EnumerateArray().Select(detail => detail.GetString()!)],
                    spell[2].GetString()!
                ))
                .ToDictionary(tooltip => tooltip.SpellId);
        }
        catch (Exception error)
            when (error
                    is JsonException
                        or IOException
                        or InvalidOperationException
                        or IndexOutOfRangeException
                        or KeyNotFoundException
                        or ArgumentException
            )
        {
            Console.Error.WriteLine(
                $"Could not read the previous talent tooltips ({error.Message}); looking every one up again."
            );
            return new Dictionary<int, RaidSpellTooltip>();
        }
    }

    /// <summary>The file's format version, or null for one this reader doesn't know.</summary>
    private static int? ReadVersion(JsonElement root) =>
        root.ValueKind == JsonValueKind.Object
        && root.TryGetProperty("version", out var version)
        && version.TryGetInt32(out var value)
        && value is >= 1 and <= RaidLogFileWriter.FormatVersion
            ? value
            : null;

    private static IEnumerable<RaidLog> ReadEncounter(
        JsonElement root,
        RaidBoss boss,
        RaidDifficulty difficulty
    )
    {
        var guilds = root.GetProperty("guilds")
            .EnumerateArray()
            .Select(guild => new RaidGuild(
                guild[3].GetInt32(),
                guild[0].GetString()!,
                guild[1].GetString()!,
                guild[2].GetInt32()
            ))
            .ToList();
        var players = root.GetProperty("players").EnumerateArray().Select(ReadPlayer).ToList();
        // Version 1 files have no trinkets.
        var trinkets = root.TryGetProperty("trinkets", out var trinketTable)
            ? trinketTable.EnumerateArray().Select(ReadTrinket).ToList()
            : [];

        foreach (var log in root.GetProperty("logs").EnumerateArray())
        {
            var guildPosition = log[4].GetInt32();
            yield return new RaidLog(
                new RaidLogKey(log[0].GetString()!, log[1].GetInt32()),
                boss.EncounterId,
                difficulty.Id,
                log[2].GetInt64(),
                log[3].GetInt64(),
                guildPosition >= 0 ? guilds[guildPosition] : null,
                log[5].GetInt32(),
                log[6].GetInt32(),
                log[7].GetInt32(),
                log[8].GetInt32(),
                [
                    .. log[9]
                        .EnumerateArray()
                        .Select(member => ReadMember(member, players, trinkets)),
                ],
                [.. log[10].EnumerateArray().Select(item => item.GetInt32())]
            );
        }
    }

    private static RaidPlayer ReadPlayer(JsonElement player) =>
        new(
            player[0].GetString()!,
            player[1].GetString()!,
            player[2].GetInt32(),
            player[3].GetInt32(),
            player[4].GetInt32(),
            player[5].GetString()!
        );

    private static RaidTrinket ReadTrinket(JsonElement trinket) =>
        new(
            trinket[0].GetInt32(),
            trinket[1].GetInt32(),
            trinket[2].GetString()!,
            trinket[3].GetInt32(),
            trinket[4].GetString()!
        );

    /// <summary>A version 1 member stops after its dispels: no talents, no trinkets.</summary>
    private static RaidLogMember ReadMember(
        JsonElement member,
        IReadOnlyList<RaidPlayer> players,
        IReadOnlyList<RaidTrinket> trinkets
    )
    {
        var player = players[member[0].GetInt32()];
        var hasLoadout = member.GetArrayLength() > 10;
        return new RaidLogMember(
            player.Name,
            player.Realm,
            player.ClassId,
            member[1].GetInt32(),
            player.Race,
            player.Gender,
            player.Guild,
            member[2].GetInt32(),
            member[3].GetInt64(),
            member[4].GetInt64(),
            member[5].GetInt64(),
            member[6].GetInt64(),
            member[7].GetInt64(),
            member[8].GetInt32(),
            member[9].GetInt32(),
            hasLoadout ? member[10].GetString()! : "",
            hasLoadout
                ? [.. member[11].EnumerateArray().Select(trinket => trinkets[trinket.GetInt32()])]
                : []
        );
    }

    private static DateTimeOffset? ReadTimestamp(JsonElement root, string propertyName) =>
        root.TryGetProperty(propertyName, out var value)
        && value.ValueKind == JsonValueKind.String
        && DateTimeOffset.TryParse(
            value.GetString(),
            CultureInfo.InvariantCulture,
            DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
            out var at
        )
            ? at
            : null;

    private static RaidScanChanges? ReadChanges(JsonElement root)
    {
        if (
            ReadTimestamp(root, "previousGeneratedAt") is not { } previousGeneratedAt
            || !root.TryGetProperty("newLogs", out var newLogs)
            || newLogs.ValueKind != JsonValueKind.Array
        )
        {
            return null;
        }

        return new RaidScanChanges(
            previousGeneratedAt,
            [
                .. newLogs
                    .EnumerateArray()
                    .Select(key => new RaidLogKey(key[0].GetString()!, key[1].GetInt32())),
            ]
        );
    }

    private static Dictionary<int, RaidItem> ReadItems(JsonElement root)
    {
        if (!root.TryGetProperty("items", out var items) || items.ValueKind != JsonValueKind.Array)
        {
            return [];
        }

        return items
            .EnumerateArray()
            .Select(item => new RaidItem(
                item[0].GetInt32(),
                item[1].GetString()!,
                item[2].GetInt32(),
                item[3].GetString()!
            ))
            .ToDictionary(item => item.Id);
    }
}
