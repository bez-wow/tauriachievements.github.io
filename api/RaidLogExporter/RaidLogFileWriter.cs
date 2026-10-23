using System.Globalization;
using System.Text.Encodings.Web;
using System.Text.Json;
using Tauri.Core.Infrastructure;

namespace RaidLogExporter;

public static class RaidLogFileWriter
{
    public const int FormatVersion = 3;
    public const string IndexFileName = "index.json";
    public const string TalentsFileName = "talents.json";
    public const string TalentTooltipsFileName = "talent-tooltips.json";
    public const int TalentTooltipsFormatVersion = 1;

    /// <summary>The export's folder under spa/src.</summary>
    public const string DataDirectoryName = "raid-log-data";

    private static readonly JsonWriterOptions WriterOptions = new()
    {
        // Character and guild names are often Cyrillic or accented; keep them readable.
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    public static async Task WriteAsync(
        string outputDirectory,
        RaidDataset dataset,
        DateTimeOffset generatedAt,
        RaidScanChanges? changes,
        IReadOnlyList<RaidSpecTalents>? talents,
        IReadOnlyList<RaidSpellTooltip>? tooltips,
        CancellationToken cancellationToken
    )
    {
        Directory.CreateDirectory(outputDirectory);

        if (talents is not null)
        {
            await AtomicFile.WriteAsync(
                Path.Combine(outputDirectory, TalentsFileName),
                (stream, token) => WriteTalentsAsync(stream, talents, token),
                cancellationToken
            );
        }

        if (tooltips is not null)
        {
            await AtomicFile.WriteAsync(
                Path.Combine(outputDirectory, TalentTooltipsFileName),
                (stream, token) => WriteTalentTooltipsAsync(stream, tooltips, token),
                cancellationToken
            );
        }

        // Boss files first and the index last: the index is what makes new kills visible.
        foreach (var encounter in dataset.Encounters.Where(encounter => encounter.Logs.Count > 0))
        {
            await AtomicFile.WriteAsync(
                Path.Combine(
                    outputDirectory,
                    RaidCatalog.BossFileName(encounter.Boss, encounter.Difficulty)
                ),
                (stream, token) => WriteEncounterAsync(stream, encounter, token),
                cancellationToken
            );
        }

        await AtomicFile.WriteAsync(
            Path.Combine(outputDirectory, IndexFileName),
            (stream, token) => WriteIndexAsync(stream, dataset, generatedAt, changes, token),
            cancellationToken
        );

        RemoveStaleFiles(outputDirectory, dataset);
    }

    private static async Task WriteIndexAsync(
        Stream stream,
        RaidDataset dataset,
        DateTimeOffset generatedAt,
        RaidScanChanges? changes,
        CancellationToken cancellationToken
    )
    {
        await using var writer = new Utf8JsonWriter(stream, WriterOptions);
        var line = new JsonLineWriter(WriterOptions);
        var bossPositions = RaidCatalog
            .Bosses.Select((boss, index) => (boss.EncounterId, index))
            .ToDictionary(entry => entry.EncounterId, entry => entry.index);
        var guildPositions = Positions(dataset.Guilds);

        writer.WriteStartObject();
        writer.WriteNumber("version", FormatVersion);
        writer.WriteString("generatedAt", FormatTimestamp(generatedAt));
        if (changes is not null)
        {
            writer.WriteString("previousGeneratedAt", FormatTimestamp(changes.PreviousGeneratedAt));
        }

        writer.WriteStartObject("raid");
        writer.WriteNumber("id", RaidCatalog.MapId);
        writer.WriteString("slug", RaidCatalog.Slug);
        writer.WriteString("name", RaidCatalog.Name);
        writer.WriteEndObject();

        writer.WriteStartArray("difficulties");
        foreach (var difficulty in RaidCatalog.Difficulties)
        {
            var kills = dataset.Logs.Count(log => log.DifficultyId == difficulty.Id);
            line.WriteTo(
                writer,
                item =>
                {
                    item.WriteStartObject();
                    item.WriteNumber("id", difficulty.Id);
                    item.WriteString("slug", difficulty.Slug);
                    item.WriteString("name", difficulty.Name);
                    item.WriteString("shortName", difficulty.ShortName);
                    item.WriteNumber("kills", kills);
                    item.WriteEndObject();
                }
            );
        }
        writer.WriteEndArray();

        writer.WriteStartArray("bosses");
        foreach (var boss in RaidCatalog.Bosses)
        {
            line.WriteTo(
                writer,
                item =>
                {
                    item.WriteStartObject();
                    item.WriteNumber("id", boss.EncounterId);
                    item.WriteString("slug", boss.Slug);
                    item.WriteString("name", boss.Name);
                    item.WriteEndObject();
                }
            );
        }
        writer.WriteEndArray();

        writer.WriteStartArray("specs");
        foreach (var spec in RaidCatalog.Specs)
        {
            line.WriteTo(
                writer,
                item =>
                {
                    item.WriteStartObject();
                    item.WriteNumber("id", spec.Id);
                    item.WriteNumber("class", spec.ClassId);
                    item.WriteString("name", spec.Name);
                    item.WriteString("role", spec.Role);
                    item.WriteEndObject();
                }
            );
        }
        writer.WriteEndArray();

        WriteGuilds(writer, line, dataset.Guilds);

        writer.WriteStartArray("formerCharacters");
        foreach (var character in dataset.FormerCharacters)
        {
            line.WriteTo(
                writer,
                item =>
                {
                    item.WriteStartArray();
                    item.WriteStringValue(character.Name);
                    item.WriteStringValue(character.Realm);
                    item.WriteNumberValue(character.ClassId);
                    item.WriteStartArray();
                    foreach (var classId in character.FormerClassIds)
                    {
                        item.WriteNumberValue(classId);
                    }
                    item.WriteEndArray();
                    item.WriteEndArray();
                }
            );
        }
        writer.WriteEndArray();

        writer.WriteStartArray("logs");
        foreach (var log in dataset.Logs)
        {
            line.WriteTo(
                writer,
                item =>
                {
                    item.WriteStartArray();
                    item.WriteStringValue(log.Key.Realm);
                    item.WriteNumberValue(log.Key.LogId);
                    item.WriteNumberValue(bossPositions[log.EncounterId]);
                    item.WriteNumberValue(log.DifficultyId);
                    item.WriteNumberValue(log.KilledAt);
                    item.WriteNumberValue(log.FightMilliseconds);
                    item.WriteNumberValue(GuildPosition(guildPositions, log.Guild));
                    item.WriteNumberValue(log.Faction);
                    item.WriteNumberValue(log.Wipes);
                    item.WriteNumberValue(log.Deaths);
                    item.WriteNumberValue(log.Members.Count);
                    item.WriteEndArray();
                }
            );
            await JsonLineWriter.FlushIfLargeAsync(writer, cancellationToken);
        }
        writer.WriteEndArray();

        if (changes is not null)
        {
            writer.WriteStartArray("newLogs");
            foreach (var key in changes.NewLogs)
            {
                line.WriteTo(
                    writer,
                    item =>
                    {
                        item.WriteStartArray();
                        item.WriteStringValue(key.Realm);
                        item.WriteNumberValue(key.LogId);
                        item.WriteEndArray();
                    }
                );
            }
            writer.WriteEndArray();
        }

        writer.WriteStartArray("top");
        foreach (var encounter in dataset.Encounters.Where(encounter => encounter.Logs.Count > 0))
        {
            line.WriteTo(
                writer,
                item =>
                {
                    item.WriteStartObject();
                    item.WriteString("boss", encounter.Boss.Slug);
                    item.WriteString("difficulty", encounter.Difficulty.Slug);
                    WritePerformer(item, "dps", encounter.TopDps);
                    WritePerformer(item, "hps", encounter.TopHps);
                    item.WriteEndObject();
                }
            );
        }
        writer.WriteEndArray();

        writer.WriteStartArray("items");
        foreach (var raidItem in dataset.Items)
        {
            line.WriteTo(
                writer,
                item =>
                {
                    item.WriteStartArray();
                    item.WriteNumberValue(raidItem.Id);
                    item.WriteStringValue(raidItem.Name);
                    item.WriteNumberValue(raidItem.Quality);
                    item.WriteStringValue(raidItem.Icon);
                    item.WriteEndArray();
                }
            );
        }
        writer.WriteEndArray();

        writer.WriteEndObject();
        await writer.FlushAsync(cancellationToken);
    }

    private static async Task WriteEncounterAsync(
        Stream stream,
        RaidEncounter encounter,
        CancellationToken cancellationToken
    )
    {
        await using var writer = new Utf8JsonWriter(stream, WriterOptions);
        var line = new JsonLineWriter(WriterOptions);
        var guildPositions = Positions(encounter.Guilds);
        var playerPositions = encounter
            .Players.Select((player, index) => (player, index))
            .ToDictionary(
                entry => (entry.player.Realm, entry.player.Name, entry.player.ClassId),
                entry => entry.index
            );
        var trinketPositions = encounter
            .Trinkets.Select((trinket, index) => (trinket, index))
            .ToDictionary(
                entry => (entry.trinket.Id, entry.trinket.ItemLevel),
                entry => entry.index
            );

        writer.WriteStartObject();
        writer.WriteNumber("version", FormatVersion);
        writer.WriteString("boss", encounter.Boss.Slug);
        writer.WriteString("difficulty", encounter.Difficulty.Slug);

        WriteGuilds(writer, line, encounter.Guilds);

        writer.WriteStartArray("players");
        foreach (var player in encounter.Players)
        {
            line.WriteTo(
                writer,
                item =>
                {
                    item.WriteStartArray();
                    item.WriteStringValue(player.Name);
                    item.WriteStringValue(player.Realm);
                    item.WriteNumberValue(player.ClassId);
                    item.WriteNumberValue(player.Race);
                    item.WriteNumberValue(player.Gender);
                    item.WriteStringValue(player.Guild);
                    if (player.Former)
                    {
                        item.WriteNumberValue(1);
                    }
                    item.WriteEndArray();
                }
            );
            await JsonLineWriter.FlushIfLargeAsync(writer, cancellationToken);
        }
        writer.WriteEndArray();

        writer.WriteStartArray("trinkets");
        foreach (var trinket in encounter.Trinkets)
        {
            line.WriteTo(
                writer,
                item =>
                {
                    item.WriteStartArray();
                    item.WriteNumberValue(trinket.Id);
                    item.WriteNumberValue(trinket.ItemLevel);
                    item.WriteStringValue(trinket.Name);
                    item.WriteNumberValue(trinket.Quality);
                    item.WriteStringValue(trinket.Icon);
                    item.WriteEndArray();
                }
            );
        }
        writer.WriteEndArray();

        writer.WriteStartArray("logs");
        foreach (var log in encounter.Logs)
        {
            line.WriteTo(
                writer,
                item =>
                {
                    item.WriteStartArray();
                    item.WriteStringValue(log.Key.Realm);
                    item.WriteNumberValue(log.Key.LogId);
                    item.WriteNumberValue(log.KilledAt);
                    item.WriteNumberValue(log.FightMilliseconds);
                    item.WriteNumberValue(GuildPosition(guildPositions, log.Guild));
                    item.WriteNumberValue(log.Faction);
                    item.WriteNumberValue(log.Wipes);
                    item.WriteNumberValue(log.Deaths);
                    item.WriteNumberValue(log.Resurrects);

                    item.WriteStartArray();
                    foreach (var member in log.Members)
                    {
                        item.WriteStartArray();
                        item.WriteNumberValue(
                            playerPositions[(member.Realm, member.Name, member.ClassId)]
                        );
                        item.WriteNumberValue(member.SpecId);
                        item.WriteNumberValue(member.ItemLevel);
                        item.WriteNumberValue(member.DamageDone);
                        item.WriteNumberValue(member.HealingDone);
                        item.WriteNumberValue(member.AbsorbDone);
                        item.WriteNumberValue(member.Overhealing);
                        item.WriteNumberValue(member.DamageTaken);
                        item.WriteNumberValue(member.Interrupts);
                        item.WriteNumberValue(member.Dispels);
                        item.WriteStringValue(member.Talents);
                        item.WriteStartArray();
                        foreach (var trinket in member.Trinkets)
                        {
                            item.WriteNumberValue(
                                trinketPositions[(trinket.Id, trinket.ItemLevel)]
                            );
                        }
                        item.WriteEndArray();
                        item.WriteEndArray();
                    }
                    item.WriteEndArray();

                    item.WriteStartArray();
                    foreach (var itemId in log.Items)
                    {
                        item.WriteNumberValue(itemId);
                    }
                    item.WriteEndArray();

                    item.WriteEndArray();
                }
            );
            await JsonLineWriter.FlushIfLargeAsync(writer, cancellationToken);
        }
        writer.WriteEndArray();

        writer.WriteEndObject();
        await writer.FlushAsync(cancellationToken);
    }

    private static async Task WriteTalentsAsync(
        Stream stream,
        IReadOnlyList<RaidSpecTalents> talents,
        CancellationToken cancellationToken
    )
    {
        await using var writer = new Utf8JsonWriter(stream, WriterOptions);
        var line = new JsonLineWriter(WriterOptions);

        writer.WriteStartObject();
        writer.WriteNumber("version", FormatVersion);
        writer.WriteStartArray("specs");
        foreach (var spec in talents)
        {
            line.WriteTo(
                writer,
                item =>
                {
                    item.WriteStartArray();
                    item.WriteNumberValue(spec.SpecId);
                    item.WriteStartArray();
                    foreach (var tier in spec.Tiers)
                    {
                        item.WriteStartArray();
                        foreach (var talent in tier)
                        {
                            if (talent is null)
                            {
                                item.WriteNullValue();
                                continue;
                            }

                            item.WriteStartArray();
                            item.WriteNumberValue(talent.SpellId);
                            item.WriteStringValue(talent.Name);
                            item.WriteStringValue(talent.Icon);
                            item.WriteEndArray();
                        }
                        item.WriteEndArray();
                    }
                    item.WriteEndArray();
                    item.WriteEndArray();
                }
            );
        }
        writer.WriteEndArray();
        writer.WriteEndObject();
        await writer.FlushAsync(cancellationToken);
    }

    private static async Task WriteTalentTooltipsAsync(
        Stream stream,
        IReadOnlyList<RaidSpellTooltip> tooltips,
        CancellationToken cancellationToken
    )
    {
        await using var writer = new Utf8JsonWriter(stream, WriterOptions);
        var line = new JsonLineWriter(WriterOptions);

        writer.WriteStartObject();
        writer.WriteNumber("version", TalentTooltipsFormatVersion);
        writer.WriteStartArray("spells");
        foreach (var tooltip in tooltips)
        {
            line.WriteTo(
                writer,
                item =>
                {
                    item.WriteStartArray();
                    item.WriteNumberValue(tooltip.SpellId);
                    item.WriteStartArray();
                    foreach (var detail in tooltip.Details)
                    {
                        item.WriteStringValue(detail);
                    }
                    item.WriteEndArray();
                    item.WriteStringValue(tooltip.Description);
                    item.WriteEndArray();
                }
            );
        }
        writer.WriteEndArray();
        writer.WriteEndObject();
        await writer.FlushAsync(cancellationToken);
    }

    private static void WriteGuilds(
        Utf8JsonWriter writer,
        JsonLineWriter line,
        IReadOnlyList<RaidGuild> guilds
    )
    {
        writer.WriteStartArray("guilds");
        foreach (var guild in guilds)
        {
            line.WriteTo(
                writer,
                item =>
                {
                    item.WriteStartArray();
                    item.WriteStringValue(guild.Name);
                    item.WriteStringValue(guild.Realm);
                    item.WriteNumberValue(guild.Faction);
                    item.WriteNumberValue(guild.Id);
                    item.WriteEndArray();
                }
            );
        }
        writer.WriteEndArray();
    }

    private static void WritePerformer(
        Utf8JsonWriter writer,
        string propertyName,
        RaidTopPerformer? performer
    )
    {
        if (performer is null)
        {
            writer.WriteNull(propertyName);
            return;
        }

        writer.WriteStartArray(propertyName);
        writer.WriteStringValue(performer.Name);
        writer.WriteStringValue(performer.Realm);
        writer.WriteNumberValue(performer.ClassId);
        writer.WriteNumberValue(performer.SpecId);
        writer.WriteNumberValue(performer.Value);
        writer.WriteStringValue(performer.Log.Realm);
        writer.WriteNumberValue(performer.Log.LogId);
        writer.WriteEndArray();
    }

    /// <summary>UTC ISO 8601, to the second.</summary>
    private static string FormatTimestamp(DateTimeOffset at) =>
        at.UtcDateTime.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture);

    private static Dictionary<(string Realm, int Id), int> Positions(
        IReadOnlyList<RaidGuild> guilds
    ) =>
        guilds
            .Select((guild, index) => (guild, index))
            .ToDictionary(entry => (entry.guild.Realm, entry.guild.Id), entry => entry.index);

    private static int GuildPosition(
        IReadOnlyDictionary<(string Realm, int Id), int> positions,
        RaidGuild? guild
    ) => guild is null ? -1 : positions[(guild.Realm, guild.Id)];

    private static void RemoveStaleFiles(string outputDirectory, RaidDataset dataset)
    {
        var expected = dataset
            .Encounters.Where(encounter => encounter.Logs.Count > 0)
            .Select(encounter => RaidCatalog.BossFileName(encounter.Boss, encounter.Difficulty))
            .Append(IndexFileName)
            .Append(TalentsFileName)
            .Append(TalentTooltipsFileName)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        foreach (var path in Directory.EnumerateFiles(outputDirectory, "*.json"))
        {
            if (!expected.Contains(Path.GetFileName(path)))
            {
                File.Delete(path);
            }
        }
    }
}
