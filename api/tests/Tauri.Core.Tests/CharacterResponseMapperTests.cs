using System.Text.Json;
using Tauri.Core.Infrastructure;

namespace Tauri.Core.Tests;

public sealed class CharacterResponseMapperTests
{
    [Fact]
    public void CreatePlayer_CompleteResponse_MapsProfileAndLevel10Date()
    {
        var response = Parse(
            """
            {
              "race": 1,
              "gender": 0,
              "class": 8,
              "level": 110,
              "pts": 12345,
              "playerHonorKills": 678,
              "played_time": 9000,
              "achievements_total": 321,
              "avgitemlevel": 856,
              "faction_string_class": "Alliance",
              "guildName": "Example Guild"
            }
            """
        );
        var achievements = new Dictionary<int, DateTimeOffset?>
        {
            // 01:30 on Jan 2nd at UTC+2 is still Jan 1st in UTC.
            [CharacterResponseMapper.Level10AchievementId] = new DateTimeOffset(
                2020,
                1,
                2,
                1,
                30,
                0,
                TimeSpan.FromHours(2)
            ),
        };

        var player = CharacterResponseMapper.CreatePlayer(
            response,
            achievements,
            "Examplemage",
            "Evermoon"
        );

        Assert.Equal("Examplemage", player.Name);
        Assert.Equal("Evermoon", player.Realm);
        Assert.Equal(1, player.Race);
        Assert.Equal(8, player.Class);
        Assert.Equal(110, player.Level);
        Assert.Equal(12345, player.AchievementPoints);
        Assert.Equal(678, player.HonorableKills);
        Assert.Equal("Alliance", player.Faction);
        Assert.Equal("Example Guild", player.Guild);
        Assert.Equal(new DateOnly(2020, 1, 1), player.Level10Date);
        Assert.Equal(9000, player.PlayedTime);
        Assert.Equal(321, player.AchievementsTotal);
        Assert.Equal(856m, player.ItemLevel);
    }

    [Fact]
    public void CreatePlayer_MissingOptionalProperties_UsesSafeDefaults()
    {
        var player = CharacterResponseMapper.CreatePlayer(
            Parse("{}"),
            new Dictionary<int, DateTimeOffset?>(),
            "Unknown",
            "Tauri"
        );

        Assert.Equal(0, player.Race);
        Assert.Equal(0, player.AchievementPoints);
        Assert.Equal(string.Empty, player.Guild);
        Assert.Null(player.Level10Date);
    }

    private static JsonElement Parse(string json) => JsonDocument.Parse(json).RootElement.Clone();
}
