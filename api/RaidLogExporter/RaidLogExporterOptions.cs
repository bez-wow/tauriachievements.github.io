using Tauri.Core.Helpers;

namespace RaidLogExporter;

public sealed record RaidLogExporterOptions(
    IReadOnlyList<string> Realms,
    bool Full,
    bool AllowShrink
)
{
    /// <summary>
    /// Legion raids of Evermoon and Tauri characters are all logged on Tauri's API; Evermoon's
    /// lists none of them (checked 2026-10-12) but costs little to ask, in case that changes.
    /// WoD logs its own.
    /// </summary>
    public static readonly IReadOnlyList<string> DefaultRealms =
    [
        "[HU] Tauri WoW Server",
        "[EN] Evermoon",
        "[HU] Warriors of Darkness",
    ];

    public static string UsageText =>
        """
            RaidLogExporter - exports the Emerald Nightmare kill logs for the /raid-logs pages.

            Usage:
              dotnet run --project RaidLogExporter
              dotnet run --project RaidLogExporter -- --full

            Writes spa/src/raid-log-data/index.json and one <boss>-<difficulty>.json per boss
            and difficulty with kills, plus talents.json and talent-tooltips.json from
            TauriShoot. Only kills and talent tooltips the last export does not have are read.

            Options:
              --realm <name>   Realm whose logs to read; repeat for several.
                               Accepts Evermoon, Tauri, WoD or the full API realm name.
                               Defaults to all three.
              --full           Read every log and talent tooltip again instead of reusing
                               the last export.
              --allow-shrink   Publish even if there are fewer kills than last time.
              --help           Show this help text.
            """;

    public static bool TryParse(
        string[] args,
        out RaidLogExporterOptions? options,
        out string? errorMessage,
        out bool showHelp
    )
    {
        options = null;
        errorMessage = null;
        showHelp = false;

        var realms = new List<string>();
        var full = false;
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

                case "--full":
                    full = true;
                    break;

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

        options = new RaidLogExporterOptions(
            realms.Count > 0 ? realms : DefaultRealms,
            full,
            allowShrink
        );
        return true;
    }
}
