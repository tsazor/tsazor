import { describe, expect, it } from "vitest";
import {
  fileUploadLabelsFrom,
  formatFileSize,
  runFileUpload,
  type FileUploadCallbacks,
  type FileUploadErrorEventArgs,
  type FileUploadEventArgs,
  type FileUploadOptions,
} from "../src/file-upload.js";
import { englishLibraryTexts } from "../src/library-texts.js";

const fileUploadLabels = fileUploadLabelsFrom(englishLibraryTexts);

const file = (name: string, size: number) => new File([new Uint8Array(size).map((_, index) => index % 256)], name, { type: "text/plain" });

const options = (overrides: Partial<FileUploadOptions> = {}): FileUploadOptions => ({
  maximumFileCount: 10,
  maximumFileSize: 1000,
  bufferSize: 100,
  mode: "buffer",
  labels: fileUploadLabels,
  ...overrides,
});

/** Callbacks that record what a run tells. */
function recorder(extra: Partial<FileUploadCallbacks> = {}) {
  const log = {
    progress: [] as [number, string][],
    changes: [] as number[],
    uploaded: [] as FileUploadEventArgs[],
    errors: [] as FileUploadErrorEventArgs[],
    completed: undefined as FileUploadEventArgs[] | undefined,
  };
  const callbacks: FileUploadCallbacks = {
    progress: (percent, title) => void log.progress.push([percent, title]),
    progressChange: (args) => void log.changes.push(args.progressPercent),
    fileUploaded: (args) => void log.uploaded.push(args),
    fileError: (error) => void log.errors.push(error),
    completed: (files) => void (log.completed = files),
    ...extra,
  };
  return { log, callbacks };
}

describe("runFileUpload", () => {
  it("buffer: reads each file in chunks, with the progress over all of them, and hands over the whole file", async () => {
    const { log, callbacks } = recorder();
    const done = await runFileUpload([file("a.txt", 250), file("b.txt", 250)], options(), callbacks);
    expect(log.changes).toEqual([20, 40, 50, 70, 90, 100]);
    expect(log.uploaded.map((args) => [args.name, args.buffer?.length, args.index])).toEqual([["a.txt", 250, 0], ["b.txt", 250, 1]]);
    expect(log.uploaded[0]!.buffer![249]).toBe(249);
    expect(log.uploaded[0]!.allFiles).toEqual([{ name: "a.txt", size: 250, contentType: "text/plain" }, { name: "b.txt", size: 250, contentType: "text/plain" }]);
    expect(log.progress[0]).toEqual([0, "Loading..."]);
    expect(log.progress).toContainEqual([20, "Loading 1/2 - a.txt"]);
    expect(log.progress.at(-1)).toEqual([100, "Completed"]);
    expect(log.completed).toBe(done);
    expect(done).toHaveLength(2);
  });

  it("stream: hands each file over as it is", async () => {
    const { log, callbacks } = recorder();
    await runFileUpload([file("a.txt", 300)], options({ mode: "stream" }), callbacks);
    expect(log.uploaded[0]!.buffer).toBeUndefined();
    expect(log.uploaded[0]!.file.size).toBe(300);
    expect(log.progress.map(([percent]) => percent)).toEqual([0, 50, 100, 100]);
  });

  it("an upload function sends each file, reports its bytes and gives its result", async () => {
    const { log, callbacks } = recorder();
    const sent: string[] = [];
    await runFileUpload([file("a.txt", 200), file("b.txt", 200)], options({
      upload: async (chosen, progress) => {
        progress(chosen.size / 2);
        await Promise.resolve();
        sent.push(chosen.name);
        return `stored ${chosen.name}`;
      },
    }), callbacks);
    expect(sent).toEqual(["a.txt", "b.txt"]);
    expect(log.uploaded.map((args) => args.result)).toEqual(["stored a.txt", "stored b.txt"]);
    expect(log.progress.map(([percent]) => percent)).toEqual([0, 25, 50, 75, 100, 100]);
  });

  it("too many files: one error, nothing read", async () => {
    const { log, callbacks } = recorder();
    const done = await runFileUpload([file("a", 1), file("b", 1), file("c", 1)], options({ maximumFileCount: 2 }), callbacks);
    expect(done).toEqual([]);
    expect(log.errors).toEqual([{ errorCode: "file-count-exceeded", errorMessage: "The maximum number of files has been exceeded.", fileCount: 3 }]);
    expect(log.uploaded).toEqual([]);
  });

  it("a file too large is skipped with an error; a failed upload too", async () => {
    const { log, callbacks } = recorder();
    const done = await runFileUpload([file("big.txt", 2000), file("bad.txt", 10), file("ok.txt", 10)], options({
      upload: async (chosen) => {
        if (chosen.name === "bad.txt") throw new Error("Server said no");
        return "ok";
      },
    }), callbacks);
    expect(log.errors.map((error) => [error.errorCode, error.fileName])).toEqual([["maximum-size-reached", "big.txt"], ["upload-failed", "bad.txt"]]);
    expect(done.map((args) => args.errorMessage)).toEqual(["The maximum size allowed is reached", "Server said no", undefined]);
    expect(log.uploaded.map((args) => args.name)).toEqual(["ok.txt"]);
  });

  it("isCancelled stops the run after the file", async () => {
    const { log, callbacks } = recorder({
      progressChange: (args) => {
        if (args.index === 0 && args.progressPercent >= 20) args.isCancelled = true;
      },
    });
    const done = await runFileUpload([file("a.txt", 250), file("b.txt", 250)], options(), callbacks);
    expect(done).toHaveLength(1);
    expect(log.uploaded).toEqual([]);
    expect(log.progress.at(-1)).toEqual([100, "Canceled"]);
  });
});

describe("formatFileSize", () => {
  it("in 1024 steps, as the locale writes numbers", () => {
    expect(formatFileSize(980, "en-US")).toBe("980 byte");
    expect(formatFileSize(1536, "en-US")).toBe("1.5 kB");
    expect(formatFileSize(5 * 1024 * 1024, "en-US")).toBe("5 MB");
    expect(formatFileSize(1536, "de-DE")).toBe("1,5 kB");
  });
});
