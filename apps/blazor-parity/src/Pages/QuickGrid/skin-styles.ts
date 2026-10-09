/**
 * The skin's stylesheet, loaded with the QuickGrid pages only: they are lazy routes (vite.config.ts), so it
 * arrives with the page's chunk. Bootstrap's global CSS (its reboot) must not restyle the Virtualization
 * pages, and a test context loads one skin only.
 */
declare const __SKIN__: "fluent" | "bootstrap";

if (__SKIN__ === "bootstrap") await import("bootstrap/dist/css/bootstrap.min.css");
else await import("@tsazor/fluent/fluent.css");

export {};
