using System.Text;
using System.Text.Json;

namespace Tauri.Core.Infrastructure;

/// <summary>
/// Writes files atomically: content goes to a sibling ".tmp" file that is renamed over the
/// target only once it is complete, so readers never observe a half-written file and an
/// interrupted run leaves the previous version in place.
/// </summary>
public static class AtomicFile
{
    public static readonly UTF8Encoding Utf8NoBom = new(encoderShouldEmitUTF8Identifier: false);

    private const int BufferSize = 64 * 1024;

    public static async Task WriteAsync(
        string path,
        Func<Stream, CancellationToken, Task> write,
        CancellationToken cancellationToken
    )
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(path);
        ArgumentNullException.ThrowIfNull(write);

        var fullPath = Path.GetFullPath(path);
        var directory = Path.GetDirectoryName(fullPath);
        if (!string.IsNullOrWhiteSpace(directory))
        {
            Directory.CreateDirectory(directory);
        }

        var tempPath = fullPath + ".tmp";

        try
        {
            await using (
                var stream = new FileStream(
                    tempPath,
                    FileMode.Create,
                    FileAccess.Write,
                    FileShare.None,
                    BufferSize,
                    useAsync: true
                )
            )
            {
                await write(stream, cancellationToken);
            }

            File.Move(tempPath, fullPath, overwrite: true);
        }
        finally
        {
            if (File.Exists(tempPath))
            {
                File.Delete(tempPath);
            }
        }
    }

    public static Task WriteTextAsync(
        string path,
        string content,
        CancellationToken cancellationToken
    ) =>
        WriteAsync(
            path,
            async (stream, token) =>
            {
                await using var writer = new StreamWriter(stream, Utf8NoBom);
                await writer.WriteAsync(content.AsMemory(), token);
            },
            cancellationToken
        );

    public static Task WriteLinesAsync(
        string path,
        IEnumerable<string> lines,
        CancellationToken cancellationToken
    ) =>
        WriteAsync(
            path,
            async (stream, token) =>
            {
                await using var writer = new StreamWriter(stream, Utf8NoBom);
                foreach (var line in lines)
                {
                    token.ThrowIfCancellationRequested();
                    await writer.WriteLineAsync(line.AsMemory(), token);
                }
            },
            cancellationToken
        );

    public static Task WriteJsonAsync<T>(
        string path,
        T value,
        JsonSerializerOptions options,
        CancellationToken cancellationToken
    ) =>
        WriteAsync(
            path,
            (stream, token) => JsonSerializer.SerializeAsync(stream, value, options, token),
            cancellationToken
        );
}
