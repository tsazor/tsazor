/**
 * Library build for @tsazor/charts through `buildLibrary` (@tsazor/cli), as the skins build: the components, the
 * helpers with their declarations, the manifest and the declarations, and charts.css (src/styles).
 */
import { buildLibrary } from "@tsazor/cli";

const result = await buildLibrary({
  typeExports: ['export type { ChartOptions, ChartSeries, ChartType } from "./chart-types.js"'],
  stylesheet: { file: "charts.css" },
});
if (result.errors.length > 0) process.exit(1);
