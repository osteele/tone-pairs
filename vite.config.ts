import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  root: "web",
  build: { outDir: "../dist", emptyOutDir: true },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["apple-touch-icon.png", "favicon.svg"],
      manifest: {
        name: "Tone Pairs",
        short_name: "Tones",
        description: "Listening drill for the tones of two-syllable Mandarin words",
        display: "standalone",
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
