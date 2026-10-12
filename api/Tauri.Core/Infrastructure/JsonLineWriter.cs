using System.Buffers;
using System.Text.Json;

namespace Tauri.Core.Infrastructure;

/// <summary>
/// Writes one array element on a line of its own, so git can store a data file's daily
/// changes as small deltas. The element is rendered by a scratch writer and handed over as a
/// raw value, so the outer writer still places the commas.
/// </summary>
public sealed class JsonLineWriter
{
    private static readonly byte[] NewLine = "\n"u8.ToArray();

    private readonly ArrayBufferWriter<byte> _buffer = new();
    private readonly Utf8JsonWriter _itemWriter;

    public JsonLineWriter(JsonWriterOptions options)
    {
        _itemWriter = new Utf8JsonWriter(_buffer, options);
    }

    public void WriteTo(Utf8JsonWriter writer, Action<Utf8JsonWriter> writeItem)
    {
        _buffer.ResetWrittenCount();
        _buffer.Write(NewLine);
        _itemWriter.Reset(_buffer);
        writeItem(_itemWriter);
        _itemWriter.Flush();
        writer.WriteRawValue(_buffer.WrittenSpan, skipInputValidation: true);
    }

    /// <summary>Keeps a large file's pending output bounded while it is written.</summary>
    public static async Task FlushIfLargeAsync(
        Utf8JsonWriter writer,
        CancellationToken cancellationToken
    )
    {
        if (writer.BytesPending > 64 * 1024)
        {
            await writer.FlushAsync(cancellationToken);
        }
    }
}
