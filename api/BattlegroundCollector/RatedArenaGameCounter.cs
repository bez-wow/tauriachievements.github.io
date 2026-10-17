using System.Text.Json;
using Tauri.Core.Helpers;
using Tauri.Core.Infrastructure;

namespace BattlegroundCollector;

/// <summary>
/// Counts every character's rated arena games in one bracket (2v2 or 3v3) since
/// <see cref="SeasonStart"/> for the /arena page. Match ids are shared by all three realms, so
/// the one collector run sees every realm's games.
/// </summary>
/// <remarks>
/// The collector walks match ids in order and resumes where it stopped, so each match reaches
/// the counter once. <see cref="RatedArenaGames.LastMatchId"/> still guards against a rerun
/// from an earlier id counting a match twice. Changing <see cref="SeasonStart"/> discards the
/// saved counts, because they no longer cover the same games.
/// </remarks>
public sealed class RatedArenaGameCounter
{
    // The API's bgtype for each bracket. Skirmishes are 3 as well but not ranked;
    // battlegrounds are 0.
    public const int Rated2v2 = 2;
    public const int Rated3v3 = 3;

    // "winner" holds the side that did NOT win (checked against every rating change of the
    // season), or 2 when no winner was recorded: mostly a team leaving in the first minute,
    // a few timeouts.
    private const int NoWinner = 2;

    // The first rated games of the season: 2v2 match 140940 at 09:30 that day, 3v3 match 141087
    // at 19:12.
    public static readonly DateTimeOffset SeasonStart = new(
        2026,
        9,
        16,
        0,
        0,
        0,
        TimeSpan.FromHours(2)
    );

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true,
    };

    private readonly int _bracketType;
    private readonly Dictionary<string, RatedArenaPlayer> _players;
    private int _lastMatchId;
    private DateTimeOffset? _lastMatchStart;
    private int _matchCount;

    private RatedArenaGameCounter(int bracketType, RatedArenaGames? saved)
    {
        _bracketType = bracketType;
        _players = (saved?.Players ?? []).ToDictionary(
            player => GetPlayerKey(player.Guid, player.Realm),
            StringComparer.OrdinalIgnoreCase
        );
        _lastMatchId = saved?.LastMatchId ?? 0;
        _lastMatchStart = saved?.LastMatchStart;
        _matchCount = saved?.MatchCount ?? 0;
    }

    public int NewMatchCount { get; private set; }

    public int MatchCount => _matchCount;

    /// <param name="bracketType">The bracket's bgtype: <see cref="Rated2v2"/> or <see cref="Rated3v3"/>.</param>
    public static async Task<RatedArenaGameCounter> LoadAsync(
        string path,
        int bracketType,
        CancellationToken cancellationToken
    )
    {
        if (!File.Exists(path))
        {
            return new RatedArenaGameCounter(bracketType, null);
        }

        await using var stream = File.OpenRead(path);
        var saved = await JsonSerializer.DeserializeAsync<RatedArenaGames>(
            stream,
            JsonOptions,
            cancellationToken
        );

        return new RatedArenaGameCounter(
            bracketType,
            saved?.SeasonStart == SeasonStart ? saved : null
        );
    }

    /// <summary>Counts the match when it is a rated game of this bracket and season not counted yet.</summary>
    public void Add(int matchId, JsonElement response)
    {
        if (matchId <= _lastMatchId)
        {
            return;
        }

        _lastMatchId = matchId;

        var startTime = DateTimeOffset.FromUnixTimeSeconds(
            BattlegroundCollectorService.ReadLong(response, "starttime")
        );
        if (
            BattlegroundCollectorService.ReadInt(response, "bgtype") != _bracketType
            || !BattlegroundCollectorService.ReadBoolean(response, "isranked")
            || startTime < SeasonStart
            || !response.TryGetProperty("members", out var members)
            || members.ValueKind != JsonValueKind.Array
        )
        {
            return;
        }

        var winner = BattlegroundCollectorService.ReadInt(response, "winner");

        foreach (var member in members.EnumerateArray())
        {
            if (
                member.ValueKind != JsonValueKind.Object
                || !member.TryGetProperty("character-minimal-data", out var character)
                || character.ValueKind != JsonValueKind.Object
            )
            {
                continue;
            }

            // Deleted characters come back without a name; there is nobody to list.
            var name = BattlegroundCollectorService.ReadString(character, "charname");
            var guid = BattlegroundCollectorService.ReadInt(member, "guid");
            if (name.Length == 0 || guid <= 0)
            {
                continue;
            }

            var apiRealm = BattlegroundCollectorService.ReadString(member, "realmName");
            var realm = CharacterHelpers.TryResolveRealm(apiRealm, out _, out var displayRealm)
                ? displayRealm
                : apiRealm;
            var key = GetPlayerKey(guid, realm);
            var existing = _players.GetValueOrDefault(key);
            var ratingChange = BattlegroundCollectorService.ReadInt(
                member,
                "personal_rating_change"
            );
            // Without a recorded winner, the team that gained rating is the one that won.
            var won =
                winner == NoWinner
                    ? ratingChange > 0
                    : BattlegroundCollectorService.ReadInt(member, "side") != winner;

            // A renamed character keeps its guid, so the latest name wins. personal_rating is
            // the rating going into the game, so the rating now is that plus the change.
            _players[key] = new RatedArenaPlayer(
                guid,
                realm,
                name,
                BattlegroundCollectorService.ReadInt(character, "class"),
                (existing?.Games ?? 0) + 1,
                (existing?.Wins ?? 0) + (won ? 1 : 0),
                (existing?.Losses ?? 0) + (won ? 0 : 1),
                BattlegroundCollectorService.ReadInt(member, "personal_rating") + ratingChange
            );
        }

        _matchCount++;
        NewMatchCount++;
        if (_lastMatchStart is null || startTime > _lastMatchStart)
        {
            _lastMatchStart = startTime;
        }
    }

    public Task WriteAsync(string path, CancellationToken cancellationToken)
    {
        var games = new RatedArenaGames(
            SeasonStart,
            _lastMatchId,
            _lastMatchStart,
            _matchCount,
            _players
                .Values.OrderByDescending(player => player.Games)
                .ThenBy(player => player.Name, StringComparer.Ordinal)
                .ThenBy(player => player.Realm, StringComparer.Ordinal)
                .ToList()
        );

        return AtomicFile.WriteJsonAsync(path, games, JsonOptions, cancellationToken);
    }

    private static string GetPlayerKey(int guid, string realm) => $"{realm}|{guid}";
}

public sealed record RatedArenaGames(
    DateTimeOffset SeasonStart,
    int LastMatchId,
    DateTimeOffset? LastMatchStart,
    int MatchCount,
    IReadOnlyList<RatedArenaPlayer> Players
);

public sealed record RatedArenaPlayer(
    int Guid,
    string Realm,
    string Name,
    int Class,
    int Games,
    int Wins,
    int Losses,
    int Rating
);
