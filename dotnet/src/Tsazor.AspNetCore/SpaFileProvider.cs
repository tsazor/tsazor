using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.FileProviders.Physical;
using Microsoft.Extensions.Primitives;

namespace Tsazor.AspNetCore;

/// <summary>
/// A directory on disk, looked up on every request (D-A3): a build that writes new hashed files, or the directory
/// appearing after the app started, needs no restart. <see cref="PhysicalFileProvider"/> does the lookup, which
/// refuses every path above the root and hides dot files and hidden or system files.
/// </summary>
internal sealed class SpaFileProvider(string root) : IFileProvider
{
    private PhysicalFileProvider? _provider;

    public string Root { get; } = Path.GetFullPath(root);

    private PhysicalFileProvider? Provider
    {
        get
        {
            if (_provider is not null) return _provider;
            if (!Directory.Exists(Root)) return null;
            return _provider = new PhysicalFileProvider(Root, ExclusionFilters.Sensitive);
        }
    }

    public IFileInfo GetFileInfo(string subpath) => Provider?.GetFileInfo(subpath) ?? new NotFoundFileInfo(subpath);

    public IDirectoryContents GetDirectoryContents(string subpath) =>
        Provider?.GetDirectoryContents(subpath) ?? NotFoundDirectoryContents.Singleton;

    public IChangeToken Watch(string filter) => NullChangeToken.Singleton;
}
