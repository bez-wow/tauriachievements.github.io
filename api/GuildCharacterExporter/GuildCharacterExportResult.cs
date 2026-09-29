namespace GuildCharacterExporter;

public sealed record GuildCharacterExportResult(
    int GuildCount,
    int CharacterCount,
    int RetryGuildCount,
    int DeadGuildCount,
    int PrunedGuildCount,
    string OutputPath,
    string RetryOutputPath,
    bool UsedRetryInput
);
