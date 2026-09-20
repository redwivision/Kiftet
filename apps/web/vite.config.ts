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
        ],
        globPatterns: ["**/*.{js,css,html,png,svg,ico}"],
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
        lang: "en",
        categories: ["education"],
      },
      pwaAssets: { disabled: false, config: true },
      devOptions: { enabled: true },
    }).map((plugin) => {
      // Service workers belong to the client build. SSR/server builds must not
      // regenerate them after the server has recorded public asset metadata.
      plugin.applyToEnvironment = (environment) => environment.name === "client";
      return plugin;
    }),
  ],
});
