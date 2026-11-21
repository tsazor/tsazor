// SSR spike, part 3b (SharpTS): the compiler's unchanged output for app/*.tsazor, rendered to HTML on .NET against
// the server slice of the runtime (mini-runtime.ts).
//
//   node spikes/ssr/build.mjs
//   cd spikes/ssr && dotnet sharpts --decorators sharpts/render.ts
//   cd spikes/ssr && dotnet sharpts --decorators --compile sharpts/render.ts && dotnet sharpts/render.dll
import App from "../.build/sharpts/App.tsazor.js";

const html = new App().renderToString(new Map());
console.log(html);

const runs = 2000;
const start = Date.now();
for (let i = 0; i < runs; i++) new App().renderToString(new Map());
console.log(`${((Date.now() - start) * 1000 / runs).toFixed(0)} µs per render (${runs} runs)`);
