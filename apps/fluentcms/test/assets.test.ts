import { describe, expect, it } from "vitest";
import { FolderDetailResponse } from "../src/api/models";
import {
    DEFAULT_UPLOAD_CONFIG,
    assetIcon,
    downloadUrl,
    folderAssets,
    humanizeFileSize,
    splitExtension,
    uploadProblem,
} from "../src/Plugins/Base/assets";

function folder(fields: Partial<FolderDetailResponse>): FolderDetailResponse {
    return Object.assign(new FolderDetailResponse(), fields);
}

describe("a folder's rows (FluentCMS's FilesTable)", () => {
    const images = folder({
        id: "images",
        name: "images",
        parentId: "root",
        folders: [folder({ id: "icons", name: "icons", parentId: "images", size: 2048 })],
        files: [
            { id: "f1", name: "logo.png", folderId: "images", size: 1951, contentType: "image/png", siteId: "s", createdAt: "" },
        ],
    });

    it("leads one folder up, then lists the folders, then the files", () => {
        const rows = folderAssets(images, "root");
        expect(rows.map((row) => row.name)).toEqual(["(parent)", "icons", "logo.png"]);
        expect(rows[0]).toMatchObject({ id: "root", isFolder: true, isParentFolder: true });
        expect(rows[2]).toMatchObject({ isFolder: false, contentType: "image/png", size: 1951 });
    });

    it("has no way up from the root, and no files in the folder picker", () => {
        expect(folderAssets(folder({ id: "root", name: "files", parentId: null }), "root")).toEqual([]);
        expect(folderAssets(images, "root", true).map((row) => row.name)).toEqual(["(parent)", "icons"]);
    });

    it("picks an icon per row", () => {
        const [parent, icons, logo] = folderAssets(images, "root");
        expect([parent, icons, logo].map((row) => assetIcon(row!))).toEqual(["folder-up", "folder", "image"]);
        expect(assetIcon({ id: "x", name: "a.pdf", isFolder: false, contentType: "application/pdf" })).toBe("document");
    });
});

describe("file sizes, names and URLs", () => {
    it("shows whole MB, KB or bytes, and ... for none", () => {
        expect(humanizeFileSize(5 * 1024 * 1024 + 1)).toBe("5 MB");
        expect(humanizeFileSize(484_817)).toBe("473 KB");
        expect(humanizeFileSize(1024)).toBe("1024 Bytes");
        expect(humanizeFileSize(0)).toBe("...");
        expect(humanizeFileSize(null)).toBe("...");
    });

    it("keeps the extension out of the name a rename edits", () => {
        expect(splitExtension("logo.final.png")).toEqual({ name: "logo.final", extension: ".png" });
        expect(splitExtension("README")).toEqual({ name: "README", extension: "" });
    });

    it("serves a file under its folders' names", () => {
        const parents = [folder({ id: "root", name: "files" }), folder({ id: "images", name: "my images" })];
        expect(downloadUrl(parents, { id: "f1", name: "logo.png", isFolder: false })).toBe("/files/my%20images/logo.png");
    });
});

describe("the upload limits", () => {
    const file = (name: string, size: number) => new File([new Uint8Array(size)], name);

    it("takes up to maxCount files of up to maxSize", () => {
        expect(uploadProblem([file("a.txt", 10)], DEFAULT_UPLOAD_CONFIG)).toBeUndefined();
        expect(uploadProblem([], DEFAULT_UPLOAD_CONFIG)).toBe("Choose at least one file.");
        expect(uploadProblem(["a", "b", "c"].map((name) => file(name, 1)), { ...DEFAULT_UPLOAD_CONFIG, maxCount: 2 })).toBe(
            "Choose at most 2 files; 3 were chosen.",
        );
        expect(uploadProblem([file("big.bin", 2048)], { ...DEFAULT_UPLOAD_CONFIG, maxSize: 1500 })).toBe('"big.bin" is larger than 1 KB.');
    });
});
