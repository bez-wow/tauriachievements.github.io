using System.Xml;
using System.Xml.Linq;

namespace RaidLogExporter;

public interface IRaidItemSource
{
    /// <summary>The item's name, quality and icon, or null when they could not be read.</summary>
    Task<RaidItem?> LoadAsync(int itemId, CancellationToken cancellationToken);
}

/// <summary>Reads item names, qualities and icons from TauriShoot's <c>?item=&lt;id&gt;&amp;xml</c>.</summary>
public sealed class TauriShootItemSource : IRaidItemSource, IDisposable
{
    private const string BaseUrl = "https://legion-shoot.tauri.hu/";
    private readonly HttpClient _httpClient = new() { Timeout = TimeSpan.FromSeconds(30) };

    public async Task<RaidItem?> LoadAsync(int itemId, CancellationToken cancellationToken)
    {
        try
        {
            var xml = await _httpClient.GetStringAsync(
                $"{BaseUrl}?item={itemId}&xml",
                cancellationToken
            );
            return ParseTooltipXml(xml, itemId);
        }
        catch (Exception error)
            when (error is HttpRequestException or IOException or XmlException
                || error is TaskCanceledException && !cancellationToken.IsCancellationRequested
            )
        {
            Console.Error.WriteLine($"[TauriShoot] Item {itemId} unavailable: {error.Message}");
            return null;
        }
    }

    public static RaidItem? ParseTooltipXml(string xml, int itemId)
    {
        var item = XDocument.Parse(xml).Root?.Element("item");
        var name = item?.Element("name")?.Value.Trim();
        if (item is null || string.IsNullOrWhiteSpace(name))
        {
            return null;
        }

        var quality = int.TryParse(
            item.Element("quality")?.Attribute("id")?.Value,
            out var parsedQuality
        )
            ? Math.Clamp(parsedQuality, 0, 7)
            : 1;
        return new RaidItem(itemId, name, quality, item.Element("icon")?.Value.Trim() ?? "");
    }

    public void Dispose() => _httpClient.Dispose();
}
