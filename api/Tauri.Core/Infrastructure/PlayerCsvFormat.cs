using System.Globalization;
using System.Text;
using Tauri.Core.Models;

namespace Tauri.Core.Infrastructure;

/// <summary>
/// The one definition of the Players.csv layout. Every job that writes or reads the file goes
/// through here, so the header and the rows cannot drift apart. The frontend build
/// (spa/scripts/player-data-utils.js) reads the columns by name.
/// </summary>
public static class PlayerCsvFormat
{
    public const string Level10DateFormat = "yyyy-MM-dd";

    private static readonly string[] Columns =
    [
        "Name",
        "Race",
        "Gender",
        "Class",
        "Level",
        "Realm",
        "Guild",
        "AchievementPoints",
        "HonorableKills",
        "Faction",
        "AppearanceCount",
        "Level10Date",
        "PlayedTime",
        "AchievementsTotal",
        "ilvl",
    ];

    public static string Header { get; } = string.Join(",", Columns.Select(Quote));

    public static string FormatRow(Player player)
    {
        ArgumentNullException.ThrowIfNull(player);

        return string.Join(
            ",",
            Quote(player.Name),
            Format(player.Race),
            Format(player.Gender),
            Format(player.Class),
            Format(player.Level),
            Quote(player.Realm),
            Quote(player.Guild),
            Format(player.AchievementPoints),
            Format(player.HonorableKills),
            Quote(player.Faction),
            Format(player.AppearanceCount),
            Quote(player.Level10Date?.ToString(Level10DateFormat, CultureInfo.InvariantCulture)),
            player.PlayedTime.ToString(CultureInfo.InvariantCulture),
            Format(player.AchievementsTotal),
            player.ItemLevel?.ToString(CultureInfo.InvariantCulture) ?? string.Empty
        );
    }

    /// <summary>Splits one CSV line, honouring quoted fields and doubled quotes.</summary>
    public static List<string> ParseLine(string line)
    {
        ArgumentNullException.ThrowIfNull(line);

        var values = new List<string>();
        var current = new StringBuilder();
        var inQuotes = false;

        for (var i = 0; i < line.Length; i++)
        {
            var character = line[i];

            if (character == '"')
            {
                if (inQuotes && i + 1 < line.Length && line[i + 1] == '"')
                {
                    current.Append('"');
                    i++;
                    continue;
                }

                inQuotes = !inQuotes;
                continue;
            }

            if (character == ',' && !inQuotes)
            {
                values.Add(current.ToString());
                current.Clear();
                continue;
            }

            current.Append(character);
        }

        values.Add(current.ToString());
        return values;
    }

    public static int FindColumnIndex(IReadOnlyList<string> header, string columnName)
    {
        for (var i = 0; i < header.Count; i++)
        {
            if (string.Equals(header[i], columnName, StringComparison.OrdinalIgnoreCase))
            {
                return i;
            }
        }

        return -1;
    }

    private static string Quote(string? value) =>
        $"\"{(value ?? string.Empty).Replace("\"", "\"\"")}\"";

    private static string Format(int value) => value.ToString(CultureInfo.InvariantCulture);
}
