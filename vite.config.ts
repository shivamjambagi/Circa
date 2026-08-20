import vinext from "vinext";
import { defineConfig } from "vite";
import { sites } from "./build/sites-vite-plugin.ts";

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

export default defineConfig(async () => {
  // The release build injects this generated Fetch worker into the typechecked
  // handler factory and writes dist/netlify/functions/circa-app.mjs for Netlify.
  // The Cloudflare Vite plugin is used only as the worker bundler; Circa has no
  // Cloudflare deployment, D1 database, R2 bucket or runtime binding.
  const { cloudflare } = await import("@cloudflare/vite-plugin");
  return {
    ssr: {
      // Firebase Admin is a Node dependency of privileged Netlify routes.
      // Keep it external so its CommonJS internals are not rewritten into the
      // ESM Fetch worker (which would break __dirname at runtime).
      external: ["firebase-admin"],
    },
    server: {
      host: "0.0.0.0",
      allowedHosts: ["terminal.local"],
      ...(isCodexSeatbeltSandbox
        ? { watch: { useFsEvents: false, usePolling: true } }
        : {}),
    },
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
        config: { main: "./worker/index.ts", compatibility_flags: ["nodejs_compat"] },
      }),
    ],
  };
});
