using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using Tauri.Core.Infrastructure;

namespace BattlegroundCollector;

public sealed class BattlegroundCollectorService(
    string projectRoot,
    string solutionRoot,
    string frontendSrcDirectory,
    ITauriApiClient apiClient
)
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true,
    };

    private static readonly HashSet<string> ExcludedBattlegroundNames = new(
        StringComparer.OrdinalIgnoreCase
    )
    {
        "Nagrand Arena",
        "Ruins of Lordaeron",
        "The Tiger's Peak",
        "Tol'Viron Arena",
        "Dalaran Sewers",
        "Ashamane's Fall",
    };

    private readonly string _projectRoot = Path.GetFullPath(projectRoot);
    private readonly string _guildsDirectory = GuildListFiles.GetGuildsDirectory(solutionRoot);
    private readonly string _guildlessCharactersPath = GuildListFiles.GetGuildlessCharactersPath(
        solutionRoot
    );
    private readonly string _frontendSrcDirectory = Path.GetFullPath(frontendSrcDirectory);
    private readonly ITauriApiClient _apiClient = apiClient;

    public async Task<BattlegroundCollectionResult> ExecuteAsync(
        BattlegroundCollectorOptions options,
        CancellationToken cancellationToken
    )
    {
        var outputPath = ResolveOutputPath(options.OutputPath);
        var statePath = ResolveStatePath(options.StatePath);
        var ratedOutputPath = Path.Combine(_frontendSrcDirectory, "rated-battlegrounds.json");
        var existingRecords = await LoadExistingRecordsAsync(outputPath, cancellationToken);
        var existingRatedMatches = await LoadExistingRatedMatchesAsync(
            ratedOutputPath,
            cancellationToken
        );
        var existingState = await LoadStateAsync(statePath, cancellationToken);
        var startMatchId = ResolveStartMatchId(options, existingState, statePath);
        var currentMatchId = startMatchId;
        var newRecords = new List<BattlegroundRecord>();
        var newRatedMatches = new List<JsonElement>();
        var newMembers = new List<MatchMember>();
        var scannedMembers = new List<MatchMember>();
        var knownMatchIds = existingRecords
            .Where(record => record.Id > 0)
            .Select(record => record.Id)
            .ToHashSet();
        var knownRecordKeys = existingRecords
            .Select(GetRecordKey)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var knownRatedMatchIds = existingRatedMatches
            .Where(match => match.ValueKind == JsonValueKind.Object)
            .Select(match => ReadInt(match, "matchid"))
            .Where(matchId => matchId > 0)
            .ToHashSet();

        Console.WriteLine(
            $"Scanning battlegrounds on {options.DisplayRealm} from match id {startMatchId}..."
        );

        string stopReason;
        while (true)
        {
            cancellationToken.ThrowIfCancellationRequested();

            var fetchResult = await FetchBattlegroundAsync(
                _apiClient,
                options.ApiRealm,
                currentMatchId,
                cancellationToken
            );

            if (fetchResult.Record is null)
            {
                stopReason = fetchResult.StopReason ?? "No battleground response.";
                Console.WriteLine($"Stopping at match id {currentMatchId}: {stopReason}");
                break;
            }

            // Member collection applies to both battleground and arena matches. Arena maps are
            // excluded only from battlegrounds.json below.
            scannedMembers.AddRange(fetchResult.Members);

            if (IsExcludedBattlegroundName(fetchResult.Record.Name))
            {
                Console.WriteLine(
                    $"  - {fetchResult.Record.Id}: skipping excluded map '{fetchResult.Record.Name}'."
                );
                currentMatchId++;
                continue;
            }

            if (fetchResult.IsRanked && fetchResult.Response is { } ratedResponse)
            {
                if (knownRatedMatchIds.Add(fetchResult.Record.Id))
                {
                    newRatedMatches.Add(ratedResponse.Clone());
                    Console.WriteLine(
                        $"  ★ {fetchResult.Record.Id}: queued complete rated battleground response."
                    );
                }
                else
                {
                    Console.WriteLine(
                        $"  = {fetchResult.Record.Id}: rated battleground already exists in rated-battlegrounds.json."
                    );
                }
            }

            var recordKey = GetRecordKey(fetchResult.Record);
            var isKnownId = fetchResult.Record.Id > 0 && !knownMatchIds.Add(fetchResult.Record.Id);
            var isKnownRecord = !knownRecordKeys.Add(recordKey);
            if (!isKnownId && !isKnownRecord)
            {
                newRecords.Add(fetchResult.Record);
                newMembers.AddRange(fetchResult.Members);
                Console.WriteLine(
                    $"  + {fetchResult.Record.Id}: {fetchResult.Record.Name} at {fetchResult.Record.StartTime}"
                );
            }
            else
            {
                Console.WriteLine($"  = {fetchResult.Record.Id}: already exists in output JSON.");
            }

            currentMatchId++;
        }

        var mergedRecords = MergeRecords(newRecords, existingRecords);
        await WriteJsonAsync(outputPath, mergedRecords, cancellationToken);
        var mergedRatedMatches = existingRatedMatches.Concat(newRatedMatches).ToList();
        if (newRatedMatches.Count > 0 || !File.Exists(ratedOutputPath))
        {
            await WriteJsonAsync(ratedOutputPath, mergedRatedMatches, cancellationToken);
        }
        var newGuildCount = GuildListFiles.AddNewGuilds(
            _guildsDirectory,
            ToSeenCharacters(newMembers)
        );
        GuildListFiles.AddNewGuildlessCharacters(
            _guildlessCharactersPath,
            ToSeenCharacters(scannedMembers)
        );

        var savedState = new BattlegroundCollectorState(
            currentMatchId,
            options.ApiRealm,
            options.DisplayRealm,
            DateTimeOffset.UtcNow,
            stopReason,
            newRecords.Count,
            newRecords.Count == 0 ? null : newRecords.Max(record => record.Id)
        );

        await WriteJsonAsync(statePath, savedState, cancellationToken);

        return new BattlegroundCollectionResult(
            startMatchId,
            currentMatchId,
            newRecords.Count,
            mergedRecords.Count,
            newRatedMatches.Count,
            mergedRatedMatches.Count,
            newGuildCount,
            outputPath,
            ratedOutputPath,
            statePath,
            stopReason
        );
    }

    private static async Task<BattlegroundFetchResult> FetchBattlegroundAsync(
        ITauriApiClient apiClient,
        string apiRealm,
        int matchId,
        CancellationToken cancellationToken
    )
    {
        var result = await apiClient.FetchResponseElementAsync(
            "pvp-match",
            new { r = apiRealm, matchid = matchId.ToString(CultureInfo.InvariantCulture) },
            $"battleground match {matchId} on {apiRealm}",
            cancellationToken
        );

        if (!result.Succeeded || result.ResponseElement is not { } responseElement)
        {
            return BattlegroundFetchResult.Stop(
                $"API request failed: {result.FailureMessage ?? "No response payload."}"
            );
        }

        if (
            responseElement.ValueKind
            is JsonValueKind.Null
                or JsonValueKind.Undefined
                or JsonValueKind.False
        )
        {
            return BattlegroundFetchResult.Stop("Missing response payload.");
        }

        if (responseElement.ValueKind != JsonValueKind.Object)
        {
            return BattlegroundFetchResult.Stop(
                $"Response payload was {responseElement.ValueKind}, not an object."
            );
        }

        var apiMatchId = ReadInt(responseElement, "matchid");
        if (apiMatchId <= 0)
        {
            apiMatchId = matchId;
        }

        var startTimeUnix = ReadLong(responseElement, "starttime");
        var mapName = ReadString(responseElement, "mapname");
        if (string.IsNullOrWhiteSpace(mapName) || startTimeUnix <= 0)
        {
            return BattlegroundFetchResult.Stop(
                "Response did not contain complete battleground details."
            );
        }

        var durationMilliseconds = ReadLong(responseElement, "length");
        var record = new BattlegroundRecord(
            apiMatchId,
            mapName,
            FormatUnixTimestamp(startTimeUnix),
            FormatDuration(durationMilliseconds)
        );
        var members = ReadMembers(responseElement);

        return BattlegroundFetchResult.Found(
            record,
            members,
            responseElement,
            ReadBoolean(responseElement, "isranked")
        );
    }

    private int ResolveStartMatchId(
        BattlegroundCollectorOptions options,
        BattlegroundCollectorState? state,
        string statePath
    )
    {
        if (options.StartMatchId is { } explicitStartMatchId)
        {
            return explicitStartMatchId;
        }

        if (state is null || state.NextMatchId <= 0)
        {
            throw new InvalidOperationException(
                $"No saved battleground collector state exists yet. Run once with a start match id, for example: dotnet run --project BattlegroundCollector -- 95874. State path: {statePath}"
            );
        }

        if (!string.Equals(state.ApiRealm, options.ApiRealm, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException(
                $"The saved state is for {state.DisplayRealm}, but this run targets {options.DisplayRealm}. Pass a start match id or use a different --state path."
            );
        }

        return state.NextMatchId;
    }

    private string ResolveOutputPath(string? outputPath)
    {
        if (!string.IsNullOrWhiteSpace(outputPath))
        {
            return Path.GetFullPath(outputPath, _projectRoot);
        }

        return Path.Combine(_frontendSrcDirectory, "battlegrounds.json");
    }

    private string ResolveStatePath(string? statePath)
    {
        if (!string.IsNullOrWhiteSpace(statePath))
        {
            return Path.GetFullPath(statePath, _projectRoot);
        }

        return Path.Combine(_frontendSrcDirectory, "battleground-collector-state.json");
    }

    private static async Task<List<BattlegroundRecord>> LoadExistingRecordsAsync(
        string outputPath,
        CancellationToken cancellationToken
    )
    {
        if (!File.Exists(outputPath))
        {
            return [];
        }

        await using var stream = new FileStream(
            outputPath,
            FileMode.Open,
            FileAccess.Read,
            FileShare.Read,
            64 * 1024,
            useAsync: true
        );

        using var document = await JsonDocument.ParseAsync(
            stream,
            cancellationToken: cancellationToken
        );
        if (document.RootElement.ValueKind != JsonValueKind.Array)
        {
            return [];
        }

        var records = new List<BattlegroundRecord>();
        foreach (var element in document.RootElement.EnumerateArray())
        {
            if (element.ValueKind != JsonValueKind.Object)
            {
                continue;
            }

            var name = ReadString(element, "name", ReadString(element, "bgName"));
            if (string.IsNullOrWhiteSpace(name) || IsExcludedBattlegroundName(name))
            {
                continue;
            }

            var startTime = ReadString(element, "startTime", ReadString(element, "bgStartTime"));
            if (string.IsNullOrWhiteSpace(startTime))
            {
                startTime = FormatUnixTimestamp(ReadLong(element, "bgStartTimeUnix"));
            }

            var duration = ReadDuration(element);

            records.Add(
                new BattlegroundRecord(
                    ReadInt(element, "id", ReadInt(element, "bgId")),
                    name,
                    startTime,
                    duration
                )
            );
        }

        return records;
    }

    private static async Task<BattlegroundCollectorState?> LoadStateAsync(
        string statePath,
        CancellationToken cancellationToken
    )
    {
        if (!File.Exists(statePath))
        {
            return null;
        }

        await using var stream = new FileStream(
            statePath,
            FileMode.Open,
            FileAccess.Read,
            FileShare.Read,
            64 * 1024,
            useAsync: true
        );

        return await JsonSerializer.DeserializeAsync<BattlegroundCollectorState>(
            stream,
            JsonOptions,
            cancellationToken
        );
    }

    private static async Task<List<JsonElement>> LoadExistingRatedMatchesAsync(
        string outputPath,
        CancellationToken cancellationToken
    )
    {
        if (!File.Exists(outputPath))
        {
            return [];
        }

        await using var stream = new FileStream(
            outputPath,
            FileMode.Open,
            FileAccess.Read,
            FileShare.Read,
            64 * 1024,
            useAsync: true
        );
        using var document = await JsonDocument.ParseAsync(
            stream,
            cancellationToken: cancellationToken
        );

        if (document.RootElement.ValueKind != JsonValueKind.Array)
        {
            throw new InvalidDataException(
                $"Rated battleground output must contain a JSON array: {outputPath}"
            );
        }

        return document.RootElement.EnumerateArray().Select(match => match.Clone()).ToList();
    }

    private static List<BattlegroundRecord> MergeRecords(
        IReadOnlyList<BattlegroundRecord> newRecords,
        IReadOnlyList<BattlegroundRecord> existingRecords
    )
    {
        var mergedRecords = new List<BattlegroundRecord>(newRecords.Count + existingRecords.Count);
        var seenMatchIds = new HashSet<int>();
        var seenRecordKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var record in newRecords.OrderByDescending(record => record.Id))
        {
            if (TryAddRecord(record, seenMatchIds, seenRecordKeys))
            {
                mergedRecords.Add(record);
            }
        }

        foreach (var record in existingRecords)
        {
            if (IsExcludedBattlegroundName(record.Name))
            {
                continue;
            }

            if (TryAddRecord(record, seenMatchIds, seenRecordKeys))
            {
                mergedRecords.Add(record);
            }
        }

        return mergedRecords;
    }

    private static Task WriteJsonAsync<T>(
        string outputPath,
        T value,
        CancellationToken cancellationToken
    ) => AtomicFile.WriteJsonAsync(outputPath, value, JsonOptions, cancellationToken);

    private static int ReadInt(JsonElement parent, string propertyName)
    {
        if (!parent.TryGetProperty(propertyName, out var property))
        {
            return 0;
        }

        if (property.ValueKind == JsonValueKind.Number && property.TryGetInt32(out var intValue))
        {
            return intValue;
        }

        return
            property.ValueKind == JsonValueKind.String
            && int.TryParse(
                property.GetString(),
                NumberStyles.Integer,
                CultureInfo.InvariantCulture,
                out intValue
            )
            ? intValue
            : 0;
    }

    private static int ReadInt(JsonElement parent, string propertyName, int fallback)
    {
        var value = ReadInt(parent, propertyName);
        return value == 0 ? fallback : value;
    }

    private static long ReadLong(JsonElement parent, string propertyName)
    {
        if (!parent.TryGetProperty(propertyName, out var property))
        {
            return 0;
        }

        if (property.ValueKind == JsonValueKind.Number && property.TryGetInt64(out var longValue))
        {
            return longValue;
        }

        return
            property.ValueKind == JsonValueKind.String
            && long.TryParse(
                property.GetString(),
                NumberStyles.Integer,
                CultureInfo.InvariantCulture,
                out longValue
            )
            ? longValue
            : 0;
    }

    private static long ReadLong(JsonElement parent, string propertyName, long fallback)
    {
        var value = ReadLong(parent, propertyName);
        return value == 0 ? fallback : value;
    }

    private static string ReadString(JsonElement parent, string propertyName, string fallback = "")
    {
        if (
            !parent.TryGetProperty(propertyName, out var property)
            || property.ValueKind != JsonValueKind.String
        )
        {
            return fallback;
        }

        var value = property.GetString();
        return string.IsNullOrWhiteSpace(value) ? fallback : value.Trim();
    }

    private static bool ReadBoolean(JsonElement parent, string propertyName)
    {
        if (!parent.TryGetProperty(propertyName, out var property))
        {
            return false;
        }

        return property.ValueKind switch
        {
            JsonValueKind.True => true,
            JsonValueKind.String when bool.TryParse(property.GetString(), out var value) => value,
            _ => false,
        };
    }

    private static IEnumerable<SeenCharacter> ToSeenCharacters(IEnumerable<MatchMember> members) =>
        members.Select(member => new SeenCharacter(
            member.CharName,
            member.RealmName,
            member.GuildName
        ));

    private static List<MatchMember> ReadMembers(JsonElement responseElement)
    {
        if (
            !responseElement.TryGetProperty("members", out var membersElement)
            || membersElement.ValueKind != JsonValueKind.Array
        )
        {
            return [];
        }

        var members = new List<MatchMember>();
        foreach (var memberElement in membersElement.EnumerateArray())
        {
            if (
                memberElement.ValueKind != JsonValueKind.Object
                || !memberElement.TryGetProperty("character-minimal-data", out var minimal)
                || minimal.ValueKind != JsonValueKind.Object
            )
            {
                continue;
            }

            var charName = ReadString(minimal, "charname");
            if (string.IsNullOrWhiteSpace(charName))
            {
                continue;
            }

            members.Add(
                new MatchMember(
                    charName,
                    ReadString(minimal, "guildname"),
                    ReadString(memberElement, "realmName")
                )
            );
        }

        return members;
    }

    private static bool TryAddRecord(
        BattlegroundRecord record,
        HashSet<int> seenMatchIds,
        HashSet<string> seenRecordKeys
    )
    {
        var recordKey = GetRecordKey(record);
        if (record.Id > 0)
        {
            if (!seenMatchIds.Add(record.Id))
            {
                return false;
            }

            seenRecordKeys.Add(recordKey);
            return true;
        }

        return seenRecordKeys.Add(recordKey);
    }

    private static string GetRecordKey(BattlegroundRecord record) =>
        $"{record.Name}|{record.StartTime}|{record.Duration}";

    private static bool IsExcludedBattlegroundName(string name) =>
        ExcludedBattlegroundNames.Contains(name.Trim())
        || name.Contains("Arena", StringComparison.OrdinalIgnoreCase);

    private static string ReadDuration(JsonElement element)
    {
        var duration = ReadString(element, "duration", ReadString(element, "bgDurationFormatted"));
        if (
            long.TryParse(
                duration,
                NumberStyles.Integer,
                CultureInfo.InvariantCulture,
                out var durationMilliseconds
            )
        )
        {
            return FormatDuration(durationMilliseconds);
        }

        if (!string.IsNullOrWhiteSpace(duration))
        {
            return duration;
        }

        return FormatDuration(ReadLong(element, "bgDuration"));
    }

    private static string FormatUnixTimestamp(long unixTimestamp)
    {
        if (unixTimestamp <= 0)
        {
            return string.Empty;
        }

        return DateTimeOffset
            .FromUnixTimeSeconds(unixTimestamp)
            .ToLocalTime()
            .ToString("yyyy.MM.dd HH.mm", CultureInfo.InvariantCulture);
    }

    private static string FormatDuration(long durationMilliseconds)
    {
        if (durationMilliseconds <= 0)
        {
            return "00:00:00";
        }

        var duration = TimeSpan.FromMilliseconds(durationMilliseconds);
        return $"{(long)duration.TotalHours:00}:{duration.Minutes:00}:{duration.Seconds:00}";
    }
}

