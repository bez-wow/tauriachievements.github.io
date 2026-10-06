using Tauri.Core.Configuration;
using Tauri.Core.Infrastructure;

namespace MythicPlusExporter;

internal static class Program
{
    public static async Task<int> Main(string[] args)
    {
        if (
            !MythicPlusExporterOptions.TryParse(
                args,
                out var options,
                out var errorMessage,
                out var showHelp
            )
        )
        {
            if (!string.IsNullOrWhiteSpace(errorMessage))
            {
                Console.Error.WriteLine(errorMessage);
                Console.Error.WriteLine();
            }

            Console.WriteLine(MythicPlusExporterOptions.UsageText);
            return showHelp ? 0 : 1;
        }

        var projectRoot = ProjectPaths.FindProjectRoot(
            AppContext.BaseDirectory,
            "MythicPlusExporter.csproj"
        );
        var solutionRoot = ProjectPaths.FindSolutionRoot(projectRoot);
        var settingsPath = ResolveSettingsPath(projectRoot, solutionRoot);
        var outputDirectory = Path.Combine(
            ProjectPaths.GetFrontendSrcDirectory(solutionRoot),
            "mythic-plus-data"
        );

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
            var exporter = new MythicPlusExportService(outputDirectory, apiClient);

            Console.WriteLine(
                $"Reading Mythic+ leaderboards for {string.Join(", ", options!.Realms)}..."
            );

            var result = await exporter.ExportAsync(options, cancellationTokenSource.Token);
            var dataset = result.Dataset;

            Console.WriteLine();
            foreach (var dungeon in dataset.Dungeons)
            {
                Console.WriteLine(
                    $"{dungeon.Info.ShortName, -5} {dungeon.Map.Name, -28} {dungeon.Runs.Count, 6} runs  best {dungeon.BestScore:0.0}"
                );
            }

            Console.WriteLine(
                result.PreviousRunCount == 0
                    ? $"New M+ runs: {dataset.RunCount} (first export)"
                    : $"New M+ runs since last export: {dataset.RunCount - result.PreviousRunCount}"
            );
            Console.WriteLine($"Players: {dataset.Players.Count}");
            Console.WriteLine($"Output: {result.OutputDirectory}");

            return 0;
        }
        catch (OperationCanceledException)
        {
            Console.Error.WriteLine("Mythic+ export cancelled.");
            return 1;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Mythic+ export failed: {ex.Message}");
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
            "Could not find appsettings.json in either AchievementLadder or MythicPlusExporter.",
            sharedSettingsPath
        );
    }
}
