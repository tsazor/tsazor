/** moveFocusBeforeRemoval: the focus leaves a part about to be removed for its neighbor, else where it came from. */
import { afterEach, describe, expect, it } from "vitest";
import { moveFocusBeforeRemoval } from "../src/index";

afterEach(() => {
  document.body.innerHTML = "";
});

function region(count: number): { container: HTMLElement; parts: HTMLElement[]; buttons: HTMLButtonElement[] } {
  const container = document.createElement("div");
  for (let i = 0; i < count; i++) {
    const part = document.createElement("div");
    const button = document.createElement("button");
    button.textContent = `Close ${i}`;
    part.append(button);
    container.append(part);
  }
  document.body.append(container);
  const parts = [...container.children] as HTMLElement[];
  return { container, parts, buttons: parts.map((part) => part.querySelector("button")!) };
}

describe("moveFocusBeforeRemoval", () => {
  it("moves the focus to the next part, else the previous one", () => {
    const { container, parts, buttons } = region(3);
    buttons[1]!.focus();
    moveFocusBeforeRemoval(parts[1]!, container);
    expect(document.activeElement).toBe(buttons[2]);
    moveFocusBeforeRemoval(parts[2]!, container);
    expect(document.activeElement).toBe(buttons[1]);
  });

  it("falls back to where the focus came from when nothing else is left", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    const { container, parts, buttons } = region(1);
    buttons[0]!.focus();
    moveFocusBeforeRemoval(parts[0]!, container, opener);
    expect(document.activeElement).toBe(opener);
  });

  it("leaves the focus alone when it isn't in the leaving part", () => {
    const outside = document.createElement("input");
    document.body.append(outside);
    const { container, parts, buttons } = region(2);
    outside.focus();
    moveFocusBeforeRemoval(parts[0]!, container, buttons[1]);
    expect(document.activeElement).toBe(outside);
  });
});
