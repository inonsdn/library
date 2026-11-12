import { defineConfig } from "vite";
import { cpSync, mkdirSync } from "node:fs";
export default defineConfig({
  plugins: [
    {
      name: "pdf-font-assets",
      closeBundle() {
        mkdirSync("dist/pdf-assets", { recursive: true });
        for (const dir of ["cmaps", "standard_fonts"])
          cpSync(`node_modules/pdfjs-dist/${dir}`, `dist/pdf-assets/${dir}`, {
            recursive: true,
          });
      },
    },
  ],
});
