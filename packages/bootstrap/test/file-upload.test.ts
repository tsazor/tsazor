/** The Bootstrap skin's FileUpload behaves as the Fluent skin's (packages/fluent/test/file-upload.test.ts). */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, type RenderResult } from "@tsazor/testing";
import { ComponentBase, EventCallback, type RenderTreeBuilder } from "@tsazor/runtime";
import type { FileUploadErrorEventArgs, FileUploadEventArgs } from "@tsazor/ui";
import { FileUpload } from "../dist/index.js";

const PREFIX = "tz";

const hosts: RenderResult[] = [];
afterEach(() => {
  for (const host of hosts.splice(0)) host.dispose();
  document.body.innerHTML = "";
});

function hostOf(attrs: Record<string, unknown>) {
  return class Host extends ComponentBase {
    static last: Host | undefined;
    uploaded: FileUploadEventArgs[] = [];
    errors: FileUploadErrorEventArgs[] = [];
    completed?: FileUploadEventArgs[];
    changes: number[] = [];
    percent = 0;
    protected override buildRenderTree(b: RenderTreeBuilder): void {
      Host.last = this;
      b.openElement(0, "button");
      b.addAttribute(1, "id", "pick");
      b.addAttribute(2, "type", "button");
      b.closeElement();
      b.openComponent(3, FileUpload);
      b.addAttribute(4, "onFileUploaded", EventCallback.bind(this, (args: FileUploadEventArgs) => void this.uploaded.push(args)));
      b.addAttribute(5, "onFileError", EventCallback.bind(this, (error: FileUploadErrorEventArgs) => void this.errors.push(error)));
      b.addAttribute(6, "onCompleted", EventCallback.bind(this, (all: FileUploadEventArgs[]) => void (this.completed = all)));
      b.addAttribute(7, "progressPercent", this.percent);
      b.addAttribute(8, "progressPercentChanged", EventCallback.bind(this, (percent: number) => void (this.percent = percent)));
      if (attrs["takeChange"]) b.addAttribute(9, "onInputFileChange", EventCallback.bind(this, (e: { fileCount: number }) => void this.changes.push(e.fileCount)));
      let seq = 10;
      for (const [name, value] of Object.entries(attrs)) if (name !== "takeChange") b.addAttribute(seq++, name, value);
      b.closeComponent();
    }
  };
}

async function mount(attrs: Record<string, unknown> = {}) {
  const Host = hostOf(attrs);
  const result = await render(Host);
  hosts.push(result);
  const root = result.container.querySelector<HTMLElement>(`.${PREFIX}-file-upload`)!;
  const zone = root.querySelector<HTMLElement>("label")!;
  const input = zone.querySelector<HTMLInputElement>("input[type=file]")!;
  return { Host, result, root, zone, input };
}

const file = (name: string, size: number) => new File([new Uint8Array(size)], name, { type: "text/plain" });

/** A drop of `files` on the zone, then the run's end. */
async function drop(zone: HTMLElement, files: File[], result: RenderResult): Promise<void> {
  const event = new Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: { files } });
  zone.dispatchEvent(event);
  await new Promise((resolve) => setTimeout(resolve, 20));
  await result.settle();
}

