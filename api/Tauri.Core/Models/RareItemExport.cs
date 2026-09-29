namespace Tauri.Core.Models;

public sealed record RareItemExport(
    DateTimeOffset GeneratedAt,
    IReadOnlyList<RareItemDefinition> Items,
    IReadOnlyList<CharacterRareItemEntry> Characters
);

public sealed record RareItemDefinition(int Id, string Name);

public sealed record CharacterRareItemEntry(
    string Name,
    string Realm,
    int Race,
    int Gender,
    int Class,
    string Guild,
    IReadOnlyList<RareItemDefinition> Items
);
