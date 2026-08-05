// Which edition of SnowPoint this build is.
//
// The app ships as two deployments from this one codebase, so there is only
// ever one place to fix a bug or add a feature:
//
//   full   (default) — everything, including Webcams and Snow Reports. This is
//                      the original site, shared with friends and family.
//   public           — Forecast / Map / High-Res only. No webcams, no snow
//                      reports. This is the one that gets shared widely.
//
// Selected at BUILD time by the VITE_APP_EDITION environment variable, set per
// Vercel project (leave it unset for the full edition; set it to "public" on
// the public project). Because Vite substitutes the literal string at build
// time, the flags below fold to constants and the bundler drops the disabled
// features' code from the public bundle rather than shipping it disabled.
//
// Unset is deliberately the full edition: a fresh clone, `npm run dev`, and the
// existing Vercel project all keep behaving exactly as they did before, and a
// missing/typo'd variable fails towards the version we control rather than
// silently stripping features from the family site.
export const EDITION = import.meta.env.VITE_APP_EDITION === 'public' ? 'public' : 'full'
export const IS_PUBLIC = EDITION === 'public'

// Feature flags rather than `IS_PUBLIC` checks at the call sites: the point of
// each guard is "this build has webcams", which stays readable if the editions
// are ever sliced differently.
export const HAS_WEBCAMS = !IS_PUBLIC
export const HAS_SNOW_REPORTS = !IS_PUBLIC
// The AI summary button calls two paid-tier-adjacent APIs (Gemini, ElevenLabs)
// from every click — fine for the friends-and-family audience, not something
// to expose to a public Facebook-group-sized crowd.
export const HAS_AI_SUMMARY = !IS_PUBLIC
