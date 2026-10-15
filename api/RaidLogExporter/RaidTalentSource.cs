using System.Globalization;
using System.Text.Json;

namespace RaidLogExporter;

public interface IRaidTalentSource
{
    /// <summary>Every tracked spec's talent tiers, or null when any of them could not be read.</summary>
    Task<IReadOnlyList<RaidSpecTalents>?> LoadAsync(CancellationToken cancellationToken);
}

/// <summary>
/// Reads the talent tiers from TauriShoot's talent calculator, <c>?talent-frag&amp;c=&lt;classId&gt;</c>,
/// the server's own data. Checked on 2026-10-15 against tauriprogress's table, which decodes the
/// same raid logs: all 756 talents of the 36 specs matched.
/// </summary>
public sealed class TauriShootTalentSource : IRaidTalentSource, IDisposable
{
    private const string BaseUrl = "https://legion-shoot.tauri.hu/";
    private readonly HttpClient _httpClient = new() { Timeout = TimeSpan.FromSeconds(30) };

    public async Task<IReadOnlyList<RaidSpecTalents>?> LoadAsync(
        CancellationToken cancellationToken
    )
    {
        var talents = new List<RaidSpecTalents>();
        foreach (var classSpecs in RaidCatalog.Specs.GroupBy(spec => spec.ClassId))
        {
            try
            {
                var json = await _httpClient.GetStringAsync(
                    $"{BaseUrl}?talent-frag&c={classSpecs.Key}",
                    cancellationToken
                );
                using var document = JsonDocument.Parse(json);
                var parsed = ParseFragment(
                    document.RootElement,
                    [.. classSpecs.Select(spec => spec.Id)]
                );
                if (parsed is null)
                {
                    Console.Error.WriteLine(
                        $"[TauriShoot] Class {classSpecs.Key} has no complete talent tiers."
                    );
                    return null;
                }

                talents.AddRange(parsed);
            }
            catch (Exception error)
                when (error is HttpRequestException or IOException or JsonException
                    || error is TaskCanceledException && !cancellationToken.IsCancellationRequested
                )
            {
                Console.Error.WriteLine(
                    $"[TauriShoot] Talents of class {classSpecs.Key} unavailable: {error.Message}"
                );
                return null;
            }
        }

        return talents;
    }

    /// <summary>
    /// A class's fragment lists each tier's choices left to right. A choice is one talent for the
    /// whole class (spec <c>"0"</c>) or one per spec, as an array or an object keyed by spec id.
    /// Returns null unless every tier is there and every spec has a talent on it.
    /// </summary>
    public static IReadOnlyList<RaidSpecTalents>? ParseFragment(
        JsonElement fragment,
        IReadOnlyList<int> specIds
    )
    {
        if (
            fragment.ValueKind != JsonValueKind.Object
            || !fragment.TryGetProperty("talents", out var tiers)
            || tiers.ValueKind != JsonValueKind.Array
            || tiers.GetArrayLength() != RaidCatalog.TalentTiers
        )
        {
            return null;
        }

        var result = new List<RaidSpecTalents>();
        foreach (var specId in specIds)
        {
            var specTiers = new List<IReadOnlyList<RaidTalent?>>();
            foreach (var tier in tiers.EnumerateArray())
            {
                var choices =
                    tier.ValueKind == JsonValueKind.Array
                        ? tier.EnumerateArray().Select(choice => PickTalent(choice, specId)).ToList()
                        : [];
                if (choices.All(talent => talent is null))
                {
                    return null;
                }

                specTiers.Add(choices);
            }

            result.Add(new RaidSpecTalents(specId, specTiers));
        }

        return result;
    }

    private static RaidTalent? PickTalent(JsonElement choice, int specId)
    {
        var entries = (
            choice.ValueKind switch
            {
                JsonValueKind.Array => choice.EnumerateArray(),
                JsonValueKind.Object => choice.EnumerateObject().Select(entry => entry.Value),
                _ => [],
            }
        )
            .Where(entry => entry.ValueKind == JsonValueKind.Object)
            .ToList();
        var own = specId.ToString(CultureInfo.InvariantCulture);
        var entry = entries.FirstOrDefault(entry => ReadText(entry, "spec") == own);
        if (entry.ValueKind != JsonValueKind.Object)
        {
            entry = entries.FirstOrDefault(entry => ReadText(entry, "spec") == "0");
        }

        if (
            entry.ValueKind != JsonValueKind.Object
            || !int.TryParse(ReadText(entry, "id"), CultureInfo.InvariantCulture, out var spellId)
            || spellId <= 0
        )
        {
            return null;
        }

        return new RaidTalent(spellId, ReadText(entry, "name").Trim(), ReadText(entry, "icon").Trim());
    }

    /// <summary>TauriShoot writes numbers as strings; either reads as text.</summary>
    private static string ReadText(JsonElement element, string propertyName) =>
        !element.TryGetProperty(propertyName, out var property) ? ""
        : property.ValueKind == JsonValueKind.String ? property.GetString() ?? ""
        : property.ValueKind == JsonValueKind.Number ? property.GetRawText()
        : "";

    public void Dispose() => _httpClient.Dispose();
}
