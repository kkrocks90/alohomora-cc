import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://chocolatecircle.in",
  base: "/",
  output: "static",
  vite: {
    plugins: [tailwindcss()],
  },
});
