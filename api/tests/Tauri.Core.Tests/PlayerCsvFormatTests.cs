using Tauri.Core.Infrastructure;
using Tauri.Core.Models;

namespace Tauri.Core.Tests;

public sealed class PlayerCsvFormatTests
{
    [Fact]
    public void FormatRow_ParseLine_RoundTripsEveryColumnInHeaderOrder()
    {
        var player = new Player
        {
            Name = "Mage, \"The Great\"",
            Race = 10,
            Gender = 1,
            Class = 8,
            Level = 110,
            Realm = "Evermoon",
            Guild = "Endless",
            AchievementPoints = 12345,
            HonorableKills = 678,
            Faction = "Horde",
            AppearanceCount = 4321,
            Level10Date = new DateOnly(2019, 4, 2),
            PlayedTime = 9_000_000_000,
            AchievementsTotal = 321,
            ItemLevel = 883.33m,
        };

        var header = PlayerCsvFormat.ParseLine(PlayerCsvFormat.Header);
        var values = PlayerCsvFormat.ParseLine(PlayerCsvFormat.FormatRow(player));

        Assert.Equal(header.Count, values.Count);
        string Column(string name) => values[PlayerCsvFormat.FindColumnIndex(header, name)];

        Assert.Equal("Mage, \"The Great\"", Column("Name"));
        Assert.Equal("10", Column("Race"));
        Assert.Equal("1", Column("Gender"));
        Assert.Equal("8", Column("Class"));
        Assert.Equal("110", Column("Level"));
        Assert.Equal("Evermoon", Column("Realm"));
        Assert.Equal("Endless", Column("Guild"));
        Assert.Equal("12345", Column("AchievementPoints"));
        Assert.Equal("678", Column("HonorableKills"));
        Assert.Equal("Horde", Column("Faction"));
        Assert.Equal("4321", Column("AppearanceCount"));
        Assert.Equal("2019-04-02", Column("Level10Date"));
        Assert.Equal("9000000000", Column("PlayedTime"));
        Assert.Equal("321", Column("AchievementsTotal"));
        Assert.Equal("883.33", Column("ilvl"));
    }

    [Fact]
    public void FormatRow_UnknownOptionalValues_WritesEmptyFields()
    {
        var values = PlayerCsvFormat.ParseLine(
            PlayerCsvFormat.FormatRow(new Player { Name = "Nobody", Realm = "Tauri" })
        );
        var header = PlayerCsvFormat.ParseLine(PlayerCsvFormat.Header);

        Assert.Equal(string.Empty, values[PlayerCsvFormat.FindColumnIndex(header, "Level10Date")]);
        Assert.Equal(string.Empty, values[PlayerCsvFormat.FindColumnIndex(header, "ilvl")]);
    }

    [Fact]
    public void FindColumnIndex_MissingColumn_ReturnsMinusOne()
    {
        Assert.Equal(-1, PlayerCsvFormat.FindColumnIndex(["Name", "Realm"], "Level"));
    }
}
