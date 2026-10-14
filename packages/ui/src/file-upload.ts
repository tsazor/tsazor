/**
 * The work of a file upload zone (Fluent UI Blazor's FluentInputFile, MudBlazor's MudFileUpload): the files a user
 * chose or dropped, read into memory in chunks (`buffer`), handed over as they are (`stream`), or sent somewhere by an
 * `upload` function, with the progress of all of them, a way to cancel, and errors for too many or too large files.
 */

import { englishLibraryTexts, type LibraryTexts } from "./library-texts.js";

/** How the files are handed over when there is no `upload` function (Fluent UI Blazor's `InputFileMode`). */
export type FileUploadMode = "buffer" | "stream";

/**
 * Sends one file somewhere and reports how many bytes went (`progress`); it stops when `signal` aborts. Its result
 * lands in the file's `result`; a rejection is the file's error. `uploadTo(url)` makes one that posts the file.
 */
export type FileUploader = (file: File, progress: (loaded: number) => void, signal: AbortSignal) => Promise<unknown>;

/** The file whose progress shows, for a `progressTemplate` (Fluent UI Blazor's `ProgressFileDetails`). */
export interface ProgressFileDetails {
  readonly index: number;
  readonly name: string;
  /** 0–100. */
  readonly percentage: number;
}

/** A file in a run (`UploadedFileDetails`). */
export interface UploadedFileDetails {
  readonly name: string;
  readonly size: number;
  readonly contentType: string;
}

/** One file of a run, as the events see it (Fluent UI Blazor's `FluentInputFileEventArgs`). */
export class FileUploadEventArgs {
  /** Set it in onProgressChange or onFileUploaded to stop the run after this file (`IsCancelled`). */
  isCancelled = false;
  /** In buffer mode: the chunk just read (onProgressChange). */
  chunk?: Uint8Array;
  /** In buffer mode: the whole file (onFileUploaded). */
  buffer?: Uint8Array;
  /** What the `upload` function resolved to. */
  result?: unknown;
  /** The run's progress then, 0–100. */
  progressPercent = 0;
  /** The progress text then ("Loading 1/3 - photo.jpg"). */
  progressTitle?: string;
  /** Why the file wasn't handed over (too large, the upload failed). */
  errorMessage?: string;

  constructor(
    /** The file itself (`file.stream()`, `file.arrayBuffer()`, …). */
    readonly file: File,
    /** Its place in the run, from 0. */
    readonly index: number,
    /** Every file of the run. */
    readonly allFiles: readonly UploadedFileDetails[],
  ) {}

  get name(): string {
    return this.file.name;
  }

  get contentType(): string {
    return this.file.type;
  }

  get size(): number {
    return this.file.size;
  }

  /** When the file last changed, in ms since 1970. */
  get lastModified(): number {
    return this.file.lastModified;
  }
}

/** Why a file or a run failed (Fluent UI Blazor's `FluentInputFileErrorEventArgs`). */
export interface FileUploadErrorEventArgs {
  /** What went wrong (Fluent UI Blazor's FileCountExceeded, MaximumSizeReached and UploadFailed). */
  readonly errorCode: "file-count-exceeded" | "maximum-size-reached" | "upload-failed";
  readonly errorMessage: string;
  /** The file concerned. */
  readonly fileName?: string;
  /** How many files were chosen ("file-count-exceeded"). */
  readonly fileCount?: number;
}

/** The progress texts (English by default; Fluent UI Blazor localizes them). */
export interface FileUploadLabels {
  readonly loading: string;
  readonly progress: (number: number, count: number, name: string) => string;
  readonly completed: string;
  readonly canceled: string;
  /** onFileError's message when more files come than maximumFileCount allows. */
  readonly fileCountExceeded?: string;
  /** onFileError's message for a file larger than maximumFileSize. */
  readonly fileSizeExceeded?: string;
}

/** The progress texts from the library texts (`tsazor.ui.fileUpload.*`): `{ ...fileUploadLabelsFrom(t), ...labels }`. */
export function fileUploadLabelsFrom(t: LibraryTexts): FileUploadLabels {
  return {
    loading: t("fileUpload.loading"),
    progress: (number, count, name) => t("fileUpload.progress", { number, count, name }),
    completed: t("fileUpload.completed"),
    canceled: t("fileUpload.canceled"),
    fileCountExceeded: t("fileUpload.fileCountExceeded"),
    fileSizeExceeded: t("fileUpload.fileSizeExceeded"),
  };
}

