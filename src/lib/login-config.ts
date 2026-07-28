/**
 * Login page configuration.
 * No code changes needed to swap photos — just add/remove files from /public/login/
 */
export const LOGIN_CONFIG = {
  // Milliseconds between slide transitions (8000 = 8 seconds)
  rotationIntervalMs: 8000,

  // Crossfade duration in milliseconds
  transitionDurationMs: 1000,

  // Show previous/next arrow controls
  showControls: true,

  // Shuffle image order on each page load
  randomOrder: false,

  // If set, this image is always shown first (filename only, e.g. "hero.jpg")
  defaultImage: null as string | null,
} as const;

/** Inspirational statements that rotate beneath the school name */
export const LOGIN_QUOTES = [
  "Developing tomorrow's leaders.",
  "Growing faith, character, and purpose.",
  "Learning with purpose.",
  "Every child known. Every family connected.",
  "Where leadership begins.",
  "Rooted in faith. Rising in excellence.",
];

/** RLA branding shown in the hero panel */
export const RLA_BRAND = {
  schoolName:  "Rising Leaders Academy",
  tagline:     "Education That Goes Beyond the Classroom",
  pillars:     ["Faith", "Leadership", "Excellence"],
  logo:        "/logo.png",       // place your logo at /public/logo.png
  accent:      "Faith · Leadership · Excellence",
} as const;
