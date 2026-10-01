/**
 * Frame discriminators for the flat render tree, mirroring Blazor's
 * RenderTreeFrame.FrameType.
 */
export const enum FrameType {
  /** Element frame; children occupy the frames until its subtree ends. */
  Element = 1,
  /** Text content (string or number rendered as text). */
  Text = 2,
  /** Attribute on the preceding element/component start frame. */
  Attribute = 3,
  /** Child component start frame; children are its parameters. */
  Component = 4,
  /** Logical grouping frame; no DOM output, preserves framing of conditionals. */
  Region = 5,
  /** Captures a reference to the enclosing element into a callback. */
  ElementReferenceCapture = 6,
  /** Raw markup inserted as innerHTML (analogue of Blazor's MarkupString). */
  Markup = 7,
  /** Named event handler attribute payload. */
  EventHandler = 8,
  /** Captures a reference to the child component instance (Blazor's ComponentReferenceCapture). */
  ComponentReferenceCapture = 9,
}

/** Flags carried on attribute frames for event handler directives. */
export const enum EventHandlerFlags {
  None = 0,
  PreventDefault = 1 << 0,
  StopPropagation = 1 << 1,
}