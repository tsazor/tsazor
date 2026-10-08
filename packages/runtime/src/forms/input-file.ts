import { ComponentBase } from "../components/component-base.js";
import { Parameter } from "../components/parameter-metadata.js";
import { EventCallback } from "../components/event-callback.js";
import type { RenderTreeBuilder } from "../render-tree/render-tree.js";

/**
 * Blazor's InputFile (src/Components/Web/src/Forms/InputFile.cs): an
 * `<input type="file">` that raises `onChange` with an
 * `InputFileChangeEventArgs`.
 *
 * Deviations (documented, roadmap 3.7): the JS-interop plumbing is the
 * browser's native File API — the event's files are the DOM `File` objects
 * (`IBrowserFile` had no port; name/size/lastModified/type come from File),
 * `OpenReadStream`/`ConvertToImageFileAsync` have no interop to port (a File
 * streams natively), and the `Element` capture is the plain DOM element.
 */
export class InputFile extends ComponentBase {
  /** The change event of the input element. */
  @Parameter() onChange?: EventCallback<InputFileChangeEventArgs>;
  /** Pass-through attributes (accept, multiple, class, …). */
  @Parameter({ captureUnmatchedValues: true }) additionalAttributes?: Record<string, unknown>;

  /** The rendered input element (Blazor's `Element` reference capture). */
  element?: Element;

  protected override buildRenderTree(b: RenderTreeBuilder): void {
    b.openElement(0, "input");
    const attributes = this.additionalAttributes;
    if (attributes) {
      b.addMultipleAttributes(1, attributes as Record<string, never>);
    }
    b.addAttribute(2, "type", "file");
    b.addElementReferenceCapture(3, (element) => (this.element = element));
    b.addEventHandler(
      4,
      "onchange",
      EventCallback.bind(
        this,
        (__event: Event) => {
          const args = new InputFileChangeEventArgs(Array.from(((__event.target as HTMLInputElement).files ?? []) as File[]));
          // Blazor raises OnChange with the args (the DOM change event arrives
          // through the input element's interop in .NET) and returns its task:
          // the renderer awaits an async handler, and its error reaches the ErrorBoundary.
          return this.onChange?.invokeAsync(args);
        },
      ),
    );
    b.closeElement();
  }
}

/**
 * Blazor's InputFileChangeEventArgs: wraps the change event's DOM File list.
 * The messages and guards are Blazor's (`File` for single-file inputs,
 * `GetMultipleFiles` for multi-file ones).
 */
export class InputFileChangeEventArgs {
  /** Wraps the files of one change event (`InputFile` creates it; tests may too). */
  constructor(private readonly files: readonly File[]) {}

  /** The number of supplied files (Blazor's FileCount). */
  get fileCount(): number {
    return this.files.length;
  }

  /**
   * The supplied file — for a single-file input. Throws like Blazor when
   * nothing was supplied or several files were.
   */
  get file(): File {
    if (this.files.length === 0) throw new Error("No file was supplied.");
    if (this.files.length > 1) {
      throw new Error("More than one file was supplied. Call GetMultipleFiles to receive multiple files.");
    }
    return this.files[0]!;
  }

  /**
   * The list, for multi-file inputs. Throws like Blazor when more than
   * `maximumFileCount` were supplied.
   */
  getMultipleFiles(maximumFileCount = 10): readonly File[] {
    if (this.files.length > maximumFileCount) {
      throw new Error(`The maximum number of files accepted is ${maximumFileCount}, but ${this.files.length} were supplied.`);
    }
    return this.files;
  }
}