import type { ClassValue } from "clsx";
import { cn } from "@/lib/cn";

/**
 * React's `<div className={cn(base, className)} {...props} />` for a component's `@attributes`: the caller's
 * attributes, with its `class` merged into the component's own by tailwind-merge (the caller's wins a conflict).
 */
export function withClass(base: ClassValue, attributes?: Record<string, unknown>): Record<string, unknown> {
  return { ...attributes, class: cn(base, attributes?.class as ClassValue) };
}
