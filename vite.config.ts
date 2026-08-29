import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [
    cloudflare(),
    tsconfigPaths(),
    tailwindcss(),
    tanstackStart(),
  ],
  server: {
    host: "0.0.0.0",
    port: 3000,
  },
});
