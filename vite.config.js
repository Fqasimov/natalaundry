import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// `base: "./"` matters for Hostinger: the site is uploaded into public_html as
// plain files, and absolute asset paths break the moment it is served from
// anywhere other than the domain root.
export default defineConfig({
  plugins: [vue()],
  base: "./",
  build: {
    outDir: "dist",
    assetsDir: "assets",
    // One vendor chunk rather than many: this is three routes, and on a
    // shared host each extra request costs more than the bytes saved.
    rollupOptions: {
      output: {
        manualChunks: { vendor: ["vue", "vue-router"] },
      },
    },
  },
});
