using System.Text.Json;
using Tauri.Core.Helpers;

namespace BattlegroundCollector;

/// <summary>
/// Resolves historical arena member GUIDs to the character that owns their season record now.
/// Character transfers and restorations can change a GUID while the official ladder keeps one
/// continuous win/loss record. Old match members then remain readable, but their character data
/// is empty.
/// </summary>
public sealed class ArenaCharacterIdentityMap
{
    public const string FileName = "arena-character-identities.json";

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    private readonly IReadOnlyDictionary<string, ArenaCharacterIdentity> _bySource;

    private ArenaCharacterIdentityMap(
        IReadOnlyDictionary<string, ArenaCharacterIdentity> bySource
    ) => _bySource = bySource;

    public static async Task<ArenaCharacterIdentityMap> LoadAsync(
        string path,
        CancellationToken cancellationToken
    )
    {
        if (!File.Exists(path))
        {
            return new ArenaCharacterIdentityMap(
                new Dictionary<string, ArenaCharacterIdentity>(StringComparer.OrdinalIgnoreCase)
            );
        }

        await using var stream = File.OpenRead(path);
        var file = await JsonSerializer.DeserializeAsync<ArenaCharacterIdentityFile>(
            stream,
            JsonOptions,
            cancellationToken
        );
        var identities = new Dictionary<string, ArenaCharacterIdentity>(
            StringComparer.OrdinalIgnoreCase
        );

        foreach (var alias in file?.Aliases ?? [])
        {
            var sourceRealm = NormalizeRealm(alias.Realm);
            var canonicalRealm = NormalizeRealm(alias.CanonicalRealm);
            if (
                alias.SourceGuid <= 0
                || alias.CanonicalGuid <= 0
                || sourceRealm.Length == 0
                || canonicalRealm.Length == 0
                || string.IsNullOrWhiteSpace(alias.Name)
                || alias.Class <= 0
            )
            {
                throw new InvalidDataException(
                    $"Invalid arena character identity in {path}: source GUID {alias.SourceGuid}."
                );
            }

            var identity = new ArenaCharacterIdentity(
                alias.CanonicalGuid,
                canonicalRealm,
                alias.Name.Trim(),
                alias.Class
            );
            if (!identities.TryAdd(GetKey(alias.SourceGuid, sourceRealm), identity))
            {
                throw new InvalidDataException(
                    $"Duplicate arena character identity in {path}: {sourceRealm}|{alias.SourceGuid}."
                );
            }
        }

        return new ArenaCharacterIdentityMap(identities);
    }

    public bool TryResolve(
        int sourceGuid,
        string sourceRealm,
        out ArenaCharacterIdentity identity
    ) => _bySource.TryGetValue(GetKey(sourceGuid, NormalizeRealm(sourceRealm)), out identity!);

    private static string GetKey(int guid, string realm) => $"{realm}|{guid}";

    private static string NormalizeRealm(string? realm) =>
        CharacterHelpers.TryResolveRealm(realm, out _, out var displayRealm)
            ? displayRealm
            : realm?.Trim() ?? string.Empty;
}

public sealed record ArenaCharacterIdentity(int Guid, string Realm, string Name, int Class);

public sealed record ArenaCharacterAlias(
    int SourceGuid,
    string Realm,
    int CanonicalGuid,
    string CanonicalRealm,
    string Name,
    int Class
);

public sealed record ArenaCharacterIdentityFile(IReadOnlyList<ArenaCharacterAlias>? Aliases);
