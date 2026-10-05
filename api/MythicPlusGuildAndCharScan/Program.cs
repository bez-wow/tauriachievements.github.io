using MythicPlusExporter;
using Tauri.Core.Configuration;
using Tauri.Core.Helpers;
using Tauri.Core.Infrastructure;

namespace MythicPlusGuildAndCharScan;

internal static class Program
{
    private const string UsageText = """
        MythicPlusGuildAndCharScan - adds the guilds and guildless characters seen on the
        Mythic+ leaderboards to the scan inputs.

        Usage:
          dotnet run --project MythicPlusGuildAndCharScan
          dotnet run --project MythicPlusGuildAndCharScan -- --realm WoD

        Appends new names to AchievementLadder/Data/Guilds/<realm>-guilds.txt and
        AchievementLadder/Data/GuildCharacters/guildless-characters.txt.

        Options:
          --realm <name>   Realm whose leaderboard to read; repeat for several.
                           Accepts Evermoon, Tauri, WoD or the full API realm name.
                           Defaults to Evermoon (shared with Tauri) and WoD.
          --help           Show this help text.
        """;

    public static async Task<int> Main(string[] args)
    {
        if (!TryParseRealms(args, out var realms, out var errorMessage))
        {
            if (!string.IsNullOrWhiteSpace(errorMessage))
            {
                Console.Error.WriteLine(errorMessage);
                Console.Error.WriteLine();
            }

            Console.WriteLine(UsageText);
            return errorMessage is null ? 0 : 1;
        }

        var projectRoot = ProjectPaths.FindProjectRoot(
            AppContext.BaseDirectory,
            "MythicPlusGuildAndCharScan.csproj"
        );
        var solutionRoot = ProjectPaths.FindSolutionRoot(projectRoot);
        var settingsPath = ResolveSettingsPath(projectRoot, solutionRoot);

        using var cancellationTokenSource = new CancellationTokenSource();
        Console.CancelKeyPress += (_, eventArgs) =>
        {
            eventArgs.Cancel = true;
            cancellationTokenSource.Cancel();
        };

        try
        {
            var settings = AppSettings.Load(settingsPath);
            using var apiClient = new TauriApiClient(settings.TauriApi);
            var scanner = new MythicPlusGuildAndCharScanService(
                GuildListFiles.GetGuildsDirectory(solutionRoot),
                GuildListFiles.GetGuildlessCharactersPath(solutionRoot),
                apiClient
            );

            Console.WriteLine($"Reading Mythic+ leaderboards for {string.Join(", ", realms)}...");
            var result = await scanner.ScanAsync(realms, cancellationTokenSource.Token);

            Console.WriteLine();
            Console.WriteLine($"Runs read: {result.RunCount}");
            Console.WriteLine($"Characters seen: {result.CharacterCount}");
            Console.WriteLine($"New guilds: {result.NewGuildCount}");
            Console.WriteLine($"New guildless characters: {result.NewGuildlessCharacterCount}");

            // Names are only ever added, so a partial read is safe to keep. Do not stop the
            // daily update over a leaderboard that failed to load; the next run catches up.
            if (result.Failures.Count > 0)
            {
                Console.WriteLine();
                Console.WriteLine("WARNING: some leaderboards could not be read:");
                foreach (var failure in result.Failures)
                {
                    Console.WriteLine($"  {failure}");
                }
            }

            return 0;
        }
        catch (OperationCanceledException)
        {
            Console.Error.WriteLine("Mythic+ guild and character scan cancelled.");
            return 1;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Mythic+ guild and character scan failed: {ex.Message}");
            return 1;
        }
    }

    private static bool TryParseRealms(
        string[] args,
        out IReadOnlyList<string> realms,
        out string? errorMessage
    )
    {
        var parsedRealms = new List<string>();
        realms = MythicPlusExporterOptions.DefaultRealms;
        errorMessage = null;

        for (var index = 0; index < args.Length; index++)
        {
            var argument = args[index];
            switch (argument)
            {
                case "--help":
                case "-h":
                case "/?":
                    return false;

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

                    if (!parsedRealms.Contains(apiRealm, StringComparer.Ordinal))
                    {
                        parsedRealms.Add(apiRealm);
                    }
                    break;

                default:
                    errorMessage = $"Unknown argument: {argument}";
                    return false;
            }
        }

        if (parsedRealms.Count > 0)
        {
            realms = parsedRealms;
        }

        return true;
    }

    private static string ResolveSettingsPath(string projectRoot, string solutionRoot)
    {
        var sharedSettingsPath = Path.Combine(
            solutionRoot,
            "AchievementLadder",
            "appsettings.json"
        );
        if (File.Exists(sharedSettingsPath))
        {
            return sharedSettingsPath;
        }

        var localSettingsPath = Path.Combine(projectRoot, "appsettings.json");
        if (File.Exists(localSettingsPath))
        {
            return localSettingsPath;
        }

        throw new FileNotFoundException(
            "Could not find appsettings.json in either AchievementLadder or MythicPlusGuildAndCharScan.",
            sharedSettingsPath
        );
    }
}