/** The progress texts in English, Fluent UI Blazor's: what a label the caller left out falls back to. */
const englishFileUploadLabels: FileUploadLabels = fileUploadLabelsFrom(englishLibraryTexts);

/** How a run goes. */
export interface FileUploadOptions {
  readonly maximumFileCount: number;
  readonly maximumFileSize: number;
  /** The chunk size in buffer mode, in bytes. */
  readonly bufferSize: number;
  readonly mode: FileUploadMode;
  readonly upload?: FileUploader;
  readonly labels: FileUploadLabels;
}

/** What a run tells the component, which raises its events and shows the progress. */
export interface FileUploadCallbacks {
  progress(percent: number, title: string, details: ProgressFileDetails): void | Promise<void>;
  progressChange?(args: FileUploadEventArgs): void | Promise<void>;
  fileUploaded?(args: FileUploadEventArgs): void | Promise<void>;
  fileError?(error: FileUploadErrorEventArgs): void | Promise<void>;
  completed?(files: FileUploadEventArgs[]): void | Promise<void>;
}

/**
 * Handles the files of one choice or drop: more than `maximumFileCount` is an error and nothing more; a file larger
 * than `maximumFileSize` is an error and skipped; each other one goes through `upload`, or is read in chunks (buffer)
 * or handed over (stream), with the progress over all of them. A file whose args say `isCancelled` ends the run.
 * Resolves with every file's args, as onCompleted gets them.
 */
export async function runFileUpload(files: readonly File[], options: FileUploadOptions, callbacks: FileUploadCallbacks): Promise<FileUploadEventArgs[]> {
  if (files.length > options.maximumFileCount) {
    await callbacks.fileError?.({
      errorCode: "file-count-exceeded",
      errorMessage: options.labels.fileCountExceeded ?? englishFileUploadLabels.fileCountExceeded!,
      fileCount: files.length,
    });
    return [];
  }
  const labels = options.labels;
  const all = files.map((file) => ({ name: file.name, size: file.size, contentType: file.type }));
  const total = files.reduce((sum, file) => sum + file.size, 0);
  const percent = (bytes: number): number => Math.round((bytes / (total <= 0 ? 1 : total)) * 100);
  const done: FileUploadEventArgs[] = [];
  let read = 0;
  await callbacks.progress(0, labels.loading, { index: 0, name: files[0]?.name ?? "", percentage: 0 });

  for (const [index, file] of files.entries()) {
    const args = new FileUploadEventArgs(file, index, all);
    done.push(args);
    if (file.size > options.maximumFileSize) {
      args.errorMessage = labels.fileSizeExceeded ?? englishFileUploadLabels.fileSizeExceeded!;
      await callbacks.fileError?.({ errorCode: "maximum-size-reached", errorMessage: args.errorMessage, fileName: file.name });
      continue;
    }
    const title = labels.progress(index + 1, files.length, file.name);
    args.progressTitle = title;
    const before = read;
    const report = async (bytes: number): Promise<void> => {
      read = before + Math.min(bytes, file.size);
      args.progressPercent = percent(read);
      await callbacks.progress(args.progressPercent, title, { index, name: file.name, percentage: args.progressPercent });
    };

    if (options.upload !== undefined) {
      const controller = new AbortController();
      try {
        args.result = await options.upload(file, (loaded) => {
          void report(loaded).then(async () => {
            await callbacks.progressChange?.(args);
            if (args.isCancelled) controller.abort();
          });
        }, controller.signal);
        await report(file.size);
      } catch (error) {
        if (args.isCancelled) break;
        args.errorMessage = error instanceof Error ? error.message : String(error);
        await callbacks.fileError?.({ errorCode: "upload-failed", errorMessage: args.errorMessage, fileName: file.name });
        continue;
      }
    } else if (options.mode === "buffer") {
      const whole = new Uint8Array(file.size);
      for (let offset = 0; offset < file.size && !args.isCancelled; offset += options.bufferSize) {
        args.chunk = new Uint8Array(await file.slice(offset, offset + options.bufferSize).arrayBuffer());
        whole.set(args.chunk, offset);
        await report(offset + args.chunk.length);
        await callbacks.progressChange?.(args);
      }
      args.chunk = undefined;
      args.buffer = whole;
    } else {
      // Stream: the file goes as it is; half the progress before, half after.
      await report(Math.floor(file.size / 2));
    }
    if (!args.isCancelled) {
      if (options.mode === "stream" && options.upload === undefined) {
        await callbacks.fileUploaded?.(args);
        await report(file.size);
      } else {
        await callbacks.fileUploaded?.(args);
      }
    }
    if (args.isCancelled) break;
  }

  const canceled = done.some((args) => args.isCancelled);
  const last = done[done.length - 1];
  await callbacks.progress(100, canceled ? labels.canceled : labels.completed, { index: last?.index ?? 0, name: last?.name ?? "", percentage: 100 });
  await callbacks.completed?.(done);
  return done;
}

