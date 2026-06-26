/**
 * LoginHero
 * Left-side hero panel on the login page.
 * Features the tagline, a rotating inspirational quote, and the platform branding.
 * Image slot is ready for a Supabase-hosted rotating hero photo.
 */
import { TodaysBlessing } from "@/components/shared/TodaysBlessing";
import { APP_TAGLINE } from "@/lib/constants";

// Hero images cycle every render (server-side, deterministic by day).
const HERO_IMAGES = [
  "https://images.unsplash.com/photo-1544776193-352d25ca82cd?w=900&auto=format&fit=crop&q=80", // students learning
  "https://images.unsplash.com/photo-1509062522246-3755977927d7?w=900&auto=format&fit=crop&q=80", // classroom
  "https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=900&auto=format&fit=crop&q=80", // community
];

function getDailyHero() {
  const start = new Date(new Date().getFullYear(), 0, 0);
  const day   = Math.floor((Date.now() - start.getTime()) / 86400000);
  return HERO_IMAGES[day % HERO_IMAGES.length];
}

export function LoginHero() {
  const heroUrl = getDailyHero();

  return (
    <div className="relative flex flex-col h-full min-h-[500px] overflow-hidden rounded-2xl lg:rounded-none lg:rounded-l-2xl">
      {/* Background image */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${heroUrl})` }}
        role="img"
        aria-label="Students learning and growing together"
      />

      {/* Gradient overlay — navy to transparent */}
      <div className="absolute inset-0 bg-gradient-to-b from-sc-navy/80 via-sc-navy/50 to-sc-navy/85" />

      {/* Content */}
      <div className="relative z-10 flex flex-col h-full p-8 lg:p-10">
        {/* Top: Logo mark */}
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
            <svg viewBox="0 0 24 24" fill="none" className="size-4 text-white" aria-hidden="true">
              <path
                d="M12 21C12 21 3 14.5 3 8.5C3 5.42 5.42 3 8.5 3C10.24 3 11.91 3.81 13 5.08C14.09 3.81 15.76 3 17.5 3C20.58 3 23 5.42 23 8.5C23 14.5 12 21 12 21Z"
                fill="currentColor"
                opacity="0.6"
              />
              <path
                d="M12 21C12 21 1 14.5 1 8.5C1 5.42 3.42 3 6.5 3C8.24 3 9.91 3.81 11 5.08C12.09 3.81 13.76 3 15.5 3C18.58 3 21 5.42 21 8.5C21 14.5 12 21 12 21Z"
                fill="currentColor"
              />
            </svg>
          </div>
          <span className="text-white font-serif font-semibold text-lg tracking-wide">
            SchoolCo.
          </span>
        </div>

        {/* Middle: Tagline */}
        <div className="flex-1 flex flex-col justify-center mt-8">
          <h1 className="font-serif text-white text-balance leading-tight">
            <span className="block text-3xl lg:text-4xl font-bold">Every Child Known.</span>
            <span className="block text-3xl lg:text-4xl font-bold mt-1">Every Family Connected.</span>
            <span className="block text-3xl lg:text-4xl font-bold mt-1">Every Leader Developed.</span>
          </h1>

          <p className="mt-5 text-body-md text-white/80 max-w-sm leading-relaxed">
            {APP_TAGLINE.split(".")[3] /* after the three tagline parts */ ||
              "We're honored to partner with your family on a journey of faith, learning, and leadership."}
          </p>
        </div>

        {/* Bottom: Today's Blessing */}
        <TodaysBlessing className="mt-6" />

        {/* Footer branding */}
        <p className="mt-6 text-label-sm text-white/50">
          Powered by SchoolCo · Every family, every story.
        </p>
      </div>
    </div>
  );
}
