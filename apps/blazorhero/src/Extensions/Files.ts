// The original's wwwroot/js/file.js ("Download", called through IJSRuntime) and the byte[] it read from an
// IBrowserFile: plain DOM in TypeScript, no interop.

/** Saves base64 `data` as a file: what the original's `Download` did with the API's export. */
export function downloadBase64(data: string, fileName: string, mimeType: string): void {
    const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

/** A file's bytes in base64 — a byte[] as System.Text.Json writes it. */
export async function toBase64(file: Blob): Promise<string> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let index = 0; index < bytes.length; index += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    }
    return btoa(binary);
}

/** The extension of a file name, with its dot (Path.GetExtension): ".xlsx", or "" without one. */
export function extensionOf(fileName: string): string {
    const dot = fileName.lastIndexOf(".");
    return dot > 0 ? fileName.slice(dot) : "";
}

/** `DateTime.Now:ddMMyyyyHHmmss`, the export's file name stamp. */
export function fileStamp(now = new Date()): string {
    const two = (value: number) => String(value).padStart(2, "0");
    return `${two(now.getDate())}${two(now.getMonth() + 1)}${now.getFullYear()}${two(now.getHours())}${two(now.getMinutes())}${two(now.getSeconds())}`;
}
