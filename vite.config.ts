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
        // Precache every recording so the drill works offline once installed.
        globPatterns: ["**/*.{js,css,html,png,svg,json,mp3}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
});
