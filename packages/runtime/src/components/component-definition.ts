import type { ComponentBase } from "./component-base.js";

/**
 * Identifies a component type together with its static metadata. The compiler
 * emits one per .tsazor file; hand-built components get one via `defineComponent`.
 */
export interface ComponentDefinition<T extends ComponentBase = ComponentBase> {
  /** The component class the renderer instantiates. */
  readonly type: abstract new () => T;
}

/** Normalizes a component class or definition into a ComponentDefinition. */
export function toComponentDefinition(value: ComponentDefinition | (abstract new () => ComponentBase)): ComponentDefinition {
  return isComponentDefinition(value) ? value : defineComponent(value as never);
}

/** Whether `value` is a `ComponentDefinition` record (an object with a `type` property) rather than a component class. */
export function isComponentDefinition(value: unknown): value is ComponentDefinition {
  return typeof value === "object" && value !== null && "type" in (value as Record<string, unknown>);
}

/**
 * A component type as it flows through the render tree: the compiler emits the
 * class itself, hand-built call sites pass a `defineComponent(...)` record.
 * The renderer normalizes classes via `toComponentDefinition`.
 */
export type ComponentType<T extends ComponentBase = ComponentBase> =
  | ComponentDefinition<T>
  | (abstract new () => T);

/** One definition per class (see `defineComponent`). */
const definitionCache = new WeakMap<abstract new () => ComponentBase, ComponentDefinition>();

/** Wraps a component class into a definition. Cached per class so repeated
 *  `defineComponent(SomeClass)` calls (every render!) yield identical
 *  definitions — the diff compares component types by identity. */
export function defineComponent<T extends abstract new (...args: never[]) => ComponentBase>(type: T): ComponentDefinition {
  let definition = definitionCache.get(type);
  if (!definition) {
    definition = { type } as ComponentDefinition;
    definitionCache.set(type, definition);
  }
  return definition;
}