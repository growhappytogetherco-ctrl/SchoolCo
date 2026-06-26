/**
 * TodaysBlessing
 * Displays a rotating scripture-based encouragement.
 * Org-agnostic — works for any Christ-centered organization on the platform.
 * The blessing rotates daily (deterministically based on day-of-year).
 */

const BLESSINGS = [
  {
    quote:
      "Let no one despise your youth, but set the believers an example in speech, in conduct, in love, in faith, in purity.",
    reference: "1 Timothy 4:12",
  },
  {
    quote:
      "Train up a child in the way he should go; even when he is old he will not depart from it.",
    reference: "Proverbs 22:6",
  },
  {
    quote:
      "I can do all things through him who strengthens me.",
    reference: "Philippians 4:13",
  },
  {
    quote:
      "For I know the plans I have for you, declares the Lord, plans for welfare and not for evil, to give you a future and a hope.",
    reference: "Jeremiah 29:11",
  },
  {
    quote:
      "Whatever you do, work heartily, as for the Lord and not for men.",
    reference: "Colossians 3:23",
  },
  {
    quote:
      "The fear of the Lord is the beginning of wisdom, and knowledge of the Holy One is understanding.",
    reference: "Proverbs 9:10",
  },
  {
    quote:
      "Commit your work to the Lord, and your plans will be established.",
    reference: "Proverbs 16:3",
  },
  {
    quote:
      "Do not be conformed to this world, but be transformed by the renewal of your mind.",
    reference: "Romans 12:2",
  },
  {
    quote:
      "She is clothed with strength and dignity, and she laughs without fear of the future.",
    reference: "Proverbs 31:25",
  },
  {
    quote:
      "And whatever you do, in word or deed, do everything in the name of the Lord Jesus.",
    reference: "Colossians 3:17",
  },
];

function getDailyBlessing() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
  return BLESSINGS[dayOfYear % BLESSINGS.length];
}

interface TodaysBlessingProps {
  className?: string;
  compact?: boolean;
}

export function TodaysBlessing({ className = "", compact = false }: TodaysBlessingProps) {
  const blessing = getDailyBlessing();

  if (compact) {
    return (
      <div className={`text-center ${className}`}>
        <p className="text-body-sm text-white/90 italic leading-relaxed">
          &ldquo;{blessing.quote}&rdquo;
        </p>
        <p className="text-label-sm text-white/70 mt-1 font-medium">
          — {blessing.reference}
        </p>
      </div>
    );
  }

  return (
    <div className={`rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 p-4 ${className}`}>
      <p className="text-label-sm font-semibold text-white/80 uppercase tracking-wider mb-2">
        Today&apos;s Blessing
      </p>
      <blockquote className="text-body-sm text-white/95 italic leading-relaxed">
        &ldquo;{blessing.quote}&rdquo;
      </blockquote>
      <cite className="block text-label-sm text-white/70 mt-2 not-italic font-medium">
        — {blessing.reference}
      </cite>
    </div>
  );
}
