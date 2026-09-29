using System.Text.Json;
using Tauri.Core.Infrastructure;
using Tauri.Core.Models;

namespace Tauri.Core.Tests;

public sealed class CharacterScannerTests
{
    private static readonly IReadOnlyDictionary<int, RareItemDefinition> NoRareItems =
        new Dictionary<int, RareItemDefinition>();

    [Fact]
    public async Task ScanAsync_AllEndpointsSucceed_ReturnsCompletePlayer()
    {
        var client = new FakeTauriApiClient(
            new Dictionary<string, TauriApiResponseResult>
            {
                ["character-achievements"] = Success(
                    """
                    {
                      "race": 1,
                      "gender": 0,
                      "class": 8,
                      "pts": 100,
                      "playerHonorKills": 25,
                      "played_time": 9000,
                      "achievements_total": 321,
                      "avgitemlevel": 856,
                      "faction_string_class": "Alliance",
                      "guildName": "Test Guild",
                      "Achievements": { "6": { "date": "2020-01-01" }, "416": {} }
                    }
                    """
                ),
                ["character-itemappearances"] = Success(
                    """{ "itemappearances": { "owned": [[1, 2], [3]] } }"""
                ),
            }
        );

        var result = await CharacterScanner.ScanAsync(
            client,
            "Examplemage",
            "[EN] Evermoon",
            "Evermoon",
            NoRareItems,
            CharacterScanMode.Full,
            CancellationToken.None
        );

        Assert.True(result.Succeeded);
        Assert.NotNull(result.Player);
        Assert.Equal("Examplemage", result.Player.Name);
        Assert.Equal(3, result.Player.AppearanceCount);
        Assert.Empty(result.RareItems);
        Assert.Equal(9000, result.Player.PlayedTime);
        Assert.Equal(321, result.Player.AchievementsTotal);
        Assert.Equal(856m, result.Player.ItemLevel);
        Assert.Equal(new DateOnly(2020, 1, 1), result.Player.Level10Date);
        Assert.Contains(result.RareAchievements, achievement => achievement.Id == 416);
        Assert.Equal(
            ["character-achievements", "character-itemappearances"],
            client.RequestedEndpoints
        );
    }

    [Fact]
    public async Task ScanAsync_OwnedRareItems_ReturnsMatches()
    {
        var client = new FakeTauriApiClient(
            new Dictionary<string, TauriApiResponseResult>
            {
                ["character-achievements"] = Success("""{ "Achievements": {} }"""),
                ["character-itemappearances"] = Success(
                    """{ "itemappearances": { "owned": [[22818, 123], [23075]] } }"""
                ),
            }
        );
        var targets = new Dictionary<int, RareItemDefinition>
        {
            [22818] = new(22818, "The Plague Bearer"),
            [22691] = new(22691, "Corrupted Ashbringer"),
        };

        var result = await CharacterScanner.ScanAsync(
            client,
            "Example",
            "[EN] Evermoon",
            "Evermoon",
            targets,
            CharacterScanMode.Full,
            CancellationToken.None
        );

        var item = Assert.Single(result.RareItems);
        Assert.Equal(22818, item.Id);
        Assert.Equal("The Plague Bearer", item.Name);
    }

    [Fact]
    public async Task ScanAsync_AchievementRequestFails_StopsWithoutPartialPlayer()
    {
        var client = new FakeTauriApiClient(
            new Dictionary<string, TauriApiResponseResult>
            {
                ["character-achievements"] = TauriApiResponseResult.Failure("Unavailable"),
            }
        );

        var result = await FetchAsync(client);

        Assert.False(result.Succeeded);
        Assert.Null(result.Player);
        Assert.Empty(result.RareAchievements);
        Assert.Equal(["character-achievements"], client.RequestedEndpoints);
    }

    [Fact]
    public async Task ScanAsync_Level110_UsesApiItemLevelWithoutSheetRequest()
    {
        var client = new FakeTauriApiClient(
            new Dictionary<string, TauriApiResponseResult>
            {
                ["character-achievements"] = Success(
                    """{ "level": 110, "avgitemlevel": 856, "Achievements": {} }"""
                ),
                ["character-itemappearances"] = Success(
                    """{ "itemappearances": { "owned": [] } }"""
                ),
            }
        );

        var result = await FetchAsync(client);

        Assert.True(result.Succeeded);
        Assert.Equal(110, result.Player!.Level);
        Assert.Equal(856m, result.Player.ItemLevel);
        Assert.Equal(
            ["character-achievements", "character-itemappearances"],
            client.RequestedEndpoints
        );
    }

    [Fact]
    public async Task ScanAsync_MalformedAppearanceResponse_FailsSync()
    {
        var client = new FakeTauriApiClient(
            new Dictionary<string, TauriApiResponseResult>
            {
                ["character-achievements"] = Success("""{ "Achievements": {} }"""),
                ["character-itemappearances"] = Success("""{ "itemappearances": {} }"""),
            }
        );

        var result = await FetchAsync(client);

        Assert.False(result.Succeeded);
        Assert.Null(result.Player);
        Assert.Equal(
            ["character-achievements", "character-itemappearances"],
            client.RequestedEndpoints
        );
    }

    [Fact]
    public async Task ScanAsync_AchievementsOnly_SkipsAppearanceRequest()
    {
        var client = new FakeTauriApiClient(
            new Dictionary<string, TauriApiResponseResult>
            {
                ["character-achievements"] = Success("""{ "pts": 100, "Achievements": {} }"""),
            }
        );

        var result = await CharacterScanner.ScanAsync(
            client,
            "Example",
            "[EN] Evermoon",
            "Evermoon",
            NoRareItems,
            CharacterScanMode.AchievementsOnly,
            CancellationToken.None
        );

        Assert.True(result.Succeeded);
        Assert.Equal(100, result.Player!.AchievementPoints);
        Assert.Equal(["character-achievements"], client.RequestedEndpoints);
    }

    private static Task<CharacterScanResult> FetchAsync(FakeTauriApiClient client) =>
        CharacterScanner.ScanAsync(
            client,
            "Example",
            "[EN] Evermoon",
            "Evermoon",
            NoRareItems,
            CharacterScanMode.Full,
            CancellationToken.None
        );

    private static TauriApiResponseResult Success(string json) =>
        TauriApiResponseResult.Success(JsonDocument.Parse(json).RootElement.Clone());

    private sealed class FakeTauriApiClient(
        IReadOnlyDictionary<string, TauriApiResponseResult> responses
    ) : ITauriApiClient
    {
        public List<string> RequestedEndpoints { get; } = [];

        public Task<TauriApiResponseResult> FetchResponseElementAsync(
            string endpoint,
            object parameters,
            string requestLabel,
            CancellationToken cancellationToken
        )
        {
            cancellationToken.ThrowIfCancellationRequested();
            RequestedEndpoints.Add(endpoint);

            return Task.FromResult(
                responses.TryGetValue(endpoint, out var response)
                    ? response
                    : TauriApiResponseResult.Failure($"No fake response for {endpoint}.")
            );
        }
    }
}
