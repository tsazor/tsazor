/** The skin of this build and the address of the other one (vite.config.ts defines both). */
export const skin: "bootstrap" | "fluent" = __SKIN__;
export const otherSkin: "bootstrap" | "fluent" = __SKIN__ === "fluent" ? "bootstrap" : "fluent";
export const otherSkinUrl: string = __OTHER_SKIN_URL__;
export const skinLabel = (name: "bootstrap" | "fluent"): string => (name === "fluent" ? "Fluent 2" : "Bootstrap 5");