describe("FileUpload", () => {
  it("is a drop zone that labels a file input, with the progress hidden", async () => {
    const { root, zone, input } = await mount({ accept: ".csv", multiple: true });
    expect(input.accept).toBe(".csv");
    expect(input.multiple).toBe(true);
    expect(zone.textContent!.trim()).toBe("Drop files here, or click to choose");
    expect(root.querySelector(`.${PREFIX}-file-upload__progress`)!.hasAttribute("hidden")).toBe(true);
    // The status is in the page before a run, so its first text is announced.
    expect(root.querySelector("[role=status]")!.textContent).toBe("");
  });

  it("dropped files are read into buffers, with the progress and its text", async () => {
    const { Host, root, zone, result } = await mount({ multiple: true, bufferSize: 100 });
    await drop(zone, [file("a.csv", 250), file("b.csv", 50)], result);
    expect(Host.last!.uploaded.map((args) => [args.name, args.buffer?.length])).toEqual([["a.csv", 250], ["b.csv", 50]]);
    expect(Host.last!.completed).toHaveLength(2);
    expect(Host.last!.percent).toBe(100);
    const progress = root.querySelector(`.${PREFIX}-file-upload__progress`)!;
    expect(progress.hasAttribute("hidden")).toBe(false);
    expect(progress.querySelector("[role=progressbar]")!.getAttribute("aria-valuenow")).toBe("100");
    expect(progress.textContent).toContain("Completed");
    const status = root.querySelector("[role=status]")!;
    expect(status.textContent).toBe("Completed");
    expect(root.querySelector("input[type=file]")!.getAttribute("aria-describedby")).toBe(status.id);
  });

  it("an upload function sends the files and gives its result", async () => {
    const upload = vi.fn(async (chosen: File, progress: (loaded: number) => void) => {
      progress(chosen.size);
      return `id-${chosen.name}`;
    });
    const { Host, zone, result } = await mount({ upload });
    await drop(zone, [file("a.csv", 10)], result);
    expect(upload).toHaveBeenCalledOnce();
    expect(Host.last!.uploaded[0]!.result).toBe("id-a.csv");
  });

  it("too many files and a file too large raise onFileError", async () => {
    const { Host, zone, result } = await mount({ multiple: true, maximumFileCount: 1, maximumFileSize: 100 });
    await drop(zone, [file("a", 1), file("b", 1)], result);
    expect(Host.last!.errors.map((error) => error.errorCode)).toEqual(["file-count-exceeded"]);
    await drop(zone, [file("big", 500)], result);
    expect(Host.last!.errors.map((error) => [error.errorCode, error.fileName])).toEqual([["file-count-exceeded", undefined], ["maximum-size-reached", "big"]]);
    expect(Host.last!.uploaded).toEqual([]);
  });

  it("shows a run's errors under the progress, and the status says them", async () => {
    const { root, zone, result } = await mount({ multiple: true, maximumFileCount: 1, maximumFileSize: 100 });
    await drop(zone, [file("a", 1), file("b", 1)], result);
    const progress = root.querySelector(`.${PREFIX}-file-upload__progress`)!;
    expect(progress.hasAttribute("hidden")).toBe(false);
    expect([...progress.querySelectorAll("li")].map((item) => item.textContent)).toEqual(["The maximum number of files has been exceeded."]);
    expect(root.querySelector("[role=status]")!.textContent).toBe("The maximum number of files has been exceeded.");
    // A new run starts without the last one's errors.
    await drop(zone, [file("big", 500)], result);
    expect([...progress.querySelectorAll("li")].map((item) => item.textContent)).toEqual(["big: The maximum size allowed is reached"]);
    expect(root.querySelector("[role=status]")!.textContent).toBe("Completed. big: The maximum size allowed is reached");
  });

  it("words the count error as the library text, or as the labels say", async () => {
    const english = await mount({ multiple: true, maximumFileCount: 1 });
    await drop(english.zone, [file("a", 1), file("b", 1)], english.result);
    expect(english.Host.last!.errors[0]!.errorMessage).toBe("The maximum number of files has been exceeded.");
    const own = await mount({ multiple: true, maximumFileCount: 1, labels: { fileCountExceeded: "Höchstens eine Datei." } });
    await drop(own.zone, [file("a", 1), file("b", 1)], own.result);
    expect(own.Host.last!.errors[0]!.errorMessage).toBe("Höchstens eine Datei.");
  });

  it("a single-file zone takes the first file dropped", async () => {
    const { Host, zone, result } = await mount();
    await drop(zone, [file("a", 1), file("b", 1)], result);
    expect(Host.last!.uploaded.map((args) => args.name)).toEqual(["a"]);
  });

  it("files dragged over mark the zone", async () => {
    const { root, zone, result } = await mount();
    zone.dispatchEvent(new Event("dragover", { bubbles: true, cancelable: true }));
    await result.settle();
    expect(root.className).toContain(`${PREFIX}-file-upload--dragover`);
    zone.dispatchEvent(new Event("dragleave", { bubbles: true }));
    await result.settle();
    expect(root.className).not.toContain(`${PREFIX}-file-upload--dragover`);
  });

  it("onInputFileChange takes the files instead of a run", async () => {
    const { Host, zone, result } = await mount({ multiple: true, takeChange: true });
    await drop(zone, [file("a", 1), file("b", 1)], result);
    expect(Host.last!.changes).toEqual([2]);
    expect(Host.last!.uploaded).toEqual([]);
  });

  it("anchorId: a button elsewhere opens the chooser", async () => {
    const { input, result } = await mount({ anchorId: "pick" });
    const click = vi.spyOn(input, "click").mockImplementation(() => {});
    (result.container.querySelector("#pick") as HTMLButtonElement).click();
    expect(click).toHaveBeenCalledOnce();
  });
});
