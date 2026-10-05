using Tauri.Core.Helpers;

namespace MythicPlusExporter;

public sealed record MythicPlusExporterOptions(IReadOnlyList<string> Realms, bool AllowShrink)
{
    /// <summary>
    /// One realm per leaderboard: Evermoon's also holds every Tauri run, WoD has its own.
    /// Asking Tauri as well would only return Evermoon's leaderboard a second time.
    /// </summary>
    public static readonly IReadOnlyList<string> DefaultRealms =
    [
        "[EN] Evermoon",
        "[HU] Warriors of Darkness",
    ];

    public static string UsageText =>
        """
            MythicPlusExporter - exports the Mythic+ leaderboards for the /mythic-plus page.

            Usage:
              dotnet run --project MythicPlusExporter
              dotnet run --project MythicPlusExporter -- --realm Evermoon

            Writes spa/src/mythic-plus/index.json and one <dungeon>.json per dungeon.

            Options:
              --realm <name>   Realm whose leaderboard to read; repeat for several.
                               Accepts Evermoon, Tauri, WoD or the full API realm name.
                               Defaults to Evermoon (shared with Tauri) and WoD.
              --allow-shrink   Publish even if there are fewer runs than last time,
                               e.g. after a season reset.
              --help           Show this help text.
            """;

    public static bool TryParse(
        string[] args,
        out MythicPlusExporterOptions? options,
        out string? errorMessage,
        out bool showHelp
    )
    {
        options = null;
        errorMessage = null;
        showHelp = false;

        var realms = new List<string>();
        var allowShrink = false;

        for (var index = 0; index < args.Length; index++)
        {
            var argument = args[index];

            switch (argument)
            {
                case "--help":
                case "-h":
                case "/?":
                    showHelp = true;
                    return false;

                case "--allow-shrink":
                    allowShrink = true;
                    break;

                case "--realm":
                    if (index + 1 >= args.Length)
                    {
                        errorMessage = "Missing value for --realm.";
                        return false;
                    }

                    var rawRealm = args[++index];
                    if (!CharacterHelpers.TryResolveRealm(rawRealm, out var apiRealm, out _))
                    {
                        errorMessage = $"Unknown realm: {rawRealm}";
                        return false;
                    }

                    if (!realms.Contains(apiRealm, StringComparer.Ordinal))
                    {
                        realms.Add(apiRealm);
                    }
                    break;

                default:
                    errorMessage = argument.StartsWith("--", StringComparison.Ordinal)
                        ? $"Unknown option: {argument}"
                        : $"Unknown argument: {argument}";
                    return false;
            }
        }

        options = new MythicPlusExporterOptions(
            realms.Count > 0 ? realms : DefaultRealms,
            allowShrink
        );
        return true;
    }
}