public sealed record BattlegroundRecord(
    [property: JsonIgnore] int Id,
    string Name,
    string StartTime,
    string Duration
);

public sealed record BattlegroundCollectorState(
    int NextMatchId,
    string ApiRealm,
    string DisplayRealm,
    DateTimeOffset LastScanUtc,
    string LastStopReason,
    int LastAddedCount,
    int? LastAddedMatchId
);

public sealed record BattlegroundCollectionResult(
    int StartMatchId,
    int NextMatchId,
    int NewBattlegroundCount,
    int TotalBattlegroundCount,
    int NewRatedBattlegroundCount,
    int TotalRatedBattlegroundCount,
    int NewGuildCount,
    string OutputPath,
    string RatedOutputPath,
    string StatePath,
    string StopReason
);

internal sealed record BattlegroundFetchResult(
    BattlegroundRecord? Record,
    IReadOnlyList<MatchMember> Members,
    JsonElement? Response,
    bool IsRanked,
    string? StopReason
)
{
    public static BattlegroundFetchResult Found(
        BattlegroundRecord record,
        IReadOnlyList<MatchMember> members,
        JsonElement response,
        bool isRanked
    ) => new(record, members, response, isRanked, null);

    public static BattlegroundFetchResult Stop(string reason) => new(null, [], null, false, reason);
}

internal sealed record MatchMember(string CharName, string GuildName, string RealmName);
