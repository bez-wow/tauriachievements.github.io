using System.Globalization;
using System.Text.Encodings.Web;
using System.Text.Json;
using Tauri.Core.Infrastructure;

namespace RaidLogExporter;

/// <summary>
/// Writes the files the /raid-logs pages read (contract: spa/src/app/raid-logs.ts).
/// <para>
/// <c>index.json</c> holds when the rankings were read (<c>generatedAt</c>, UTC ISO 8601), the raid,
/// its difficulties (with kill counts) and bosses, the spec table, every kill as
/// <c>[realm, logId, boss, difficultyId, killedAtUnix, fightMs, guild, faction, wipes, deaths, members]</c>
/// (boss and guild are positions in <c>bosses</c> and <c>guilds</c>, guild -1 for a pickup group),
/// <c>guilds</c> as <c>[name, realm, faction, guildId]</c> (an empty name for a guild that could
/// not be named), each boss and difficulty's best DPS and HPS as
/// <c>[name, realm, class, spec, perSecond, logRealm, logId]</c>, and the loot's
/// <c>items</c> as <c>[id, name, quality, icon]</c>.
/// </para>
/// <para>
/// <c>&lt;boss&gt;-&lt;difficulty&gt;.json</c> holds that boss's kills on that difficulty, oldest
/// first, as <c>[realm, logId, killedAtUnix, fightMs, guild, faction, wipes, deaths, resurrects,
/// [[player, spec, ilvl, damage, healing, absorbs, overhealing, damageTaken, interrupts, dispels], ...],
/// [itemId, ...]]</c>, with its own <c>guilds</c> (as in the index) and
/// <c>players</c> (<c>[name, realm, class, race, gender, guild]</c>) tables. A boss file needs
/// nothing from the index, so a page that loaded the index before a deploy can still read a newer
/// boss file. A difficulty without kills has no file.
/// </para>
/// Every entry goes on its own line, and the tables grow in order of first appearance, so a
/// new kill is a few added lines in git.
/// </summary>
public static class RaidLogFileWriter
{
    public const int FormatVersion = 1;
    public const string IndexFileName = "index.json";

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
        CancellationToken cancellationToken
    )
    {
        Directory.CreateDirectory(outputDirectory);

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
            (stream, token) => WriteIndexAsync(stream, dataset, generatedAt, token),
            cancellationToken
        );

        RemoveStaleFiles(outputDirectory, dataset);
    }

    private static async Task WriteIndexAsync(
        Stream stream,
        RaidDataset dataset,
        DateTimeOffset generatedAt,
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
        writer.WriteString(
            "generatedAt",
            generatedAt.UtcDateTime.ToString(
                "yyyy-MM-dd'T'HH:mm:ss'Z'",
                CultureInfo.InvariantCulture
            )
        );

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
            .ToDictionary(entry => (entry.player.Realm, entry.player.Name), entry => entry.index);

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
                    item.WriteEndArray();
                }
            );
            await JsonLineWriter.FlushIfLargeAsync(writer, cancellationToken);
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
                        item.WriteNumberValue(playerPositions[(member.Realm, member.Name)]);
                        item.WriteNumberValue(member.SpecId);
                        item.WriteNumberValue(member.ItemLevel);
                        item.WriteNumberValue(member.DamageDone);
                        item.WriteNumberValue(member.HealingDone);
                        item.WriteNumberValue(member.AbsorbDone);
                        item.WriteNumberValue(member.Overhealing);
                        item.WriteNumberValue(member.DamageTaken);
                        item.WriteNumberValue(member.Interrupts);
                        item.WriteNumberValue(member.Dispels);
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

    /// <summary>Removes files from an earlier run that this run did not write.</summary>
    private static void RemoveStaleFiles(string outputDirectory, RaidDataset dataset)
    {
        var expected = dataset
            .Encounters.Where(encounter => encounter.Logs.Count > 0)
            .Select(encounter => RaidCatalog.BossFileName(encounter.Boss, encounter.Difficulty))
            .Append(IndexFileName)
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
