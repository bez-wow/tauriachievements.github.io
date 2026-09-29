using Tauri.Core.Infrastructure;

namespace Tauri.Core.Tests;

public sealed class AtomicFileTests : IDisposable
{
    private readonly string _directory = Path.Combine(
        Path.GetTempPath(),
        $"atomic-file-tests-{Guid.NewGuid():N}"
    );

    [Fact]
    public async Task WriteLinesAsync_CreatesDirectoryAndLeavesNoTempFile()
    {
        var path = Path.Combine(_directory, "nested", "out.txt");

        await AtomicFile.WriteLinesAsync(path, ["a", "b"], CancellationToken.None);

        Assert.Equal(
            "a" + Environment.NewLine + "b" + Environment.NewLine,
            await File.ReadAllTextAsync(path)
        );
        Assert.False(File.Exists(path + ".tmp"));
    }

    [Fact]
    public async Task WriteAsync_WriterThrows_KeepsPreviousContentAndRemovesTempFile()
    {
        var path = Path.Combine(_directory, "out.txt");
        await AtomicFile.WriteTextAsync(path, "previous", CancellationToken.None);

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            AtomicFile.WriteAsync(
                path,
                async (stream, token) =>
                {
                    await stream.WriteAsync("partial"u8.ToArray(), token);
                    throw new InvalidOperationException("boom");
                },
                CancellationToken.None
            )
        );

        Assert.Equal("previous", await File.ReadAllTextAsync(path));
        Assert.False(File.Exists(path + ".tmp"));
    }

    public void Dispose()
    {
        if (Directory.Exists(_directory))
        {
            Directory.Delete(_directory, recursive: true);
        }
    }
}
