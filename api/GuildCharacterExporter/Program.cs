using Tauri.Core.Configuration;
using Tauri.Core.Infrastructure;

namespace GuildCharacterExporter;

internal static class Program
{
    private const string UsageText = """
        GuildCharacterExporter - expands the realm guild lists into GuildCharacters.txt.

        Usage:
          dotnet run --project GuildCharacterExporter
          dotnet run --project GuildCharacterExporter -- --retry

        Failed guilds are retried a few times within the run. Guilds the API reports as
        not found are removed from the guild lists. Anything still failing is written to
        .work/MissingGuildsToScan.txt.

        Options:
          --retry   Scan only the guilds in .work/MissingGuildsToScan.txt and merge them
                    into the existing GuildCharacters.txt instead of a full rebuild.
          --help    Show this help text.
        """;

    public static async Task<int> Main(string[] args)
    {
        var retryOnly = false;
        foreach (var arg in args)
        {
            switch (arg.ToLowerInvariant())
            {
                case "--retry":
                    retryOnly = true;
                    break;
                case "--help" or "-h":
                    Console.WriteLine(UsageText);
                    return 0;
                default:
                    Console.Error.WriteLine($"Unknown argument: {arg}");
                    Console.Error.WriteLine();
                    Console.WriteLine(UsageText);
                    return 1;
            }
        }

        var projectRoot = ProjectPaths.FindProjectRoot(
            AppContext.BaseDirectory,
            "GuildCharacterExporter.csproj"
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
            var exporter = new GuildCharacterExportService(
                solutionRoot,
                settings.TauriApi,
                apiClient
            );

            Console.WriteLine("Starting guild character export...");

            var result = await exporter.ExportAsync(retryOnly, cancellationTokenSource.Token);

            Console.WriteLine($"Scanned {result.GuildCount} guilds.");
            Console.WriteLine($"Generated {result.CharacterCount} character rows.");
            Console.WriteLine(
                $"Guilds not found: {result.DeadGuildCount} (removed from guild lists: {result.PrunedGuildCount})"
            );
            Console.WriteLine($"Guilds still failing: {result.RetryGuildCount}");
            Console.WriteLine($"GuildCharacters.txt: {result.OutputPath}");
            Console.WriteLine($"MissingGuildsToScan.txt: {result.RetryOutputPath}");

            return 0;
        }
        catch (OperationCanceledException)
        {
            Console.Error.WriteLine("Export cancelled.");
            return 1;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Export failed: {ex.Message}");
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
            "Could not find appsettings.json in either AchievementLadder or GuildCharacterExporter.",
            sharedSettingsPath
        );
    }
}
