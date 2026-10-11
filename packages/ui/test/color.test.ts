import { describe, expect, it } from "vitest";
import { closestColor, describeColor, hexToHsv, hexToRgb, hsvToHex, normalizeHexColor, rgbToHex, swatchKeyTarget, wheelKeyTarget, wheelLayout } from "../src/color.js";

describe("hex colors", () => {
  it("reads #rrggbb, #rgb, without # and in any case; writes #rrggbb in lower case", () => {
    expect(normalizeHexColor("#0F6CBD")).toBe("#0f6cbd");
    expect(normalizeHexColor("0f6cbd")).toBe("#0f6cbd");
    expect(normalizeHexColor("#FC0")).toBe("#ffcc00");
    expect(normalizeHexColor("blue")).toBeUndefined();
    expect(normalizeHexColor("#12345")).toBeUndefined();
    expect(hexToRgb("#0f6cbd")).toEqual({ r: 15, g: 108, b: 189 });
    expect(rgbToHex({ r: 15, g: 108, b: 189 })).toBe("#0f6cbd");
    expect(rgbToHex({ r: 300, g: -4, b: 127.6 })).toBe("#ff0080");
  });

  it("converts to HSV and back", () => {
    expect(hexToHsv("#ff0000")).toEqual({ h: 0, s: 1, v: 1 });
    expect(hexToHsv("#808080")).toMatchObject({ h: 0, s: 0 });
    for (const color of ["#0f6cbd", "#ffcc00", "#4cb050", "#000000", "#ffffff", "#b61c1c"]) {
      expect(hsvToHex(hexToHsv(color)!)).toBe(color);
    }
    expect(hsvToHex({ h: 120, s: 1, v: 1 })).toBe("#00ff00");
    expect(hsvToHex({ h: 480, s: 1, v: 1 })).toBe("#00ff00");
  });
});

describe("closestColor", () => {
  it("finds the palette's nearest color", () => {
    const palette = ["#FF0000", "#00FF00", "#0000FF"];
    expect(closestColor(palette, "#ee1111")).toBe("#ff0000");
    expect(closestColor(palette, "#1010f0")).toBe("#0000ff");
    expect(closestColor(palette, "not a color")).toBeUndefined();
    expect(closestColor([], "#ff0000")).toBeUndefined();
  });
});

describe("swatchKeyTarget", () => {
  it("moves through a grid of swatches by one and by a row, stopping at the edges", () => {
    // 12 swatches, 5 a row: 0–4, 5–9, 10–11.
    expect(swatchKeyTarget({ key: "ArrowRight" }, 0, 12, 5)).toBe(1);
    expect(swatchKeyTarget({ key: "ArrowDown" }, 1, 12, 5)).toBe(6);
    expect(swatchKeyTarget({ key: "ArrowDown" }, 8, 12, 5)).toBeUndefined();
    expect(swatchKeyTarget({ key: "ArrowUp" }, 6, 12, 5)).toBe(1);
    expect(swatchKeyTarget({ key: "ArrowLeft" }, 0, 12, 5)).toBeUndefined();
    expect(swatchKeyTarget({ key: "Home" }, 7, 12, 5)).toBe(5);
    expect(swatchKeyTarget({ key: "End" }, 7, 12, 5)).toBe(9);
    expect(swatchKeyTarget({ key: "End" }, 10, 12, 5)).toBe(11);
    expect(swatchKeyTarget({ key: "Home", ctrlKey: true }, 7, 12, 5)).toBe(0);
    expect(swatchKeyTarget({ key: "End", ctrlKey: true }, 7, 12, 5)).toBe(11);
    expect(swatchKeyTarget({ key: "ArrowRight" }, 3, 12, 5, true)).toBe(2);
    expect(swatchKeyTarget({ key: "Enter" }, 3, 12, 5)).toBeUndefined();
  });
});

describe("wheelKeyTarget", () => {
  // Rows of 3, 4, 3: 0–2, 3–6, 7–9, centered.
  const rows = [3, 4, 3];
  it("moves in reading order left and right, to the nearest hexagon up and down", () => {
    expect(wheelKeyTarget({ key: "ArrowRight" }, 2, rows)).toBe(3);
    expect(wheelKeyTarget({ key: "ArrowLeft" }, 0, rows)).toBeUndefined();
    expect(wheelKeyTarget({ key: "ArrowDown" }, 0, rows)).toBe(3);
    expect(wheelKeyTarget({ key: "ArrowDown" }, 2, rows)).toBe(6);
    expect(wheelKeyTarget({ key: "ArrowDown" }, 4, rows)).toBe(7);
    expect(wheelKeyTarget({ key: "ArrowUp" }, 8, rows)).toBe(5);
    expect(wheelKeyTarget({ key: "ArrowUp" }, 1, rows)).toBeUndefined();
    expect(wheelKeyTarget({ key: "ArrowDown" }, 8, rows)).toBeUndefined();
    expect(wheelKeyTarget({ key: "End" }, 4, rows)).toBe(9);
    expect(wheelKeyTarget({ key: "Home" }, 4, rows)).toBe(0);
    expect(wheelKeyTarget({ key: "ArrowRight" }, 4, rows, true)).toBe(3);
  });
});

describe("wheelLayout", () => {
  it("lays the rows out centered, a hexagon of six points each, inside the viewBox", () => {
    const layout = wheelLayout([7, 8, 9, 10, 11, 12, 13, 12, 11, 10, 9, 8, 7]);
    expect(layout.hexagons).toHaveLength(127);
    const [width, height] = layout.viewBox.split(" ").slice(2).map(Number);
    for (const hexagon of layout.hexagons) {
      const points = hexagon.points.split(" ").map((point) => point.split(",").map(Number));
      expect(points).toHaveLength(6);
      for (const [x, y] of points) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(width!);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(height!);
      }
    }
    // The middle row's middle hexagon sits in the middle.
    expect(layout.hexagons[63]!.cx).toBeCloseTo(width! / 2, 1);
  });
});

describe("describeColor", () => {
  it("names a color by its hue and lightness", () => {
    expect(describeColor("#ff0000")).toBe("red");
    expect(describeColor("#b61c1c")).toBe("red");
    expect(describeColor("#ffcdd2")).toBe("light red");
    expect(describeColor("#0e47a1")).toBe("dark blue");
    expect(describeColor("#1a237e")).toBe("dark blue");
    expect(describeColor("#0000ff")).toBe("blue");
    expect(describeColor("#8000ff")).toBe("purple");
    expect(describeColor("#4cb050")).toBe("green");
    expect(describeColor("#000000")).toBe("black");
    expect(describeColor("#ffffff")).toBe("white");
    expect(describeColor("#808080")).toBe("gray");
  });
});
