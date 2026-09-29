using Tauri.Core.Models;
using Tauri.Core.Shared;

namespace Tauri.Core.Infrastructure;

/// <summary>
/// Fetches one character and maps it to a <see cref="Player"/> plus its rare achievements and
/// rare items. Both the full ladder scan and the missing-player backfill use this, so every
/// row in Players.csv is produced the same way.
/// </summary>
public static class CharacterScanner
{
    public static async Task<CharacterScanResult> ScanAsync(
        ITauriApiClient apiClient,
        string name,
        string apiRealm,
        string displayRealm,
        IReadOnlyDictionary<int, RareItemDefinition> rareItemsById,
        CharacterScanMode mode,
        CancellationToken cancellationToken
    )
    {
        ArgumentNullException.ThrowIfNull(apiClient);
        ArgumentNullException.ThrowIfNull(rareItemsById);

        var requestParameters = new { r = apiRealm, n = name };
        var requestLabel = $"{name}-{displayRealm}";

        var responseResult = await apiClient.FetchResponseElementAsync(
            "character-achievements",
            requestParameters,
            requestLabel,
            cancellationToken
        );

        if (!responseResult.Succeeded || responseResult.ResponseElement is not { } response)
        {
            return CharacterScanResult.Failure();
        }

        var achievements = RareAchievementExtractor.ExtractAchievements(
            response,
            RareScanCatalog.DateTrackedAchievementIds
        );
        var player = CharacterResponseMapper.CreatePlayer(
            response,
            achievements,
            name,
            displayRealm
        );
        var rareAchievements = RareAchievementExtractor.ExtractRareAchievements(
            achievements,
            RareScanCatalog.RareAchievementDefinitions,
            RareScanCatalog.RareAchievementDateRequirements
        );

        if (mode == CharacterScanMode.AchievementsOnly)
        {
            return CharacterScanResult.Success(player, rareAchievements, []);
        }

        var appearanceResponseResult = await apiClient.FetchResponseElementAsync(
            "character-itemappearances",
            requestParameters,
            requestLabel,
            cancellationToken
        );

        if (
            !appearanceResponseResult.Succeeded
            || appearanceResponseResult.ResponseElement is not { } appearanceResponse
            || !ItemAppearanceCounter.TryCountOwned(appearanceResponse, out var appearanceCount)
            || !ItemAppearanceCounter.TryFindOwned(
                appearanceResponse,
                rareItemsById,
                out var foundRareItems
            )
        )
        {
            return CharacterScanResult.Failure();
        }

        player.AppearanceCount = appearanceCount;

        return CharacterScanResult.Success(player, rareAchievements, foundRareItems);
    }
}

public enum CharacterScanMode
{
    /// <summary>Achievements and item appearances: everything a Players.csv row needs.</summary>
    Full,

    /// <summary>Achievements only, for refreshing rare achievements of a known character.</summary>
    AchievementsOnly,
}

public readonly record struct CharacterScanResult(
    Player? Player,
    IReadOnlyList<CharacterRareAchievement> RareAchievements,
    IReadOnlyList<RareItemDefinition> RareItems,
    bool Succeeded
)
{
    public static CharacterScanResult Success(
        Player player,
        IReadOnlyList<CharacterRareAchievement> rareAchievements,
        IReadOnlyList<RareItemDefinition> rareItems
    ) => new(player, rareAchievements, rareItems, true);

    public static CharacterScanResult Failure() => new(null, [], [], false);
}
