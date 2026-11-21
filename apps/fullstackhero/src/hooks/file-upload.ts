import {
  finalizeUpload,
  requestUploadUrl,
  type FileAssetDto,
  type RequestUploadUrlInput,
  Visibility,
  type VisibilityValue,
} from "@/api/files";
import { ApiRequestError } from "@/lib/api-client";

// hooks/use-file-upload.ts as a plain class: React's state (`progress`) and refs (the XHR, the cancel flag) are
// fields, and the component that shows the progress observes it (`this.observe(upload)`: a change re-renders it).
// The options are a function, read on every upload, as the hook reads its current props.

export type UploadOptions = {
  ownerType?: string;
  ownerId?: string | null;
  /**
   * Server-side category — must match a key in appsettings Files:Categories (e.g. Image, Document,
   * Archive). Can be a static string OR a function that picks the category per file based on its
   * type/extension, so a single dropzone can accept multiple categories at once.
   */
  category: string | ((file: File) => string);
  visibility?: VisibilityValue;
  /**
   * Optional client-side allowed extensions (lower-case, with leading dot, e.g. [".pdf", ".docx"]).
   * Defense-in-depth: the server enforces this too. When omitted, only the server-side check runs.
   */
  allowedExtensions?: string[];
  /** Optional client-side max bytes for an early reject. Server enforces too. */
  maxBytes?: number;
};

export type UploadProgress = {
  /** File-system name of the upload. */
  fileName: string;
  /** Total bytes the browser will PUT. */
  totalBytes: number;
  /** Bytes the browser has confirmed sent so far. */
  loaded: number;
  /** 0-100, never NaN. */
  percent: number;
  /** Lifecycle of the upload. `done` only after finalize succeeds. */
  status: "preparing" | "uploading" | "finalizing" | "done" | "error";
  /** Server-allocated id, populated after the upload-url call returns. */
  fileAssetId?: string;
  /** Populated when status === "error". */
  error?: string;
  /** Populated when status === "done". */
  fileAsset?: FileAssetDto;
};

const DEFAULT_OPTIONS = {
  ownerType: "MyFiles",
  visibility: Visibility.Private,
} satisfies Partial<UploadOptions>;

/**
 * Orchestrates the three-step presigned-upload protocol:
 *   1. POST /api/v1/files/upload-url  — server mints presigned PUT + reserves a FileAsset row
 *   2. PUT  <uploadUrl>                — browser pushes bytes straight to S3 (RustFS locally) (XHR for progress)
 *   3. POST /api/v1/files/{id}/finalize — server HEADs the object, transitions to Available
 *
 * Progress is reported via the `progress` snapshot — XMLHttpRequest is used (instead of fetch)
 * because the Streams API for `fetch` upload progress is still gated behind flags on most browsers.
 */
export class FileUpload {
  /** Live progress snapshot — observers re-render on every change. */
  progress: UploadProgress | null = null;

