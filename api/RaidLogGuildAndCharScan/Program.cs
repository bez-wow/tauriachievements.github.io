using RaidLogExporter;
using Tauri.Core.Configuration;
using Tauri.Core.Infrastructure;

namespace RaidLogGuildAndCharScan;

internal static class Program
{
    private const string UsageText = """
        RaidLogGuildAndCharScan - adds the guilds and guildless characters of everyone with an
        Emerald Nightmare kill to the scan inputs.

        Usage:
          dotnet run --project RaidLogGuildAndCharScan

        Reads the raiders from spa/src/raid-log-data (run RaidLogExporter first), looks up each
        one's current guild, and appends new names to
        AchievementLadder/Data/Guilds/<realm>-guilds.txt and
        AchievementLadder/Data/GuildCharacters/guildless-characters.txt.

        Options:
          --help           Show this help text.
        """;

    public static async Task<int> Main(string[] args)
    {
        if (args.Length > 0)
        {
            var isHelp = args is ["--help" or "-h" or "/?"];
            if (!isHelp)
            {
                Console.Error.WriteLine($"Unknown argument: {args[0]}");
                Console.Error.WriteLine();
            }

            Console.WriteLine(UsageText);
            return isHelp ? 0 : 1;
        }

        var projectRoot = ProjectPaths.FindProjectRoot(
            AppContext.BaseDirectory,
            "RaidLogGuildAndCharScan.csproj"
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
            var scanner = new RaidLogGuildAndCharScanService(
                Path.Combine(
                    ProjectPaths.GetFrontendSrcDirectory(solutionRoot),
                    RaidLogFileWriter.DataDirectoryName
                ),
                GuildListFiles.GetGuildsDirectory(solutionRoot),
                GuildListFiles.GetGuildlessCharactersPath(solutionRoot),
                apiClient
            );

            var result = await scanner.ScanAsync(cancellationTokenSource.Token);

            Console.WriteLine();
            Console.WriteLine($"Raiders: {result.RaiderCount}");
            Console.WriteLine($"Not found (renamed, deleted or moved): {result.NotFoundCount}");
            Console.WriteLine($"New guilds: {result.NewGuildCount}");
            Console.WriteLine($"New guildless characters: {result.NewGuildlessCharacterCount}");

            // Names are only ever added, so a partial read is safe to keep. Do not stop the
            // daily update over character sheets that failed to load; the next run catches up.
            if (result.Failures.Count > 0)
            {
                Console.WriteLine();
                Console.WriteLine(
                    $"WARNING: {result.Failures.Count} raider(s) could not be looked up:"
                );
                foreach (var failure in result.Failures.Take(20))
                {
                    Console.WriteLine($"  {failure}");
                }

                if (result.Failures.Count > 20)
                {
                    Console.WriteLine($"  ...and {result.Failures.Count - 20} more.");
                }
            }

            return 0;
        }
        catch (OperationCanceledException)
        {
            Console.Error.WriteLine("Raid log guild and character scan cancelled.");
            return 1;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Raid log guild and character scan failed: {ex.Message}");
            return 1;
        }
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
            "Could not find appsettings.json in either AchievementLadder or RaidLogGuildAndCharScan.",
            sharedSettingsPath
        );
    }
}
