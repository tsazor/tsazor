import type { ComponentBase } from "@tsazor/runtime";

/** The parameters `show` passes to a dialog: its own fields, typed — or any name for an untyped component type. */
export type DialogParameters<TComponent extends ComponentBase> = ComponentBase extends TComponent
  ? Record<string, unknown>
  : Partial<Omit<TComponent, keyof ComponentBase>>;

/** What `DialogService.show` takes besides the component (MudBlazor's title, DialogParameters and DialogOptions). */
export interface DialogOptions<TComponent extends ComponentBase = ComponentBase> {
  /** The dialog's title, unless its `Dialog` sets one. */
  readonly title?: string;
  /** The component's parameters by name (MudBlazor's `DialogParameters`). */
  readonly parameters?: DialogParameters<TComponent>;
  /** The dialog's width, over its `Dialog`'s own. */
  readonly size?: "small" | "medium" | "large" | "xlarge";
  /** Escape cancels it (default: the `Dialog`'s own, true). */
  readonly closeOnEscape?: boolean;
  /** A click on the backdrop cancels it (default: the `Dialog`'s own, true). */
  readonly closeOnBackdrop?: boolean;
}

/** How a dialog ended (MudBlazor's `DialogResult`): canceled, or closed with data. */
export interface DialogResult<TData = unknown> {
  readonly canceled: boolean;
  readonly data?: TData;
}

/**
 * One open dialog (MudBlazor's `IDialogReference` and, cascaded into the dialog, its `MudDialogInstance`): the page
 * awaits `result`; the dialog calls `close(data)` or `cancel()`.
 */
export class DialogReference<TData = unknown> {
  /** Resolves when the dialog closes or is canceled. */
  readonly result: Promise<DialogResult<TData>>;
  private settle!: (result: DialogResult<TData>) => void;

  /** @internal Made by `DialogService.show`. */
  constructor(
    /** One id per dialog of the service. */
    readonly id: number,
    /** The component shown as the dialog. */
    readonly component: abstract new (...args: never[]) => ComponentBase,
    /** Title, parameters and the closing rules. */
    readonly options: DialogOptions,
    private readonly remove: (dialog: DialogReference<TData>) => boolean,
  ) {
    this.result = new Promise((resolve) => {
      this.settle = resolve;
    });
  }

  /** Closes the dialog with `data` (MudBlazor's `Close(DialogResult.Ok(data))`). */
  close(data?: TData): void {
    if (this.remove(this)) this.settle({ canceled: false, data });
  }

  /** Cancels the dialog (MudBlazor's `Cancel()`; Escape, the backdrop and the close button). */
  cancel(): void {
    if (this.remove(this)) this.settle({ canceled: true });
  }
}

/**
 * Opens components as dialogs (MudBlazor's `IDialogService`, Fluent UI Blazor's and Radzen's `DialogService`): the
 * page shows one and awaits its result; a skin's `DialogProvider`, placed once in the layout, renders them. Inside,
 * the dialog gets its `DialogReference` as a cascading value and its skin's `Dialog` the title and closing rules.
 * Register it once: `services.registerType(DialogService, { lifetime: "singleton" })` (the skins' setup does).
 */
export class DialogService {
  private open: DialogReference<unknown>[] = [];
  private next = 1;
  private readonly listeners = new Set<() => void>();

  /** The open dialogs, the topmost last. */
  get dialogs(): readonly DialogReference<unknown>[] {
    return this.open;
  }

  /** Shows `component` as a dialog (MudBlazor's `Show<T>(title, parameters, options)`); await its `result`. */
  show<TComponent extends ComponentBase>(
    component: abstract new (...args: never[]) => TComponent,
    options: DialogOptions<TComponent> = {},
  ): DialogReference<unknown> {
    // Typed for the caller; the provider passes the parameters on by name.
    const stored = options as unknown as DialogOptions;
    const dialog = new DialogReference<unknown>(this.next++, component, stored, (closing) => this.removed(closing));
    this.open = [...this.open, dialog];
    this.changed();
    return dialog;
  }

  /** Listens to the open dialogs (`this.observe(dialogs)` in a component); returns the unsubscribe. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private removed(dialog: DialogReference<unknown>): boolean {
    if (!this.open.includes(dialog)) return false;
    this.open = this.open.filter((candidate) => candidate !== dialog);
    this.changed();
    return true;
  }

  private changed(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
