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
    private readonly ArenaCharacterIdentityMap _identityMap;
    private readonly Dictionary<string, RatedArenaPlayer> _players;
    private readonly Dictionary<string, UnresolvedArenaPlayer> _unresolvedPlayers;
    private int _lastMatchId;
    private DateTimeOffset? _lastMatchStart;
    private int _matchCount;

    private RatedArenaGameCounter(
        int bracketType,
        RatedArenaGames? saved,
        ArenaCharacterIdentityMap identityMap
    )
    {
        _bracketType = bracketType;
        _identityMap = identityMap;
        _players = (saved?.Players ?? []).ToDictionary(
            player => GetPlayerKey(player.Guid, player.Realm),
            StringComparer.OrdinalIgnoreCase
        );
        _unresolvedPlayers = (saved?.UnresolvedPlayers ?? []).ToDictionary(
            player => GetPlayerKey(player.Guid, player.Realm),
            StringComparer.OrdinalIgnoreCase
        );
        _lastMatchId = saved?.LastMatchId ?? 0;
        _lastMatchStart = saved?.LastMatchStart;
        _matchCount = saved?.MatchCount ?? 0;
        ResolveSavedPlayers();
    }

    public int NewMatchCount { get; private set; }

    public int MatchCount => _matchCount;

    /// <param name="bracketType">The bracket's bgtype: <see cref="Rated2v2"/> or <see cref="Rated3v3"/>.</param>
    public static async Task<RatedArenaGameCounter> LoadAsync(
        string path,
        int bracketType,
        ArenaCharacterIdentityMap identityMap,
        CancellationToken cancellationToken
    )
    {
        if (!File.Exists(path))
        {
            return new RatedArenaGameCounter(bracketType, null, identityMap);
        }

        await using var stream = File.OpenRead(path);
        var saved = await JsonSerializer.DeserializeAsync<RatedArenaGames>(
            stream,
            JsonOptions,
            cancellationToken
        );

        return new RatedArenaGameCounter(
            bracketType,
            saved?.SeasonStart == SeasonStart ? saved : null,
            identityMap
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
            if (member.ValueKind != JsonValueKind.Object)
            {
                continue;
            }

            var guid = BattlegroundCollectorService.ReadInt(member, "guid");
            if (guid <= 0)
            {
                continue;
            }

            var hasCharacter =
                member.TryGetProperty("character-minimal-data", out var character)
                && character.ValueKind == JsonValueKind.Object;
            var apiName = hasCharacter
                ? BattlegroundCollectorService.ReadString(character, "charname")
                : string.Empty;
            var apiClass = hasCharacter
                ? BattlegroundCollectorService.ReadInt(character, "class")
                : 0;
            var apiRealm = BattlegroundCollectorService.ReadString(member, "realmName");
            var realm = CharacterHelpers.TryResolveRealm(apiRealm, out _, out var displayRealm)
                ? displayRealm
                : apiRealm;
            var ratingChange = BattlegroundCollectorService.ReadInt(
                member,
                "personal_rating_change"
            );
            // Without a recorded winner, the team that gained rating is the one that won.
            var won =
                winner == NoWinner
                    ? ratingChange > 0
                    : BattlegroundCollectorService.ReadInt(member, "side") != winner;
            var rawKey = GetPlayerKey(guid, realm);
            var hasAlias = _identityMap.TryResolve(guid, realm, out var identity);
            var canonicalGuid = hasAlias ? identity.Guid : guid;
            var canonicalRealm = hasAlias ? identity.Realm : realm;
            var key = GetPlayerKey(canonicalGuid, canonicalRealm);
            var existing = _players.GetValueOrDefault(key);
            var name = hasAlias ? identity.Name : apiName;
            var playerClass = hasAlias ? identity.Class : apiClass;

            // The match API blanks character-minimal-data after some transfers, restorations,
            // renames and deletions. Keep counting a GUID we already know; otherwise preserve
            // the member so an identity added later can recover it without another API scan.
            if (name.Length == 0 && existing is not null)
            {
                name = existing.Name;
                playerClass = existing.Class;
            }

            if (name.Length == 0)
            {
                AddUnresolvedPlayer(matchId, guid, realm, member, won, ratingChange);
                continue;
            }

            _unresolvedPlayers.Remove(rawKey, out var recovered);

            // A renamed character keeps its guid, so the latest name wins. personal_rating is
            // the rating going into the game, so the rating now is that plus the change.
            _players[key] = new RatedArenaPlayer(
                canonicalGuid,
                canonicalRealm,
                name,
                playerClass,
                (existing?.Games ?? 0) + (recovered?.Games ?? 0) + 1,
                (existing?.Wins ?? 0) + (recovered?.Wins ?? 0) + (won ? 1 : 0),
                (existing?.Losses ?? 0) + (recovered?.Losses ?? 0) + (won ? 0 : 1),
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
                .ToList(),
            _unresolvedPlayers
                .Values.OrderByDescending(player => player.Games)
                .ThenBy(player => player.Realm, StringComparer.Ordinal)
                .ThenBy(player => player.Guid)
                .ToList()
        );

        return AtomicFile.WriteJsonAsync(path, games, JsonOptions, cancellationToken);
    }

    private static string GetPlayerKey(int guid, string realm) => $"{realm}|{guid}";

    private void AddUnresolvedPlayer(
        int matchId,
        int guid,
        string realm,
        JsonElement member,
        bool won,
        int ratingChange
    )
    {
        var key = GetPlayerKey(guid, realm);
        var existing = _unresolvedPlayers.GetValueOrDefault(key);
        _unresolvedPlayers[key] = new UnresolvedArenaPlayer(
            guid,
            realm,
            BattlegroundCollectorService.ReadInt(member, "specid"),
            (existing?.Games ?? 0) + 1,
            (existing?.Wins ?? 0) + (won ? 1 : 0),
            (existing?.Losses ?? 0) + (won ? 0 : 1),
            BattlegroundCollectorService.ReadInt(member, "personal_rating") + ratingChange,
            existing is null ? matchId : Math.Min(existing.FirstMatchId, matchId),
            existing is null ? matchId : Math.Max(existing.LastMatchId, matchId)
        );
    }

    private void ResolveSavedPlayers()
    {
        foreach (var unresolved in _unresolvedPlayers.Values.ToList())
        {
            if (!_identityMap.TryResolve(unresolved.Guid, unresolved.Realm, out var identity))
            {
                continue;
            }

            var canonicalKey = GetPlayerKey(identity.Guid, identity.Realm);
            var existing = _players.GetValueOrDefault(canonicalKey);
            _players[canonicalKey] = new RatedArenaPlayer(
                identity.Guid,
                identity.Realm,
                identity.Name,
                identity.Class,
                (existing?.Games ?? 0) + unresolved.Games,
                (existing?.Wins ?? 0) + unresolved.Wins,
                (existing?.Losses ?? 0) + unresolved.Losses,
                existing?.Rating ?? unresolved.Rating
            );
            _unresolvedPlayers.Remove(GetPlayerKey(unresolved.Guid, unresolved.Realm));
        }
    }
}

public sealed record RatedArenaGames(
    DateTimeOffset SeasonStart,
    int LastMatchId,
    DateTimeOffset? LastMatchStart,
    int MatchCount,
    IReadOnlyList<RatedArenaPlayer> Players,
    IReadOnlyList<UnresolvedArenaPlayer>? UnresolvedPlayers = null
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

public sealed record UnresolvedArenaPlayer(
    int Guid,
    string Realm,
    int Spec,
    int Games,
    int Wins,
    int Losses,
    int Rating,
    int FirstMatchId,
    int LastMatchId
);
