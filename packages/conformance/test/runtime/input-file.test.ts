/**
 * InputFile semantics vs. Blazor (src/Components/Web/src/Forms/InputFile.cs,
 * roadmap 3.7). The component renders `<input type="file">` and raises
 * `onChange` with an InputFileChangeEventArgs whose guards and messages are
 * Blazor's; the file objects are the native DOM Files (no JS interop).
 */
import { describe, expect, it } from "vitest";
import {
  defineComponent,
  EventCallback,
  InputFile,
  InputFileChangeEventArgs,
  type RenderTreeBuilder,
} from "@tsazor/runtime";
import { host, settle } from "./host.js";
import { createTestRenderer } from "../harness.js";

const file = (name: string): File => new File(["data"], name, { type: "text/plain", lastModified: 1727800000000 });

/** Mounts an InputFile and dispatches a change event carrying `files`. */
async function dispatchChange(files: readonly File[]): Promise<{ captured: InputFileChangeEventArgs[]; input: HTMLInputElement }> {
  const captured: InputFileChangeEventArgs[] = [];
  const h = await host((b: RenderTreeBuilder) => {
    b.openComponent(0, defineComponent(InputFile));
    b.addAttribute(1, "OnChange", EventCallback.unbound((args: InputFileChangeEventArgs) => void captured.push(args)));
    b.addAttribute(2, "accept", ".png");
    b.addAttribute(3, "class", "upload");
    b.closeComponent();
  });
  const input = h.container.querySelector("input")!;
  Object.defineProperty(input, "files", { value: [...files], configurable: true });
  input.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
  await h.settle();
  return { captured, input };
}

describe("InputFile (3.7)", () => {
  it("renders <input type=\"file\"> with its pass-through attributes", async () => {
    const h = await host((b: RenderTreeBuilder) => {
      b.openComponent(0, defineComponent(InputFile));
      b.addAttribute(1, "accept", ".png");
      b.addAttribute(2, "class", "upload");
      b.closeComponent();
    });
    const input = h.container.querySelector("input")!;
    expect(input.getAttribute("type")).toBe("file");
    expect(input.getAttribute("accept")).toBe(".png");
    expect(input.getAttribute("class")).toBe("upload");
  });

  it("captures the input element (Blazor's Element reference)", async () => {
    const renderer = createTestRenderer();
    const container = document.body.appendChild(document.createElement("div"));
    const state = renderer.renderInContainer(defineComponent(InputFile), container);
    await settle(renderer);
    const instance = state.component as InputFile;
    expect(instance.element).toBe(container.querySelector("input"));
  });

  it("raises OnChange with the DOM files wrapped as InputFileChangeEventArgs", async () => {
    const { captured } = await dispatchChange([file("single.txt")]);
    expect(captured).toHaveLength(1);
    expect(captured[0]!.fileCount).toBe(1);
    expect(captured[0]!.file.name).toBe("single.txt");
    expect(captured[0]!.file.size).toBe(4);
  });

  it("File and GetMultipleFiles guard with Blazor's messages", () => {
    const three = new InputFileChangeEventArgs([file("a"), file("b"), file("c")]);
    expect(three.getMultipleFiles()).toHaveLength(3);
    expect(() => three.getMultipleFiles(2)).toThrow("The maximum number of files accepted is 2, but 3 were supplied.");
    const none = new InputFileChangeEventArgs([]);
    expect(() => none.file).toThrow("No file was supplied.");
    const many = new InputFileChangeEventArgs([file("a"), file("b")]);
    expect(many.fileCount).toBe(2);
    expect(() => many.file).toThrow("More than one file was supplied. Call GetMultipleFiles to receive multiple files.");
    expect(many.getMultipleFiles(2)).toHaveLength(2);
  });

  it("a reference capture between the attributes does not shadow its following handlers, across re-renders", async () => {
    // InputFile's frame order (Blazor's InputFile.cs): multipleAttributes,
    // type, reference capture, onchange. The capture is part of the element's
    // own frame run (attributesEndIndexExclusive), not a child.
    const captured: unknown[] = [];
    const build = (b: RenderTreeBuilder): void => {
      b.openElement(0, "input");
      b.addMultipleAttributes(1, { accept: ".png" });
      b.addAttribute(2, "type", "file");
      b.addElementReferenceCapture(3, () => undefined);
      b.addEventHandler(4, "onchange", EventCallback.unbound((e: unknown) => void captured.push(e)));
      b.closeElement();
    };
    const h = await host(build);
    const input = h.container.querySelector("input")!;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await h.settle();
    expect(captured).toHaveLength(1);

    await h.update(); // same frames again: the handler survives the diff
    input.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
    await h.settle();
    expect(captured).toHaveLength(2);
  });
});