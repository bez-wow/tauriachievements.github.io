using Tauri.Core.Configuration;
using Tauri.Core.Infrastructure;

namespace RaidLogExporter;

internal static class Program
{
    public static async Task<int> Main(string[] args)
    {
        if (
            !RaidLogExporterOptions.TryParse(
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

            Console.WriteLine(RaidLogExporterOptions.UsageText);
            return showHelp ? 0 : 1;
        }

        var projectRoot = ProjectPaths.FindProjectRoot(
            AppContext.BaseDirectory,
            "RaidLogExporter.csproj"
        );
        var solutionRoot = ProjectPaths.FindSolutionRoot(projectRoot);
        var settingsPath = ResolveSettingsPath(projectRoot, solutionRoot);
        var frontendSrc = ProjectPaths.GetFrontendSrcDirectory(solutionRoot);
        var outputDirectory = Path.Combine(frontendSrc, RaidLogFileWriter.DataDirectoryName);

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
            using var itemSource = new TauriShootItemSource();
            using var talentSource = new TauriShootTalentSource();
            using var tooltipSource = new TauriShootSpellTooltipSource();
            var guildDirectory = PlayerGuildDirectory.Load(
                Path.Combine(frontendSrc, "Players.csv")
            );
            var exporter = new RaidLogExportService(
                outputDirectory,
                apiClient,
                itemSource,
                talentSource,
                tooltipSource,
                guildDirectory
            );

            Console.WriteLine(
                $"Reading {RaidCatalog.Name} rankings for {string.Join(", ", options!.Realms)}..."
            );

            var result = await exporter.ExportAsync(options, cancellationTokenSource.Token);
            var dataset = result.Dataset;

            Console.WriteLine();
            foreach (var boss in RaidCatalog.Bosses)
            {
                var kills = RaidCatalog.Difficulties.Select(difficulty =>
                    $"{difficulty.ShortName} {dataset.Logs.Count(log => log.EncounterId == boss.EncounterId && log.DifficultyId == difficulty.Id), 4}"
                );
                Console.WriteLine($"{boss.Name, -36} {string.Join("  ", kills)}");
            }

            foreach (var skipped in result.SkippedLogs)
            {
                Console.Error.WriteLine(
                    $"Skipped log {skipped.LogId} ({skipped.Realm}): its details describe another kill."
                );
            }

            Console.WriteLine(
                result.PreviousLogCount == 0
                    ? $"Kills: {dataset.Logs.Count} (first export)"
                    : $"New kills since last export: {dataset.Logs.Count - result.PreviousLogCount}"
            );
            Console.WriteLine($"Logs read from the API: {result.ReadLogCount}");
            Console.WriteLine($"Guilds: {dataset.Guilds.Count}, items: {dataset.Items.Count}");
            Console.WriteLine(
                result.TalentSpecCount > 0
                    ? $"Talents: {result.TalentSpecCount} specs"
                    : "Talents: TauriShoot could not be read; the last talents.json stays"
            );
            if (result.TalentTooltips is { } tooltips)
            {
                Console.WriteLine(
                    $"Talent tooltips: {tooltips.WrittenCount} of {tooltips.SpellCount} spells, "
                        + $"{tooltips.LookedUpCount} looked up on TauriShoot"
                );
                if (tooltips.WrittenCount < tooltips.SpellCount)
                {
                    Console.Error.WriteLine(
                        $"{tooltips.SpellCount - tooltips.WrittenCount} talent tooltips could not be read; they are looked up again next run."
                    );
                }
            }
            Console.WriteLine($"Output: {result.OutputDirectory}");

            return 0;
        }
        catch (OperationCanceledException)
        {
            Console.Error.WriteLine("Raid log export cancelled.");
            return 1;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Raid log export failed: {ex.Message}");
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
            "Could not find appsettings.json in either AchievementLadder or RaidLogExporter.",
            sharedSettingsPath
        );
    }
}
