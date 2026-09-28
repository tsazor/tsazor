import { defineConfig } from "vite";
import { tasor } from "@tasor/vite-plugin";

export default defineConfig({
  plugins: [tasor()],
});