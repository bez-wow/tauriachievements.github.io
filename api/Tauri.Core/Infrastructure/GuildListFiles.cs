using System.Text;
using Tauri.Core.Helpers;

namespace Tauri.Core.Infrastructure;

/// <param name="Realm">An API realm name ("[EN] Evermoon") or a display name ("Evermoon").</param>
/// <param name="Guild">Empty when the character has no guild.</param>
public sealed record SeenCharacter(string Name, string Realm, string Guild);

/// <summary>
/// Grows the scan inputs from characters seen elsewhere (battlegrounds, Mythic+ runs): new
/// guild names go to the realm's guild list, guildless characters to guildless-characters.txt.
/// Both files are only appended to, and names already listed (ignoring case) are skipped.
/// </summary>
public static class GuildListFiles
{
    private static readonly UTF8Encoding Utf8NoBom = new(encoderShouldEmitUTF8Identifier: false);

    private static readonly Dictionary<string, string> GuildFileByDisplayRealm = new(
        StringComparer.OrdinalIgnoreCase
    )
    {
        ["Evermoon"] = "evermoon-guilds.txt",
        ["Tauri"] = "tauri-guilds.txt",
        ["WoD"] = "wod-guilds.txt",
    };

    public static string GetGuildsDirectory(string solutionRoot) =>
        Path.Combine(solutionRoot, "AchievementLadder", "Data", "Guilds");

    public static string GetGuildlessCharactersPath(string solutionRoot) =>
        Path.Combine(
            solutionRoot,
            "AchievementLadder",
            "Data",
            "GuildCharacters",
            "guildless-characters.txt"
        );

    /// <returns>The number of guild names added across all realm files.</returns>
    public static int AddNewGuilds(string guildsDirectory, IEnumerable<SeenCharacter> characters)
    {
        Console.WriteLine();
        Console.WriteLine("=== Guild collection ===");

        Directory.CreateDirectory(guildsDirectory);

        var knownGuildsByFile = new Dictionary<string, HashSet<string>>(
            StringComparer.OrdinalIgnoreCase
        );
        var newGuildsByFile = new Dictionary<string, List<string>>(
            StringComparer.OrdinalIgnoreCase
        );
        var addedCount = 0;
        var skippedUnknownRealm = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var distinctCharacters = characters
            .DistinctBy(character => $"{character.Name}|{character.Realm}".ToLowerInvariant())
            .OrderBy(character => character.Name, StringComparer.OrdinalIgnoreCase);

        foreach (var character in distinctCharacters)
        {
            var guild = character.Guild.Trim();
            if (guild.Length == 0)
            {
                continue;
            }

            if (
                !CharacterHelpers.TryResolveRealm(character.Realm, out _, out var displayRealm)
                || !GuildFileByDisplayRealm.TryGetValue(displayRealm, out var fileName)
            )
            {
                if (skippedUnknownRealm.Add(character.Realm))
                {
                    Console.WriteLine(
                        $"  No guild file for realm '{character.Realm}' - skipping its guilds."
                    );
                }

                continue;
            }

            if (!knownGuildsByFile.TryGetValue(fileName, out var knownGuilds))
            {
                knownGuilds = LoadNameSet(Path.Combine(guildsDirectory, fileName));
                knownGuildsByFile[fileName] = knownGuilds;
            }

            if (!knownGuilds.Add(guild))
            {
                continue;
            }

            if (!newGuildsByFile.TryGetValue(fileName, out var newGuilds))
            {
                newGuilds = [];
                newGuildsByFile[fileName] = newGuilds;
            }

            newGuilds.Add(guild);
            addedCount++;
            Console.WriteLine($"  + Added '{guild}' to {fileName}");
        }

        foreach (var (fileName, newGuilds) in newGuildsByFile)
        {
            AppendLines(Path.Combine(guildsDirectory, fileName), newGuilds);
        }

        Console.WriteLine(
            addedCount == 0
                ? "No new guilds - all guilds already known."
                : $"Added {addedCount} new guild name(s)."
        );

        return addedCount;
    }

    /// <summary>
    /// Lines are written as <c>Name-[EN] Evermoon</c> (the API realm name), whichever realm
    /// spelling the source used, so the same character is never listed twice.
    /// </summary>
    /// <returns>The number of characters added.</returns>
    public static int AddNewGuildlessCharacters(
        string guildlessCharactersPath,
        IEnumerable<SeenCharacter> characters
    )
    {
        Console.WriteLine();
        Console.WriteLine("=== Guildless character collection ===");

        var knownCharacters = LoadNameSet(guildlessCharactersPath);
        var newCharacters = characters
            .Where(character =>
                string.IsNullOrWhiteSpace(character.Guild)
                && !string.IsNullOrWhiteSpace(character.Name)
            )
            .Select(character =>
                CharacterHelpers.TryResolveRealm(character.Realm, out var apiRealm, out _)
                    ? $"{character.Name.Trim()}-{apiRealm}"
                    : null
            )
            .OfType<string>()
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Where(knownCharacters.Add)
            .OrderBy(character => character, StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (newCharacters.Count == 0)
        {
            Console.WriteLine("No new guildless characters found.");
            return 0;
        }

        var directory = Path.GetDirectoryName(guildlessCharactersPath);
        if (!string.IsNullOrWhiteSpace(directory))
        {
            Directory.CreateDirectory(directory);
        }

        AppendLines(guildlessCharactersPath, newCharacters);
        Console.WriteLine(
            $"Added {newCharacters.Count} guildless character(s) to {guildlessCharactersPath}."
        );
        return newCharacters.Count;
    }

    private static HashSet<string> LoadNameSet(string filePath)
    {
        var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (!File.Exists(filePath))
        {
            return names;
        }

        foreach (var line in File.ReadLines(filePath))
        {
            var trimmed = line.Trim().TrimStart('﻿');
            if (!string.IsNullOrWhiteSpace(trimmed))
            {
                names.Add(trimmed);
            }
        }

        return names;
    }

    private static void AppendLines(string filePath, IReadOnlyList<string> lines)
    {
        var builder = new StringBuilder();

        if (File.Exists(filePath) && !EndsWithNewline(filePath))
        {
            builder.Append(Environment.NewLine);
        }

        foreach (var line in lines)
        {
            builder.Append(line).Append(Environment.NewLine);
        }

        File.AppendAllText(filePath, builder.ToString(), Utf8NoBom);
    }

    private static bool EndsWithNewline(string filePath)
    {
        using var stream = new FileStream(filePath, FileMode.Open, FileAccess.Read);
        if (stream.Length == 0)
        {
            return true;
        }

        stream.Seek(-1, SeekOrigin.End);
        var lastByte = stream.ReadByte();
        return lastByte is '\n' or '\r';
    }
}
