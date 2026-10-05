using System.Buffers;
using System.Text.Encodings.Web;
using System.Text.Json;
using Tauri.Core.Infrastructure;

namespace MythicPlusExporter;

/// <summary>
/// Writes the files the /mythic-plus page reads (contract: spa/src/app/mythic-plus.ts).
/// <para>
/// <c>index.json</c> holds the season, dungeons, affixes and the shared lookup tables:
/// <c>specs</c> as objects, <c>players</c> as <c>[name, realm, guild, class, race, gender]</c>.
/// </para>
/// <para>
/// <c>&lt;dungeon&gt;.json</c> holds that dungeon's runs, best first, as
/// <c>[keyLevel, clearTimeMs, completedAtUnixSeconds, score, [affixIds], [[player, spec], ...]]</c>
/// where player and spec are positions in the index tables. Sharing the tables keeps a
/// dungeon file to its runs; a character plays many dungeons.
/// </para>
/// Every entry goes on its own line so git can store the daily changes as small deltas.
/// </summary>
public static class MythicPlusFileWriter
{
    public const int FormatVersion = 1;
    public const string IndexFileName = "index.json";

    private static readonly JsonWriterOptions WriterOptions = new()
    {
        // Character and guild names are often Cyrillic or accented; keep them readable.
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    public static async Task WriteAsync(
        string outputDirectory,
        MythicPlusDataset dataset,
        CancellationToken cancellationToken
    )
    {
        Directory.CreateDirectory(outputDirectory);

        var playerIndexes = dataset
            .Players.Select((player, index) => (player, index))
            .ToDictionary(entry => (entry.player.Realm, entry.player.Name), entry => entry.index);
        var specIndexes = dataset
            .Specs.Select((spec, index) => (spec, index))
            .ToDictionary(entry => entry.spec, entry => entry.index);

        // Dungeon files first and the index last: the index is what makes new dungeons visible.
        foreach (var dungeon in dataset.Dungeons)
        {
            await AtomicFile.WriteAsync(
                Path.Combine(outputDirectory, dungeon.Info.Slug + ".json"),
                (stream, token) =>
                    WriteDungeonAsync(stream, dungeon, playerIndexes, specIndexes, token),
                cancellationToken
            );
        }

        await AtomicFile.WriteAsync(
            Path.Combine(outputDirectory, IndexFileName),
            (stream, token) => WriteIndexAsync(stream, dataset, token),
            cancellationToken
        );

        RemoveStaleFiles(outputDirectory, dataset);
    }

    private static async Task WriteIndexAsync(
        Stream stream,
        MythicPlusDataset dataset,
        CancellationToken cancellationToken
    )
    {
        var season = MythicPlusCatalog.Season;
        await using var writer = new Utf8JsonWriter(stream, WriterOptions);
        var line = new LineWriter();

        writer.WriteStartObject();
        writer.WriteNumber("version", FormatVersion);
        writer.WriteStartObject("season");
        writer.WriteString("id", season.Id);
        writer.WriteString("name", season.Name);
        writer.WriteString("raid", season.Raid);
        writer.WriteString("startDate", season.StartDate);
        writer.WriteEndObject();

        writer.WriteStartArray("dungeons");
        foreach (var dungeon in dataset.Dungeons)
        {
            line.WriteTo(
                writer,
                item =>
                {
                    item.WriteStartObject();
                    item.WriteString("id", dungeon.Info.Slug);
                    item.WriteNumber("challengeId", dungeon.Map.ChallengeId);
                    item.WriteString("shortName", dungeon.Info.ShortName);
                    item.WriteString("name", dungeon.Map.Name);
                    item.WriteNumber("timerSeconds", dungeon.Map.TimerSeconds);
                    item.WriteString(
                        "icon",
                        MythicPlusCatalog.IconUrl(dataset.DataUrlPrefix, dungeon.Info.IconName)
                    );
                    item.WriteNumber("runCount", dungeon.Runs.Count);
                    item.WriteNumber("bestScore", dungeon.BestScore);
                    item.WriteEndObject();
                }
            );
        }
        writer.WriteEndArray();

        writer.WriteStartArray("affixes");
        foreach (var affix in dataset.Affixes)
        {
            line.WriteTo(
                writer,
                item =>
                {
                    item.WriteStartObject();
                    item.WriteNumber("id", affix.Id);
                    item.WriteString("name", affix.Name);
                    item.WriteNumber("level", affix.Level);
                    item.WriteString(
                        "icon",
                        MythicPlusCatalog.IconUrl(dataset.DataUrlPrefix, affix.Icon)
                    );
                    item.WriteString("description", affix.Description);
                    item.WriteEndObject();
                }
            );
        }
        writer.WriteEndArray();

        writer.WriteStartArray("specs");
        foreach (var spec in dataset.Specs)
        {
            line.WriteTo(
                writer,
                item =>
                {
                    item.WriteStartObject();
                    item.WriteNumber("class", spec.ClassId);
                    item.WriteString("name", spec.Name);
                    item.WriteString("role", spec.Role);
                    item.WriteEndObject();
                }
            );
        }
        writer.WriteEndArray();

        writer.WriteStartArray("players");
        foreach (var player in dataset.Players)
        {
            line.WriteTo(
                writer,
                item =>
                {
                    item.WriteStartArray();
                    item.WriteStringValue(player.Name);
                    item.WriteStringValue(player.Realm);
                    item.WriteStringValue(player.Guild);
                    item.WriteNumberValue(player.ClassId);
                    item.WriteNumberValue(player.Race);
                    item.WriteNumberValue(player.Gender);
                    item.WriteEndArray();
                }
            );
            await FlushIfLargeAsync(writer, cancellationToken);
        }
        writer.WriteEndArray();

        writer.WriteEndObject();
        await writer.FlushAsync(cancellationToken);
    }

    private static async Task WriteDungeonAsync(
        Stream stream,
        MythicPlusDungeon dungeon,
        IReadOnlyDictionary<(string Realm, string Name), int> playerIndexes,
        IReadOnlyDictionary<MythicPlusSpec, int> specIndexes,
        CancellationToken cancellationToken
    )
    {
        await using var writer = new Utf8JsonWriter(stream, WriterOptions);
        var line = new LineWriter();

        writer.WriteStartObject();
        writer.WriteNumber("version", FormatVersion);
        writer.WriteString("dungeon", dungeon.Info.Slug);
        writer.WriteStartArray("runs");

        foreach (var (run, score) in dungeon.Runs)
        {
            line.WriteTo(
                writer,
                item =>
                {
                    item.WriteStartArray();
                    item.WriteNumberValue(run.KeyLevel);
                    item.WriteNumberValue(run.ClearTimeMilliseconds);
                    item.WriteNumberValue(run.CompletedAt);
                    item.WriteNumberValue(score);

                    item.WriteStartArray();
                    foreach (var affix in run.Affixes)
                    {
                        item.WriteNumberValue(affix.Id);
                    }
                    item.WriteEndArray();

                    item.WriteStartArray();
                    foreach (var member in run.Members)
                    {
                        item.WriteStartArray();
                        item.WriteNumberValue(playerIndexes[(member.Realm, member.Name)]);
                        item.WriteNumberValue(
                            specIndexes[
                                new MythicPlusSpec(member.ClassId, member.SpecName, member.Role)
                            ]
                        );
                        item.WriteEndArray();
                    }
                    item.WriteEndArray();

                    item.WriteEndArray();
                }
            );
            await FlushIfLargeAsync(writer, cancellationToken);
        }

        writer.WriteEndArray();
        writer.WriteEndObject();
        await writer.FlushAsync(cancellationToken);
    }

    /// <summary>Removes dungeon files from an earlier run whose dungeon is no longer listed.</summary>
    private static void RemoveStaleFiles(string outputDirectory, MythicPlusDataset dataset)
    {
        var expected = dataset
            .Dungeons.Select(dungeon => dungeon.Info.Slug + ".json")
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

    private static async Task FlushIfLargeAsync(
        Utf8JsonWriter writer,
        CancellationToken cancellationToken
    )
    {
        if (writer.BytesPending > 64 * 1024)
        {
            await writer.FlushAsync(cancellationToken);
        }
    }

    /// <summary>
    /// Writes one array element on a line of its own. The element is rendered by a scratch
    /// writer and handed over as a raw value, so the outer writer still places the commas.
    /// </summary>
    private sealed class LineWriter
    {
        private static readonly byte[] NewLine = "\n"u8.ToArray();

        private readonly ArrayBufferWriter<byte> _buffer = new();
        private readonly Utf8JsonWriter _itemWriter;

        public LineWriter()
        {
            _itemWriter = new Utf8JsonWriter(_buffer, WriterOptions);
        }

        public void WriteTo(Utf8JsonWriter writer, Action<Utf8JsonWriter> writeItem)
        {
            _buffer.ResetWrittenCount();
            _buffer.Write(NewLine);
            _itemWriter.Reset(_buffer);
            writeItem(_itemWriter);
            _itemWriter.Flush();
            writer.WriteRawValue(_buffer.WrittenSpan, skipInputValidation: true);
        }
    }
}
