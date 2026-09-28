import type { ComponentBase } from "./component-base";

/**
 * Identifies a component type together with its static metadata. The compiler
 * emits one per .tazor file; hand-built components get one via `defineComponent`.
 */
export interface ComponentDefinition<T extends ComponentBase = ComponentBase> {
  readonly type: abstract new () => T;
}

/** Normalizes a component class or definition into a ComponentDefinition. */
export function toComponentDefinition(value: ComponentDefinition | (abstract new () => ComponentBase)): ComponentDefinition {
  return isComponentDefinition(value) ? value : defineComponent(value as never);
}

export function isComponentDefinition(value: unknown): value is ComponentDefinition {
  return typeof value === "object" && value !== null && "type" in (value as Record<string, unknown>);
}

/** Wraps a component class into a definition. Cached per class so repeated
 *  `defineComponent(SomeClass)` calls (every render!) yield identical
 *  definitions — the diff compares component types by identity. */
const definitionCache = new WeakMap<abstract new () => ComponentBase, ComponentDefinition>();

export function defineComponent<T extends abstract new (...args: never[]) => ComponentBase>(type: T): ComponentDefinition {
  let definition = definitionCache.get(type);
  if (!definition) {
    definition = { type } as ComponentDefinition;
    definitionCache.set(type, definition);
  }
  return definition;
}