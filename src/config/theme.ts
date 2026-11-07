// Site themes. The base look ("default") is plain CSS in global.css; every other
// theme is a stylesheet in src/styles/themes/ scoped to html[data-theme="<id>"].
//
// To add a theme: add an entry below, create src/styles/themes/<id>.css, and
// import it in SiteLayout.astro.
// To switch themes without a code change, set the GitHub repository variable
// SITE_THEME (Settings > Secrets and variables > Actions > Variables) to a theme
// id, or leave it empty to use FALLBACK_THEME, then run the Pages deploy.

import diwaliHero from "../assets/hero-chocolates-diwali.svg";
import republicDayHero from "../assets/hero-chocolates-republic-day.svg";
import birthdayHero from "../assets/hero-chocolates-birthday.svg";
import monsoonHero from "../assets/hero-chocolates-monsoon.svg";
import christmasHero from "../assets/hero-chocolates-christmas.svg";
import valentinesDayHero from "../assets/hero-chocolates-valentines-day.svg";
import independenceDayHero from "../assets/hero-chocolates-independence-day.svg";
import pongalHero from "../assets/hero-chocolates-pongal.svg";

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
  decor?: { left: string; center: string; right: string };
}

export interface Theme {
  id: string;
  label: string;
  themeColor: string;
  category?: string;
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
  monsoon: {
    id: "monsoon",
    label: "Monsoon",
    themeColor: "#14595a",
    heroImage: {
      src: monsoonHero,
      alt: "Handmade chocolate bar with an umbrella and rain cloud",
    },
    banner: { text: "Monsoon treats! Warm chocolates for rainy evenings.", href: "store/" },
    heroBanner: {
      kicker: "Rainy-day cravings",
      title: "Monsoon Magic",
      text: "Cosy chocolates and gift boxes for grey skies, made fresh and wrapped with care.",
      cta: "Shop monsoon treats",
      href: "store/",
      decor: { left: "🌧️", center: "☔", right: "🌧️" },
    },
  },
  christmas: {
    id: "christmas",
    label: "Christmas",
    themeColor: "#0f3a27",
    heroImage: {
      src: christmasHero,
      alt: "Handmade chocolate bar with a Christmas tree and bauble",
    },
    banner: { text: "Merry Christmas! Gift boxes and hampers for the season.", href: "store/" },
    heroBanner: {
      kicker: "Season's greetings",
      title: "Merry Christmas",
      text: "Handmade chocolates and hampers to unwrap with the people you love.",
      cta: "Shop Christmas gifts",
      href: "store/",
      decor: { left: "🎄", center: "🎁", right: "🎄" },
    },
  },
  "republic-day": {
    id: "republic-day",
    label: "Republic Day",
    themeColor: "#0b3d91",
    heroImage: {
      src: republicDayHero,
      alt: "Handmade chocolate bar with a medal and Ashoka Chakra",
    },
    banner: { text: "Happy Republic Day! Celebrate with something sweet.", href: "store/" },
    heroBanner: {
      kicker: "26 January",
      title: "Happy Republic Day",
      text: "Handmade chocolates to share with family, friends and teams.",
      cta: "Shop sweet gifts",
      href: "store/",
      decor: { left: "🎖️", center: "⭐", right: "🎖️" },
    },
  },
  pongal: {
    id: "pongal",
    label: "Pongal",
    themeColor: "#7c2d0a",
    heroImage: {
      src: pongalHero,
      alt: "Handmade chocolate bar with a Pongal pot and sun",
    },
    banner: { text: "Happy Pongal! Sweet treats for the harvest festival.", href: "store/" },
    heroBanner: {
      kicker: "Harvest festival",
      title: "Happy Pongal",
      text: "Sweet handmade treats and gift boxes to share this harvest season.",
      cta: "Shop Pongal treats",
      href: "store/",
      decor: { left: "🌾", center: "🍯", right: "🌾" },
    },
  },
  birthday: {
    id: "birthday",
    label: "Birthday",
    themeColor: "#8a1f63",
    heroImage: {
      src: birthdayHero,
      alt: "Handmade chocolate bar with a birthday cake and balloon",
    },
    banner: { text: "Birthday treats! Gift boxes for every celebration.", href: "store/" },
    heroBanner: {
      kicker: "Time to celebrate",
      title: "Make it a sweet birthday",
      text: "Handmade chocolates and gift boxes for the birthday star in your life.",
      cta: "Shop birthday gifts",
      href: "store/",
      decor: { left: "🎈", center: "🎂", right: "🎈" },
    },
  },
  "independence-day": {
    id: "independence-day",
    label: "Independence Day",
    themeColor: "#0a4a20",
    heroImage: {
      src: independenceDayHero,
      alt: "Handmade chocolate bar with a tricolour kite and Ashoka Chakra",
    },
    banner: { text: "Happy Independence Day! Celebrate with something sweet.", href: "store/" },
    heroBanner: {
      kicker: "15 August",
      title: "Happy Independence Day",
      text: "Handmade chocolates to share the joy with family, friends and teams.",
      cta: "Shop sweet gifts",
      href: "store/",
      decor: { left: "🪁", center: "🕊️", right: "🪁" },
    },
  },
  "valentines-day": {
    id: "valentines-day",
    label: "Valentine's Day",
    themeColor: "#7d0c2b",
    heroImage: {
      src: valentinesDayHero,
      alt: "Handmade chocolate bar with hearts",
    },
    banner: { text: "Happy Valentine's Day! Share something sweet with someone special.", href: "store/" },
    heroBanner: {
      kicker: "With love",
      title: "Happy Valentine's Day",
      text: "Handmade chocolates and gift boxes for the one who makes your day.",
      cta: "Shop gifts of love",
      href: "store/",
      decor: { left: "💝", center: "🍫", right: "💝" },
    },
  },
};

const FALLBACK_THEME = "diwali";

const requested = (import.meta.env.PUBLIC_SITE_THEME ?? "").trim().toLowerCase();

// Every seasonal theme has a matching category; its banner and hero button open the shop filtered to it.
const THEME_CATEGORIES: Record<string, string> = {
  diwali: "Diwali Special",
  monsoon: "Monsoon Special",
  christmas: "Christmas Special",
  "republic-day": "Republic Day Special",
  pongal: "Pongal Special",
  birthday: "Birthday Special",
  "independence-day": "Independence Day Special",
  "valentines-day": "Valentine's Day Special",
};

export const THEME_CATEGORY_NAMES = Object.values(THEME_CATEGORIES);

for (const [id, category] of Object.entries(THEME_CATEGORIES)) {
  const entry = THEMES[id];
  if (!entry) continue;
  const href = `store/?category=${encodeURIComponent(category)}`;
  entry.category = category;
  if (entry.banner) entry.banner.href = href;
  if (entry.heroBanner) entry.heroBanner.href = href;
}

export const theme: Theme = THEMES[requested] ?? THEMES[requested === "" ? FALLBACK_THEME : "default"];