  private xhr: XMLHttpRequest | null = null;
  private cancelled = false;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly options: () => UploadOptions) {}

  /** Convenience: true while an upload is mid-flight. */
  get isUploading(): boolean {
    const status = this.progress?.status;
    return status === "preparing" || status === "uploading" || status === "finalizing";
  }

  /** What `observe` calls: a listener for every progress change. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Clear progress so the consumer can re-arm for the next file. */
  reset(): void {
    this.cancelled = false;
    this.xhr = null;
    this.setProgress(() => null);
  }

  /** Cancel an in-flight upload. */
  cancel(): void {
    this.cancelled = true;
    this.xhr?.abort();
  }

  /** Begin a single upload. Resolves with the finalized FileAssetDto, or rejects on failure. */
  async upload(file: File): Promise<FileAssetDto> {
    this.cancelled = false;
    const opts: UploadOptions = { ...DEFAULT_OPTIONS, ...this.options() };

    // ── Client-side guard rails (defense-in-depth) ─────────────
    if (opts.allowedExtensions && opts.allowedExtensions.length > 0) {
      const dot = file.name.lastIndexOf(".");
      const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : "";
      if (!opts.allowedExtensions.includes(ext)) {
        const message = `Extension ${ext || "(none)"} is not allowed.`;
        this.setProgress(() => ({ fileName: file.name, totalBytes: file.size, loaded: 0, percent: 0, status: "error", error: message }));
        throw new Error(message);
      }
    }
    if (opts.maxBytes !== undefined && file.size > opts.maxBytes) {
      const message = `File is ${formatBytes(file.size)}; limit is ${formatBytes(opts.maxBytes)}.`;
      this.setProgress(() => ({ fileName: file.name, totalBytes: file.size, loaded: 0, percent: 0, status: "error", error: message }));
      throw new Error(message);
    }

    this.setProgress(() => ({ fileName: file.name, totalBytes: file.size, loaded: 0, percent: 0, status: "preparing" }));

    // ── Step 1 — mint the presigned URL ─────────────────────────
    const resolvedCategory = typeof opts.category === "function" ? opts.category(file) : opts.category;
    const requestInput: RequestUploadUrlInput = {
      ownerType: opts.ownerType ?? DEFAULT_OPTIONS.ownerType,
      ownerId: opts.ownerId ?? null,
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      visibility: opts.visibility ?? DEFAULT_OPTIONS.visibility,
      category: resolvedCategory,
    };

    let presigned;
    try {
      presigned = await requestUploadUrl(requestInput);
    } catch (e) {
      const message = describeError(e);
      this.setProgress((p) => (p ? { ...p, status: "error", error: message } : null));
      throw e;
    }
    if (this.cancelled) throw new Error("Upload cancelled.");

    this.setProgress((p) => (p ? { ...p, status: "uploading", fileAssetId: presigned.fileAssetId } : null));

    // ── Step 2 — PUT bytes via XHR for progress events ──────────
    try {
      await xhrPut(
        presigned.uploadUrl,
        file,
        presigned.requiredHeaders,
        (loaded, total) => {
          const t = total || file.size;
          this.setProgress((p) =>
            p ? { ...p, loaded, totalBytes: t, percent: t > 0 ? Math.min(99, Math.round((loaded / t) * 100)) : 0 } : null,
          );
        },
        (xhr) => {
          this.xhr = xhr;
        },
      );
    } catch (e) {
      const message = describeError(e);
      this.setProgress((p) => (p ? { ...p, status: "error", error: message } : null));
      throw e instanceof Error ? e : new Error(message);
    }
    if (this.cancelled) throw new Error("Upload cancelled.");

    this.setProgress((p) => (p ? { ...p, status: "finalizing", percent: 99 } : null));

    // ── Step 3 — finalize ──────────────────────────────────────
    let dto: FileAssetDto;
    try {
      dto = await finalizeUpload(presigned.fileAssetId);
    } catch (e) {
      const message = describeError(e);
      this.setProgress((p) => (p ? { ...p, status: "error", error: message } : null));
      throw e;
    }

    this.setProgress((p) => (p ? { ...p, status: "done", percent: 100, fileAsset: dto } : null));
    this.xhr = null;
    return dto;
  }

  /** React's functional `setProgress(p => …)`, then a notification. */
  private setProgress(update: (previous: UploadProgress | null) => UploadProgress | null): void {
    this.progress = update(this.progress);
    for (const listener of [...this.listeners]) listener();
  }
}

function xhrPut(
  url: string,
  body: Blob,
  headers: Record<string, string>,
  onProgress: (loaded: number, total: number) => void,
  hookXhr: (xhr: XMLHttpRequest) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    hookXhr(xhr);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded, e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`PUT failed: ${xhr.status} ${xhr.statusText || ""}`.trim()));
    };
    xhr.onerror = () => reject(new Error("Network error during upload."));
    xhr.onabort = () => reject(new Error("Upload cancelled."));
    xhr.send(body);
  });
}

function describeError(e: unknown): string {
  if (e instanceof ApiRequestError) {
    return e.problem?.detail ?? e.problem?.title ?? e.message;
  }
  if (e instanceof Error) return e.message;
  return "Unknown error";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
