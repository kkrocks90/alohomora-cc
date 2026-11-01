import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://chocolatecircle.in",
  base: "/",
  output: "static",
  image: {
    domains: ["pub-3e6a27e671504bceb10d039909e8722e.r2.dev"],
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
