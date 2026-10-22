using System.Globalization;
using System.Net;
using System.Text.RegularExpressions;

namespace RaidLogExporter;

public interface IRaidSpellTooltipSource
{
    Task<RaidSpellTooltip?> LoadAsync(int spellId, CancellationToken cancellationToken);
}

public sealed partial class TauriShootSpellTooltipSource : IRaidSpellTooltipSource, IDisposable
{
    private const string BaseUrl = "https://legion-shoot.tauri.hu/";
    private const string DescriptionStart = "<span class=\"q\">";
    private readonly HttpClient _httpClient = new() { Timeout = TimeSpan.FromSeconds(30) };

    public async Task<RaidSpellTooltip?> LoadAsync(int spellId, CancellationToken cancellationToken)
    {
        try
        {
            var script = await _httpClient.GetStringAsync(
                $"{BaseUrl}ajax/ajax.php?spell={spellId}&power2",
                cancellationToken
            );
            return ParsePower(script, spellId);
        }
        catch (Exception error)
            when (error is HttpRequestException or IOException
                || error is TaskCanceledException && !cancellationToken.IsCancellationRequested
            )
        {
            Console.Error.WriteLine($"[TauriShoot] Spell {spellId} unavailable: {error.Message}");
            return null;
        }
    }

    public static RaidSpellTooltip? ParsePower(string script, int spellId)
    {
        var tooltip = TooltipLiteral().Match(script);
        if (!tooltip.Success)
        {
            return null;
        }

        var html = UnescapeScriptString(tooltip.Groups[1].Value);
        var descriptionStart = html.IndexOf(DescriptionStart, StringComparison.Ordinal);
        if (descriptionStart < 0)
        {
            return null;
        }

        return new RaidSpellTooltip(
            spellId,
            ReadDetails(html[..descriptionStart]),
            CleanDescription(ToText(html[(descriptionStart + DescriptionStart.Length)..]))
        );
    }

    public static IReadOnlyList<string> ReadDetails(string headerHtml)
    {
        var details = DetailBreak()
            .Split(SpellName().Replace(headerHtml, "", 1))
            .Select(ToText)
            .Where(detail => KeptDetail().IsMatch(detail))
            .ToList();
        return details is ["Instant"] ? [] : details;
    }

    public static string CleanDescription(string text)
    {
        var cleaned = StatAmount().Replace(text, "$1");
        cleaned = ZeroHealAmount().Replace(cleaned, "");
        cleaned = ZeroRating().Replace(cleaned, " ");
        cleaned = SignedReduction().Replace(cleaned, "$1 ");
        return Unresolved().IsMatch(cleaned) ? "" : cleaned;
    }

    private static string ToText(string html)
    {
        var text = WebUtility.HtmlDecode(Tag().Replace(LineBreak().Replace(html, "\n"), ""));
        var lines = text.Split('\n').Select(line => Whitespace().Replace(line, " ").Trim());
        return BlankLines().Replace(string.Join('\n', lines), "\n\n").Trim();
    }

    private static string UnescapeScriptString(string literal) =>
        ScriptEscape()
            .Replace(
                literal,
                escape =>
                    escape.Groups[1].Value switch
                    {
                        { Length: 5 } code => (
                            (char)
                                int.Parse(
                                    code.AsSpan(1),
                                    NumberStyles.HexNumber,
                                    CultureInfo.InvariantCulture
                                )
                        ).ToString(),
                        "n" => "\n",
                        "t" => "\t",
                        "r" => "\r",
                        var other => other,
                    }
            );

    [GeneratedRegex(@"tooltip_enus: '((?:[^'\\]|\\.)*)'", RegexOptions.Singleline)]
    private static partial Regex TooltipLiteral();

    [GeneratedRegex(@"\\(u[0-9a-fA-F]{4}|.)", RegexOptions.Singleline)]
    private static partial Regex ScriptEscape();

    [GeneratedRegex("<b>.*?</b>", RegexOptions.Singleline | RegexOptions.IgnoreCase)]
    private static partial Regex SpellName();

    [GeneratedRegex(@"<br\s*/?>|</td>|</th>|</tr>", RegexOptions.IgnoreCase)]
    private static partial Regex DetailBreak();

    [GeneratedRegex(
        @"^(?:\d+ yd range|Instant|Channeled|[\d.]+ sec cast|(?:[2-9]|[1-9]\d+)(?:\.\d+)? sec cooldown|[\d.]+ min cooldown)$"
    )]
    private static partial Regex KeptDetail();

    [GeneratedRegex(@"<br\s*/?>", RegexOptions.IgnoreCase)]
    private static partial Regex LineBreak();

    [GeneratedRegex("<[^>]*>")]
    private static partial Regex Tag();

    [GeneratedRegex(@"\s+")]
    private static partial Regex Whitespace();

    [GeneratedRegex(@"\n{3,}")]
    private static partial Regex BlankLines();

    [GeneratedRegex(@"\b(?:up to )?\d[\d,]*(?:\.\d+)? ((?:[A-Z][a-z]+ )?(?:damage|healing)\b)")]
    private static partial Regex StatAmount();

    [GeneratedRegex(" for 0(?=[.,]| and )")]
    private static partial Regex ZeroHealAmount();

    [GeneratedRegex(" by 0 (?=for )")]
    private static partial Regex ZeroRating();

    [GeneratedRegex(@"\b(by|take|costs?|in|additional) -(?=\d)")]
    private static partial Regex SignedReduction();

    [GeneratedRegex(
        @"\$|(?<![\d.,])0(?![\d.,]*\d)|sec\d|(?<!\d)%|(?<![\d\w])-\d|\d{4,}%|\d\.\d+\.\d|\.\d{4,}"
    )]
    private static partial Regex Unresolved();

    public void Dispose() => _httpClient.Dispose();
}
