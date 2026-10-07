// Behavior core of the Tsazor component library (design-component-library.md):
// unstyled behaviors as attachments, ids, focus helpers and the shared vocabulary.

export type { Appearance, Intent, Orientation, Placement, Size } from "./vocabulary.js";
export { uniqueId } from "./ids.js";
export { focusableElements, focusElement } from "./focus.js";
export { createLayer, isTopLayer, openLayer } from "./layers.js";
export { focusTrap, type FocusTrapOptions } from "./behaviors/focus-trap.js";
export { dismissable, type DismissableOptions, type DismissReason } from "./behaviors/dismissable.js";
export { scrollLock } from "./behaviors/scroll-lock.js";
export { rovingFocus, type RovingFocusOptions } from "./behaviors/roving-focus.js";
export { anchoredPosition, computePosition, type AnchoredPositionOptions } from "./behaviors/anchored-position.js";
export { FieldState, hasSubmitAttempt, markSubmitAttempt, type FieldValidity } from "./forms.js";
