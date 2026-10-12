using Tauri.Core.Infrastructure;

namespace RaidLogExporter;

/// <summary>
/// Each character's current guild from the ladder's Players.csv. Logs only name the guild of
/// members with an armory link, so without this every Evermoon raider would look guildless.
/// </summary>
public sealed class PlayerGuildDirectory
{
    public static readonly PlayerGuildDirectory Empty = new([]);

    private readonly Dictionary<(string Realm, string Name), string> _guilds;

    public PlayerGuildDirectory(Dictionary<(string Realm, string Name), string> guilds)
    {
        _guilds = guilds;
    }

    public int Count => _guilds.Count;

    public string? Find(string realm, string name) =>
        _guilds.TryGetValue((realm, name), out var guild) ? guild : null;

    /// <summary>Reads Players.csv; a missing or unreadable file gives an empty directory.</summary>
    public static PlayerGuildDirectory Load(string playersCsvPath)
    {
        if (!File.Exists(playersCsvPath))
        {
            return Empty;
        }

        using var reader = new StreamReader(playersCsvPath);
        var headerLine = reader.ReadLine();
        if (headerLine is null)
        {
            return Empty;
        }

        var header = PlayerCsvFormat.ParseLine(headerLine);
        var nameColumn = PlayerCsvFormat.FindColumnIndex(header, "Name");
        var realmColumn = PlayerCsvFormat.FindColumnIndex(header, "Realm");
        var guildColumn = PlayerCsvFormat.FindColumnIndex(header, "Guild");
        if (nameColumn < 0 || realmColumn < 0 || guildColumn < 0)
        {
            return Empty;
        }

        var lastColumn = Math.Max(nameColumn, Math.Max(realmColumn, guildColumn));
        var guilds = new Dictionary<(string Realm, string Name), string>();
        while (reader.ReadLine() is { } line)
        {
            var fields = PlayerCsvFormat.ParseLine(line);
            if (fields.Count <= lastColumn)
            {
                continue;
            }

            var guild = fields[guildColumn].Trim();
            if (guild.Length > 0)
            {
                guilds[(fields[realmColumn].Trim(), fields[nameColumn].Trim())] = guild;
            }
        }

        return new PlayerGuildDirectory(guilds);
    }
}
