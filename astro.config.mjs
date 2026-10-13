import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

const isGitHubPagesBuild = process.env.GITHUB_ACTIONS === "true";

export default defineConfig({
  site: "https://kkrocks90.github.io",
  base: isGitHubPagesBuild ? "/alohomora-cc/" : "/",
  output: "static",
  vite: {
    plugins: [tailwindcss()],
  },
});