/** What `uploadFile` resolves to: the response's status and body. */
export interface UploadResponse {
  readonly status: number;
  readonly ok: boolean;
  readonly body: string;
}

/** How `uploadFile` sends a file. */
export interface UploadFileOptions {
  /** POST by default. */
  readonly method?: string;
  /** The form field of the file ("file"). */
  readonly fieldName?: string;
  /** More form fields. */
  readonly data?: Readonly<Record<string, string>>;
  readonly headers?: Readonly<Record<string, string>>;
  /** Sends cookies cross-origin. */
  readonly withCredentials?: boolean;
  /** Bytes sent so far, and of how many. */
  readonly onProgress?: (loaded: number, total: number) => void;
  readonly signal?: AbortSignal;
}

/**
 * Sends a file as multipart/form-data, with its upload progress (an XMLHttpRequest: fetch reports no upload
 * progress). Resolves with the response whatever its status; rejects when the network fails or `signal` aborts.
 */
export function uploadFile(url: string, file: File, options: UploadFileOptions = {}): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(options.method ?? "POST", url);
    request.withCredentials = options.withCredentials ?? false;
    for (const [name, value] of Object.entries(options.headers ?? {})) request.setRequestHeader(name, value);
    request.upload.addEventListener("progress", (event) => options.onProgress?.(event.loaded, event.total));
    request.addEventListener("load", () => resolve({ status: request.status, ok: request.status >= 200 && request.status < 300, body: request.responseText }));
    request.addEventListener("error", () => reject(new Error(`The upload of ${file.name} failed.`)));
    request.addEventListener("abort", () => reject(new DOMException("The upload was aborted.", "AbortError")));
    if (options.signal?.aborted) {
      reject(new DOMException("The upload was aborted.", "AbortError"));
      return;
    }
    options.signal?.addEventListener("abort", () => request.abort(), { once: true });
    const form = new FormData();
    for (const [name, value] of Object.entries(options.data ?? {})) form.append(name, value);
    form.append(options.fieldName ?? "file", file, file.name);
    request.send(form);
  });
}

/** A FileUploader that posts each file to `url` (`uploadFile`); a status other than 2xx fails the file. */
export function uploadTo(url: string, options: Omit<UploadFileOptions, "onProgress" | "signal"> = {}): FileUploader {
  return async (file, progress, signal) => {
    const response = await uploadFile(url, file, { ...options, signal, onProgress: (loaded) => progress(loaded) });
    if (!response.ok) throw new Error(`The upload of ${file.name} failed (${response.status}).`);
    return response;
  };
}

const SIZE_UNITS = ["byte", "kilobyte", "megabyte", "gigabyte", "terabyte"] as const;

/** A file size as people read it, in 1024 steps: "980 byte", "1.5 MB" (Fluent UI Blazor's FileSizeConverter). */
export function formatFileSize(bytes: number, locale?: string): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < SIZE_UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  return new Intl.NumberFormat(locale, { style: "unit", unit: SIZE_UNITS[unit], unitDisplay: "short", maximumFractionDigits: unit === 0 ? 0 : 1 }).format(value);
}
