using System.Text.Json;
using Tauri.Core.Infrastructure;
using Tauri.Core.Models;

namespace AchievementLadder.Services;

public sealed class PlayerCsvStore
{
    private static readonly JsonSerializerOptions FrontendJsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    private readonly string _outputDirectory;

    public PlayerCsvStore(string outputDirectory)
    {
        _outputDirectory = Path.GetFullPath(outputDirectory);
    }

    public async Task<string> WriteAsync(
        IEnumerable<Player> players,
        string relativePath,
        CancellationToken ct = default
    )
    {
        var fullPath = Path.Combine(_outputDirectory, relativePath);
        var lines = players.Select(PlayerCsvFormat.FormatRow).Prepend(PlayerCsvFormat.Header);

        await AtomicFile.WriteLinesAsync(fullPath, lines, ct);
        return fullPath;
    }

    public async Task<string> WriteTextAsync(
        string relativePath,
        string content,
        CancellationToken ct = default
    )
    {
        var fullPath = Path.Combine(_outputDirectory, relativePath);

        await AtomicFile.WriteTextAsync(fullPath, content, ct);
        return fullPath;
    }

    public async Task<string> WriteJsonAsync<T>(
        string relativePath,
        T value,
        CancellationToken ct = default
    )
    {
        var fullPath = Path.Combine(_outputDirectory, relativePath);

        await AtomicFile.WriteJsonAsync(fullPath, value, FrontendJsonOptions, ct);
        return fullPath;
    }
}
