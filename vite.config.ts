import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig(({ mode }) => {
  const singlefile = mode === "singlefile";
  return {
    base: singlefile ? "./" : "/",
    plugins: singlefile ? [react(), viteSingleFile()] : [react()],
    publicDir: singlefile ? false : "public",
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: singlefile
      ? {
          outDir: "dist-singlefile",
          cssCodeSplit: false,
          assetsInlineLimit: 100_000_000,
          chunkSizeWarningLimit: 10_000,
          rollupOptions: { output: { inlineDynamicImports: true } },
        }
      : undefined,
  };
});
