/**
 * The color picker's default palettes, as Fluent UI Blazor ships them (DefaultColors.cs, MIT, Microsoft): the swatch
 * palette — 19 hues from light to dark, ten shades each — and the color wheel's 127 hexagons, row by row
 * (7, 8, 9, 10, 11, 12, 13, 12, 11, 10, 9, 8, 7).
 */

/** The swatch palette: ten shades a hue, light to dark. */
export const swatchPalette: readonly string[] = [
  "#ffe4e9", "#ffcdd2", "#ee9a9a", "#e57373", "#ee534f", "#f44236", "#e53935", "#c9342d", "#c32c28", "#b61c1c",
  "#ffd2e7", "#f9bbd0", "#f48fb1", "#f06292", "#ec407a", "#ea1e63", "#d81a60", "#c2175b", "#ad1457", "#890e4f",
  "#f8d5ff", "#e1bee8", "#cf93d9", "#b968c7", "#aa47bc", "#9c28b1", "#8e24aa", "#7a1fa2", "#6a1b9a", "#4a148c",
  "#e7dbff", "#d0c4e8", "#b39ddb", "#9675ce", "#7e57c2", "#673bb7", "#5d35b0", "#512da7", "#45289f", "#301b92",
  "#dce1ff", "#c5cae8", "#9ea8db", "#7986cc", "#5c6bc0", "#3f51b5", "#3949ab", "#303e9f", "#283593", "#1a237e",
  "#d2f5ff", "#bbdefa", "#90caf8", "#64b5f6", "#42a5f6", "#2196f3", "#1d89e4", "#1976d3", "#1564c0", "#0e47a1",
  "#cafcff", "#b3e5fc", "#81d5fa", "#4fc2f8", "#28b6f6", "#03a9f5", "#039be6", "#0288d1", "#0277bd", "#00579c",
  "#c9ffff", "#b2ebf2", "#80deea", "#4dd0e2", "#25c6da", "#00bcd5", "#00acc2", "#0098a6", "#00828f", "#016064",
  "#c9f6f3", "#b2dfdc", "#80cbc4", "#4cb6ac", "#26a59a", "#009788", "#00887a", "#00796a", "#00695b", "#004c3f",
  "#dffde1", "#c8e6ca", "#a5d6a7", "#80c783", "#66bb6a", "#4cb050", "#43a047", "#398e3d", "#2f7d32", "#1c5e20",
  "#f4ffdf", "#ddedc8", "#c5e1a6", "#aed582", "#9ccc66", "#8bc24a", "#7db343", "#689f39", "#548b2e", "#33691e",
  "#ffffd9", "#f0f4c2", "#e6ee9b", "#dde776", "#d4e056", "#cddc39", "#c0ca33", "#b0b42b", "#9e9e24", "#817716",
  "#ffffda", "#fffac3", "#fff59c", "#fff176", "#ffee58", "#ffeb3c", "#fdd734", "#fac02e", "#f9a825", "#f47f16",
  "#ffffc9", "#ffecb2", "#ffe083", "#ffd54f", "#ffc928", "#fec107", "#ffb200", "#ff9f00", "#ff8e01", "#ff6f00",
  "#fff7c9", "#ffe0b2", "#ffcc80", "#ffb64d", "#ffa827", "#ff9700", "#fb8c00", "#f67c01", "#ef6c00", "#e65100",
  "#ffe3d2", "#ffccbb", "#ffab91", "#ff8a66", "#ff7143", "#fe5722", "#f5511e", "#e64a19", "#d74315", "#bf360c",
  "#eee3df", "#d7ccc8", "#bcaba4", "#a0887e", "#8c6e63", "#7b5347", "#6d4d42", "#5d4038", "#4d342f", "#3e2622",
  "#ffffff", "#f5f5f5", "#eeeeee", "#e0e0e0", "#bdbdbd", "#9e9e9e", "#757575", "#616161", "#424242", "#212121",
  "#e5f0f4", "#ced9dd", "#b0bfc6", "#90a4ad", "#798f9a", "#607d8b", "#546f7a", "#465a65", "#36474f", "#273238",
];

/** The color wheel's hexagons, row by row. */
export const wheelPalette: readonly string[] = [
  "#003366", "#336699", "#3366cc", "#003399", "#000099", "#0000cc", "#000066",
  "#006666", "#006699", "#0099cc", "#0066cc", "#0033cc", "#0000ff", "#3333ff", "#333399",
  "#669999", "#009999", "#33cccc", "#00ccff", "#0099ff", "#0066ff", "#3366ff", "#3333cc", "#666699",
  "#339966", "#00cc99", "#00ffcc", "#00ffff", "#33ccff", "#3399ff", "#6699ff", "#6666ff", "#6600ff", "#6600cc",
  "#339933", "#00cc66", "#00ff99", "#66ffcc", "#66ffff", "#66ccff", "#99ccff", "#9999ff", "#9966ff", "#9933ff", "#9900ff",
  "#006600", "#00cc00", "#00ff00", "#66ff99", "#99ffcc", "#ccffff", "#ccccff", "#cc99ff", "#cc66ff", "#cc33ff", "#cc00ff", "#9900cc",
  "#003300", "#009933", "#33cc33", "#66ff66", "#99ff99", "#ccffcc", "#ffffff", "#ffccff", "#ff99ff", "#ff66ff", "#ff00ff", "#cc00cc", "#660066",
  "#336600", "#009900", "#66ff33", "#99ff66", "#ccff99", "#ffffcc", "#ffcccc", "#ff99cc", "#ff66cc", "#ff33cc", "#cc0099", "#993399",
  "#333300", "#669900", "#99ff33", "#ccff66", "#ffff99", "#ffcc99", "#ff9999", "#ff6699", "#ff3399", "#cc3399", "#990099",
  "#666633", "#99cc00", "#ccff33", "#ffff66", "#ffcc66", "#ff9966", "#ff6666", "#ff0066", "#cc6699", "#993366",
  "#999968", "#cdcd07", "#ffff04", "#ffcd05", "#ff9b37", "#ff6b09", "#ff5454", "#cd0569", "#690638",
  "#a07243", "#d0a218", "#ffa216", "#d17519", "#ff4719", "#ff1818", "#d01414", "#a21645",
  "#704010", "#a77c25", "#d35126", "#a85126", "#a82525", "#942828", "#a75050",
];

/** How many hexagons each row of the color wheel holds. */
export const wheelRowSizes: readonly number[] = [7, 8, 9, 10, 11, 12, 13, 12, 11, 10, 9, 8, 7];
