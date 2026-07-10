import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // GitHub Pages serves project sites under /<repo-name>/, so the CI deploy
  // build sets GH_PAGES=true to prefix asset URLs accordingly. Local dev and
  // regular builds stay at "/".
  base: process.env.GH_PAGES === "true" ? "/techtrack-webinar-launchpad/" : "/",
  server: {
    host: true,
    port: 8080,
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "og-image.png"],
      // Precache the whole built bundle so, once loaded a single time, the
      // game (procedural world, no external assets) runs fully offline —
      // meant to be installed via "Add to Home Screen" for a native-app feel.
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: { cacheName: "island-strike-pages" },
          },
        ],
      },
      manifest: {
        name: "Island Strike",
        short_name: "Island Strike",
        description: "Free-roam low-poly battle island shooter for mobile browsers.",
        theme_color: "#0a0f14",
        background_color: "#0a0f14",
        display: "standalone",
        orientation: "landscape",
        start_url: ".",
        scope: ".",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
