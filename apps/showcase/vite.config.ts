import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import { tsazor } from "@tsazor/vite-plugin";

/**
 * The component showcase. `virtual:showcase-sources` reads the examples'
 * .tsazor files fresh on every request, keyed by their paths: a copied snippet
 * is the very source the page runs (the Radzen demo site reads its examples'
 * sources the same way). A change under src/examples reloads the page.
 */
function showcaseSources(): Plugin {
  const root = path.dirname(fileURLToPath(import.meta.url));
  const examples = path.join(root, "src", "examples");
  const templates = path.join(root, "..", "..", "packages", "bootstrap", "templates");
  const read = (): { sources: Record<string, string>; files: string[] } => {
    const all: Record<string, string> = {};
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith(".tsazor") && entry.name !== "_Imports.tsazor") {
          all[path.relative(examples, full).replaceAll("\\", "/").replace(/\.tsazor$/, "")] = readFileSync(full, "utf8");
          files.push(full);
        }
      }
    };
    walk(examples);
    // The templates are the sources of their own demos: the key is the block's kebab name
    // (`templates/auth-login`), the file lives in the package (the copy's origin).
    const kebab = (name: string): string => name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
    if (existsSync(templates)) {
      for (const file of readdirSync(templates)) {
        if (!file.endsWith(".tsazor") || file === "_Imports.tsazor") continue;
        const full = path.join(templates, file);
        all[`templates/${kebab(file.replace(/\.tsazor$/, ""))}`] = readFileSync(full, "utf8");
        files.push(full);
      }
    }
    return { sources: all, files };
  };
  return {
    name: "showcase-sources",
    resolveId(id) {
      return id === "virtual:showcase-sources" ? "\0virtual:showcase-sources" : null;
    },
    async load(id) {
      if (id !== "\0virtual:showcase-sources") return null;
      const { sources, files } = read();
      // Plain JavaScript (no type annotation): a virtual module gets no TS transform.
      // watchFiles re-runs this load when the sources change; a newly created file
      // isn't in the list yet, so the server hook below keeps the directory in the
      // watcher and invalidates by id for it.
      return { code: `export const sources = ${JSON.stringify(sources)};`, watchFiles: files };
    },
    configureServer(server) {
      server.watcher.add(examples);
      server.watcher.on("all", async (_event, file) => {
        if (!file.startsWith(examples) || !file.endsWith(".tsazor")) return;
        const module = server.moduleGraph.getModuleById("\0virtual:showcase-sources");
        if (module) {
          server.moduleGraph.invalidateModule(module);
          server.ws.send({ type: "full-reload" });
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [tsazor(), showcaseSources()],
});