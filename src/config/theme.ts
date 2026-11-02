// Site themes. The base look ("default") is plain CSS in global.css; every other
// theme is a stylesheet in src/styles/themes/ scoped to html[data-theme="<id>"].
//
// To add a theme: add an entry below, create src/styles/themes/<id>.css, and
// import it in SiteLayout.astro.
// To switch themes without a code change, set the GitHub repository variable
// SITE_THEME (Settings > Secrets and variables > Actions > Variables) to a theme
// id, or leave it empty to use FALLBACK_THEME, then run the Pages deploy.

import diwaliHero from "../assets/hero-chocolates-diwali.svg";

export interface ThemeBanner {
  text: string;
  href: string;
}

export interface ThemeHeroBanner {
  kicker: string;
  title: string;
  text: string;
  cta: string;
  href: string;
}

export interface Theme {
  id: string;
  label: string;
  themeColor: string;
  banner?: ThemeBanner;
  heroBanner?: ThemeHeroBanner;
  heroImage?: { src: ImageMetadata; alt: string };
}

export const THEMES: Record<string, Theme> = {
  default: {
    id: "default",
    label: "Base theme",
    themeColor: "#faf7f1",
  },
  diwali: {
    id: "diwali",
    label: "Diwali",
    themeColor: "#7a1d2c",
    banner: {
      text: "Happy Diwali! Gift boxes and corporate hampers are open for orders.",
      href: "store/",
    },
    heroImage: {
      src: diwaliHero,
      alt: "Handmade chocolate bar with a lit diya and marigold for Diwali",
    },
    heroBanner: {
      kicker: "Festival of lights",
      title: "Shubh Diwali",
      text: "Handmade gift boxes and hampers to share the sweetness with family, friends and teams.",
      cta: "Shop Diwali gifts",
      href: "store/",
    },
  },
};

const FALLBACK_THEME = "diwali";

const requested = (import.meta.env.PUBLIC_SITE_THEME ?? "").trim().toLowerCase();

export const theme: Theme = THEMES[requested] ?? THEMES[requested === "" ? FALLBACK_THEME : "default"];
