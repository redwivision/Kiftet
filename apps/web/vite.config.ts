import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { varlockVitePlugin } from "@varlock/vite-integration";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    varlockVitePlugin({
      ssrInjectMode: "auto-load",
      ssrEntryModuleIds: ["\0virtual:react-router/server-build"],
    }),
    tailwindcss(),
    reactRouter(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["offline.html"],
      integration: {
        closeBundleOrder: "post",
        configureOptions(viteConfig, options) {
          const outDir = viteConfig.environments.client.build.outDir;
          options.outDir = outDir;
          options.pwaAssets = { ...options.pwaAssets, integration: { outDir } };
        },
      },
      workbox: {
        navigateFallback: null,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkOnly",
            options: { precacheFallback: { fallbackURL: "offline.html" } },
          },
          // The webfonts are the brand's strongest asset, and until this rule
          // existed nothing cached them: offline, the app shell loaded from the
          // service worker and every headline silently fell back to system-ui.
          // The brand disappeared in exactly the scenario the PWA exists for.
          // Google's unicode-range means only the subsets actually used are
          // ever fetched, so CacheFirst here stays small. StaleWhileRevalidate
          // on the stylesheet means a font update still lands on the next visit.
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "kiftet-font-sheets",
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "kiftet-font-files",
              expiration: { maxEntries: 24, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
        // `woff2` is in the list on purpose even though nothing self-hosts a
        // font today. The runtime rules above only cover the *remote* Google
        // origins; the moment a font moves into the bundle this glob is the
        // only thing that would precache it, and a missing extension fails
        // silently — the app installs, then renders in system-ui offline.
        globPatterns: ["**/*.{js,css,html,png,svg,ico,woff,woff2}"],
      },
      manifest: {
        name: "Kiftet — Close the gap",
        short_name: "Kiftet",
        description: "Find what's missing in your studies and close the gap.",
        theme_color: "#0A0B0D",
        background_color: "#0A0B0D",
        display: "standalone",
        start_url: "/",
        scope: "/",
        orientation: "portrait",
        // `en` is deliberate and static, not an oversight. The app is bilingual
        // but the *runtime* language is the user's stored preference, and a
        // web manifest is fetched and parsed before any app code runs — it has
        // no way to read that preference. `en` is also the fallback in
        // `readStored()` in language-provider.tsx, so the manifest and the app's
        // default provably agree. Don't "fix" this to be dynamic.
        lang: "en",
        categories: ["education"],
      },
      pwaAssets: { disabled: false, config: true },
      devOptions: { enabled: true },
    }).map((plugin) => {
      // Service workers belong to the client build. SSR/server builds must not
      // regenerate them after the server has recorded public asset metadata.
      plugin.applyToEnvironment = (environment) =>
        environment.name === "client";
      return plugin;
    }),
  ],
});
