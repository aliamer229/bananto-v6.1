import { defineConfig, loadEnv } from "vite";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import viteTsconfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import react from "@vitejs/plugin-react";

// three / @react-three/fiber run work in module scope (shared LoadingManager,
// timers, random values), which Cloudflare Workers forbid at global scope. The
// 3D case only ever renders in the browser, so the server build gets a
// side-effect free stub instead. Without this, every published request 500s.
const threeStub = fileURLToPath(new URL("./src/hub/gamehub/three-ssr-stub.ts", import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const define: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    define[`import.meta.env.${key}`] = JSON.stringify(value);
  }

  return {
    define,
    plugins: [
      {
        name: "three-ssr-stub",
        enforce: "pre" as const,
        resolveId(this: { environment?: { name?: string } }, source: string) {
          if (this.environment?.name === "client") return null;
          if (
            source === "three" ||
            source === "@react-three/fiber" ||
            source === "@react-three/drei" ||
            source.startsWith("three/examples/")
          ) {
            return threeStub;
          }
          return null;
        },
      },
      tailwindcss(),
      viteTsconfigPaths({ projects: ["./tsconfig.json"] }),
      tanstackStart(),
      // Without an explicit preset Nitro builds a Node HTTP server, which the
      // Cloudflare Worker runtime cannot boot ("http.createServer is not
      // implemented"). The Worker build must use the Cloudflare module preset.
      nitro({
        preset: "node-server",
        // Cloudflare Builds runs `wrangler deploy` from the repository root.
        // Keep Wrangler on the checked-in config instead of generating a
        // dist/server config plus a .wrangler pointer that can retain stale
        // D1 resource IDs between builds.
        output: { dir: "dist", serverDir: "dist/server", publicDir: "dist/client" },
        // Long-lived edge/browser caching for the static media served by
        // Cloudflare; the service worker itself must always be revalidated.
        routeRules: {
          "/img/**": { headers: { "cache-control": "public, max-age=31536000, immutable" } },
          "/media/**": { headers: { "cache-control": "public, max-age=31536000, immutable" } },
          "/models/**": { headers: { "cache-control": "public, max-age=31536000, immutable" } },
          "/textures/**": { headers: { "cache-control": "public, max-age=31536000, immutable" } },
          "/source/**": { headers: { "cache-control": "public, max-age=31536000, immutable" } },
          "/illustrations/**": { headers: { "cache-control": "public, max-age=604800" } },
          "/sw.js": { headers: { "cache-control": "no-cache" } },
        },
        hooks: {
          compiled: async (nitro) => {
            const fs = await import("node:fs");
            const path = await import("node:path");
            const ssrPath = path.resolve(nitro.options.output.serverDir, "_ssr/ssr.mjs");
            const indexPath = path.resolve(nitro.options.output.serverDir, "index.mjs");
            if (fs.existsSync(ssrPath) && fs.existsSync(indexPath)) {
              fs.appendFileSync(indexPath, `\nexport { ChatRealtimeDO } from "./_ssr/ssr.mjs";\n`);
              console.log(`\n[Nitro Hook] Successfully appended ChatRealtimeDO export\n`);
            }
          },
        },
      }),

      react(),
    ],
    css: { transformer: "lightningcss" },
    build: {},
    resolve: {
      alias: {
        "@": `${process.cwd()}/src`,
        "h3-v2": "h3",
      },
      dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
    },
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
      ],
    },
    ssr: {},
    server: {
      host: "0.0.0.0",
      port: 3000,
    },
  };
});
