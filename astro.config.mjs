import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
export default defineConfig({
  site: "https://ura.design",
  output: "server",
  adapter: node({
    mode: "standalone",
  }),
  // Built-in, internal prefetch (no third-party script): preload a page's HTML
  // when the user hovers/focuses its link, so navigations feel instant —
  // instant.page-style, but native to Astro and wired into <ClientRouter />.
  // Opt a single link out with `data-astro-prefetch="false"`.
  prefetch: {
    prefetchAll: true,
    defaultStrategy: "hover",
  },
  i18n: {
    defaultLocale: "en",
    locales: ["en", "de"],
    routing: {
      prefixDefaultLocale: true,
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
  server: {
    port: 3000,
    host: true,
  },
});
