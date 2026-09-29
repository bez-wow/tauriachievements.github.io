using Tauri.Core.Configuration;
using Tauri.Core.Infrastructure;

namespace MissingPlayerFinder;

internal static class Program
{
    private const int DefaultRounds = 3;
    private static readonly TimeSpan DelayBetweenRounds = TimeSpan.FromSeconds(15);

    private const string UsageText = """
        MissingPlayerFinder - backfills characters missing from Players.csv.

        Usage:
          dotnet run --project MissingPlayerFinder
          dotnet run --project MissingPlayerFinder -- --rounds 5

        Runs backfill rounds until no character is missing, a round resolves nobody, or the
        round limit is reached. Unresolved characters are left in .work/MissingPlayersToScan.txt.

        Options:
          --rounds <n>  Maximum number of backfill rounds. Defaults to 3.
          --help        Show this help text.
        """;

    public static async Task<int> Main(string[] args)
    {
        var maxRounds = DefaultRounds;
        for (var i = 0; i < args.Length; i++)
        {
            switch (args[i].ToLowerInvariant())
            {
                case "--rounds"
                    when i + 1 < args.Length
                        && int.TryParse(args[i + 1], out var rounds)
                        && rounds > 0:
                    maxRounds = rounds;
                    i++;
                    break;
                case "--help" or "-h":
                    Console.WriteLine(UsageText);
                    return 0;
                default:
                    Console.Error.WriteLine($"Invalid argument: {args[i]}");
                    Console.Error.WriteLine();
                    Console.WriteLine(UsageText);
                    return 1;
            }
        }

        var projectRoot = ProjectPaths.FindProjectRoot(
            AppContext.BaseDirectory,
            "MissingPlayerFinder.csproj"
        );
        var solutionRoot = ProjectPaths.FindSolutionRoot(projectRoot);
        var achievementLadderProjectRoot = Path.Combine(solutionRoot, "AchievementLadder");
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
            var finder = new MissingPlayerFinderService(
                solutionRoot,
                achievementLadderProjectRoot,
                settings.TauriApi,
                apiClient
            );

            for (var round = 1; round <= maxRounds; round++)
            {
                if (round > 1)
                {
                    await Task.Delay(DelayBetweenRounds, cancellationTokenSource.Token);
                }

                Console.WriteLine();
                Console.WriteLine($"=== Missing player backfill, round {round}/{maxRounds} ===");

                var result = await finder.GenerateAsync(cancellationTokenSource.Token);

                Console.WriteLine($"Scannable source characters: {result.SourceCharacterCount}");
                Console.WriteLine(
                    $"Players.csv characters before append: {result.CsvCharacterCount}"
                );
                Console.WriteLine($"Missing characters at start: {result.MissingCharacterCount}");
                Console.WriteLine($"Characters appended: {result.AppendedCharacterCount}");
                Console.WriteLine(
                    $"Rare achievement entries merged: {result.RareAchievementEntryCount}"
                );
                Console.WriteLine(
                    $"Characters still missing: {result.RemainingMissingCharacterCount}"
                );
                Console.WriteLine($"Players.csv: {result.PlayersCsvPath}");
                if (result.RareAchievementsPath is not null)
                {
                    Console.WriteLine($"RareAchievements.json: {result.RareAchievementsPath}");
                }
                if (result.LastUpdatedPath is not null)
                {
                    Console.WriteLine($"lastUpdated.txt: {result.LastUpdatedPath}");
                }
                Console.WriteLine($"MissingPlayersToScan.txt: {result.MissingOutputPath}");

                if (result.RemainingMissingCharacterCount == 0)
                {
                    Console.WriteLine("No characters left to backfill.");
                    break;
                }

                // Characters that are gone from the realm fail every time, so stop once a
                // round resolves nobody instead of burning the remaining rounds on them.
                if (result.RemainingMissingCharacterCount >= result.MissingCharacterCount)
                {
                    Console.WriteLine("This round resolved no characters; stopping.");
                    break;
                }
            }

            return 0;
        }
        catch (OperationCanceledException)
        {
            Console.Error.WriteLine("Missing player scan cancelled.");
            return 1;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Missing player scan failed: {ex.Message}");
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
            "Could not find appsettings.json in either AchievementLadder or MissingPlayerFinder.",
            sharedSettingsPath
        );
    }
}
