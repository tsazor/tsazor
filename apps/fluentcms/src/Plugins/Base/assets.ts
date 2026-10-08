import type { FileUploadConfig, FolderDetailResponse } from "../../api/models";

/** A file or a folder as one row of a list (FluentCMS's AssetDetail). */
export interface AssetDetail {
    id: string;
    name: string;
    contentType?: string | null;
    size?: number | null;
    path?: string | null;
    isFolder: boolean;
    parentId?: string | null;
    /** The "(parent)" row that leads one folder up. */
    isParentFolder?: boolean;
}

/** FluentCMS's upload limits when the global settings name none: any type, 5 files of 5 MB. */
export const DEFAULT_UPLOAD_CONFIG: FileUploadConfig = { allowedExtensions: "*", maxCount: 5, maxSize: 1024 * 1024 * 5 };

/**
 * A folder's rows: "(parent)" unless it is the root, then its folders, then its files (unless
 * `hideFiles`, as in the folder picker).
 */
export function folderAssets(folder: FolderDetailResponse, rootFolderId: string | undefined, hideFiles = false): AssetDetail[] {
    const items: AssetDetail[] = [];
    if (folder.id !== rootFolderId && folder.parentId) {
        items.push({ id: folder.parentId, name: "(parent)", isFolder: true, isParentFolder: true });
    }
    for (const child of folder.folders ?? []) {
        items.push({ id: child.id, name: child.name ?? "", isFolder: true, parentId: child.parentId, size: child.size });
    }
    if (!hideFiles) {
        for (const file of folder.files ?? []) {
            items.push({
                id: file.id,
                name: file.name ?? "",
                isFolder: false,
                parentId: file.folderId,
                path: file.path,
                size: file.size,
                contentType: file.contentType,
            });
        }
    }
    return items;
}

/** The icon of a row: one folder up, a folder, an image, or any other file. */
export function assetIcon(item: AssetDetail): "folder-up" | "folder" | "image" | "document" {
    if (item.isParentFolder) return "folder-up";
    if (item.isFolder) return "folder";
    return item.contentType?.startsWith("image/") ? "image" : "document";
}

/** A size as FluentCMS shows it: whole MB, KB or bytes; "..." for none. */
export function humanizeFileSize(size: number | null | undefined): string {
    if (!size) return "...";
    if (size > 1024 * 1024) return `${Math.floor(size / (1024 * 1024))} MB`;
    if (size > 1024) return `${Math.floor(size / 1024)} KB`;
    return `${size} Bytes`;
}

/**
 * Where a file is served: the folder names from the root (`files`) down, then the file's name. The
 * site serves `/files/**` (the BFF passes it on to FluentCMS).
 */
export function downloadUrl(parentFolders: readonly FolderDetailResponse[], file: AssetDetail): string {
    return `/${[...parentFolders.map((folder) => folder.name ?? ""), file.name].map(encodeURIComponent).join("/")}`;
}

/** A file name split at its last dot: rename edits the name, the extension stays. */
export function splitExtension(name: string): { name: string; extension: string } {
    const dot = name.lastIndexOf(".");
    return dot > 0 ? { name: name.slice(0, dot), extension: name.slice(dot) } : { name, extension: "" };
}

/**
 * Why the chosen files can't be uploaded, or undefined when they can: FluentCMS's limits (Blazor's
 * `GetMultipleFiles(maxCount)` and `OpenReadStream(maxSize)` throw on them).
 */
export function uploadProblem(files: readonly File[], config: FileUploadConfig): string | undefined {
    if (files.length === 0) return "Choose at least one file.";
    if (files.length > config.maxCount) return `Choose at most ${config.maxCount} files; ${files.length} were chosen.`;
    const tooBig = files.find((file) => file.size > config.maxSize);
    if (tooBig) return `"${tooBig.name}" is larger than ${humanizeFileSize(config.maxSize)}.`;
    return undefined;
}
