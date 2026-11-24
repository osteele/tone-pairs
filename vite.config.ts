import { execSync } from "node:child_process";
import { createReadStream, existsSync } from "node:fs";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

/** The commit being built, shown in About; "+" marks uncommitted changes. */
function buildId(): string {
  const run = (command: string) =>
    execSync(command, { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  if (existsSync(".jj")) {
    const commit = run("jj log --ignore-working-copy --no-graph -r @- -T 'commit_id.short(8)'");
    const dirty = run("jj diff --ignore-working-copy -r @ --summary") !== "";
    return `${commit}${dirty ? "+" : ""}`;
  }
  const commit = run("git rev-parse --short=8 HEAD");
  return `${commit}${run("git status --porcelain") === "" ? "" : "+"}`;
}

/**
 * Serve .cache/teacher (the workbook readers' measurements and clips, from `just teacher`) at
 * /dev/teacher/, to the dev server only: the workbook audio is copyrighted, and a build never
 * copies it.
 */
function teacherData(): Plugin {
  const root = resolve(fileURLToPath(new URL(".", import.meta.url)), ".cache/teacher");
  return {
    name: "teacher-data",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/dev/teacher/", (req, res, next) => {
        const name = decodeURIComponent((req.url ?? "").split("?")[0] ?? "").replace(/^\/+/, "");
        const file = resolve(root, name);
        if (!file.startsWith(root + sep) || !existsSync(file)) {
          next();
          return;
        }
        res.setHeader("Content-Type", file.endsWith(".json") ? "application/json" : "audio/wav");
        createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({
  root: "web",
  build: { outDir: "../dist", emptyOutDir: true },
  define: {
    __BUILD_ID__: JSON.stringify(buildId()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    teacherData(),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["apple-touch-icon.png", "favicon.svg"],
      manifest: {
        name: "Tone Pairs",
        short_name: "Tone Pairs",
        description: "Listening drill for the tones of two-syllable Mandarin words",
        display: "standalone",
        orientation: "portrait",
        background_color: "#fafaf9",
        theme_color: "#fafaf9",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      workbox: {
        // Precache only the app and the word list, so an update takes effect as soon as that
        // small core has downloaded. The page saves the recordings into the audio cache in
        // the background (web/src/offline.ts).
        globPatterns: ["**/*.{js,css,html,png,svg,json}"],
        // Only link previews fetch it; the app never shows it.
        globIgnores: ["og-image.png"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes("/audio/"),
            handler: "CacheFirst",
            options: {
              // AUDIO_CACHE in web/src/offline.ts.
              cacheName: "audio",
              // Safari requests media in byte ranges; serve them from the saved file.
              rangeRequests: true,
              // A range request that misses the cache gets a 206, which is not a whole file.
              cacheableResponse: { statuses: [200] },
              // The page saved the entry under its own request headers.
              matchOptions: { ignoreVary: true },
            },
          },
        ],
      },
    }),
  ],
});
