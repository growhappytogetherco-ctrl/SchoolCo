"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { LOGIN_CONFIG, LOGIN_QUOTES, RLA_BRAND } from "@/lib/login-config";

/**
 * Stock photos used when /public/login/ is empty.
 * Replace by dropping real RLA photos into /public/login/ — local files take priority.
 */
const FALLBACK_IMAGES = [
  // Bright classroom — students at desks with teacher
  "https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=1400&auto=format&fit=crop&q=80",
  // STEM / robotics — kids building and coding
  "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=1400&auto=format&fit=crop&q=80",
  // Family arrival — parent walking child to school entrance
  "https://images.unsplash.com/photo-1544776193-352d25ca82cd?w=1400&auto=format&fit=crop&q=80",
  // Small-group collaboration — students around a table learning together
  "https://images.unsplash.com/photo-1509062522246-3755977927d7?w=1400&auto=format&fit=crop&q=80",
];

/** Fisher-Yates shuffle — returns a new shuffled array */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Single crossfade slide ────────────────────────────────────────────────────
function HeroSlide({
  src,
  active,
  priority,
}: {
  src: string;
  active: boolean;
  priority: boolean;
}) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div
      aria-hidden={!active}
      className="absolute inset-0 transition-opacity"
      style={{
        opacity: active && loaded ? 1 : 0,
        transitionDuration: `${LOGIN_CONFIG.transitionDurationMs}ms`,
        transitionTimingFunction: "ease-in-out",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        aria-hidden="true"
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)} // don't block on broken URLs
        className="absolute inset-0 w-full h-full object-cover object-center"
        loading={priority ? "eager" : "lazy"}
        decoding={priority ? "sync" : "async"}
        fetchPriority={priority ? "high" : "low"}
      />
    </div>
  );
}

// ── Inspirational quote that fades between lines ───────────────────────────────
function RotatingQuote() {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (LOGIN_QUOTES.length <= 1) return;
    const id = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIdx(i => (i + 1) % LOGIN_QUOTES.length);
        setVisible(true);
      }, 500);
    }, 6000);
    return () => clearInterval(id);
  }, []);

  return (
    <p
      className="mt-4 text-white/75 text-sm leading-relaxed italic transition-opacity duration-500 max-w-xs"
      style={{ opacity: visible ? 1 : 0 }}
    >
      &ldquo;{LOGIN_QUOTES[idx]}&rdquo;
    </p>
  );
}

// ── Main hero panel ───────────────────────────────────────────────────────────
export function LoginHero() {
  // Start with fallbacks immediately — no blank screen while API loads
  const [images, setImages] = useState<string[]>(() =>
    LOGIN_CONFIG.randomOrder ? shuffle(FALLBACK_IMAGES) : FALLBACK_IMAGES
  );
  const [current, setCurrent] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pausedRef = useRef(false);

  // Try to load local images from /public/login/; if any exist, replace fallbacks
  useEffect(() => {
    fetch("/api/login-images")
      .then(r => r.json())
      .then(({ images: local }: { images: string[] }) => {
        if (local.length > 0) {
          const ordered = LOGIN_CONFIG.randomOrder ? shuffle(local) : local;
          setImages(ordered);
          setCurrent(0);
        }
        // If empty, keep the fallback images already loaded
      })
      .catch(() => {/* keep fallbacks */});
  }, []);

  const advance = useCallback((dir: 1 | -1) => {
    setCurrent(c => {
      const len = images.length;
      return len <= 1 ? c : (c + dir + len) % len;
    });
  }, [images.length]);

  // Auto-rotation — pauses when browser tab is hidden
  useEffect(() => {
    if (images.length <= 1) return;
    intervalRef.current = setInterval(() => {
      if (!pausedRef.current) setCurrent(c => (c + 1) % images.length);
    }, LOGIN_CONFIG.rotationIntervalMs);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [images.length]);

  useEffect(() => {
    const fn = () => { pausedRef.current = document.hidden; };
    document.addEventListener("visibilitychange", fn);
    return () => document.removeEventListener("visibilitychange", fn);
  }, []);

  const showControls = LOGIN_CONFIG.showControls && images.length > 1;

  return (
    <div className="relative flex flex-col h-full min-h-[500px] overflow-hidden">

      {/* ── Photo slides — always rendered (fallbacks load immediately) ── */}
      {images.map((src, i) => (
        <HeroSlide key={src} src={src} active={i === current} priority={i === 0} />
      ))}

      {/* ── Dark overlay so white text reads cleanly over any photo ── */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/25 to-black/65" />

      {/* ── Content ── */}
      <div className="relative z-10 flex flex-col h-full p-8 lg:p-12 select-none">

        {/* SchoolCo wordmark — small, top-left */}
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 ring-1 ring-white/25 backdrop-blur-sm">
            <span className="text-white text-[9px] font-bold font-serif leading-none tracking-tight">
              SC
            </span>
          </div>
          <span className="text-white/60 text-[11px] font-medium tracking-[0.15em] uppercase">
            Powered by SchoolCo
          </span>
        </div>

        {/* RLA identity — vertically centered */}
        <div className="flex-1 flex flex-col justify-center">
          <p className="text-sc-teal text-xs font-bold tracking-[0.2em] uppercase mb-5">
            Welcome to
          </p>

          <h1 className="font-serif text-white font-bold leading-none">
            <span className="block text-[2.6rem] lg:text-[3.25rem] tracking-tight">
              Rising Leaders
            </span>
            <span className="block text-[2.6rem] lg:text-[3.25rem] tracking-tight mt-0.5">
              Academy
            </span>
          </h1>

          <p className="mt-5 text-white/85 text-base lg:text-lg font-light tracking-wide">
            {RLA_BRAND.tagline}
          </p>

          {/* Faith · Leadership · Excellence */}
          <div className="mt-5 flex items-center" aria-label="School pillars">
            {RLA_BRAND.pillars.map((pillar, i) => (
              <span key={pillar} className="flex items-center">
                <span className="text-white text-sm font-semibold tracking-widest uppercase">
                  {pillar}
                </span>
                {i < RLA_BRAND.pillars.length - 1 && (
                  <span className="mx-3 text-sc-teal font-bold text-base leading-none">·</span>
                )}
              </span>
            ))}
          </div>

          <RotatingQuote />
        </div>

        {/* Slideshow controls + dot indicators */}
        <div className="mt-6 flex items-center gap-3">
          {showControls && (
            <button
              onClick={() => advance(-1)}
              aria-label="Previous photo"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 hover:bg-white/30 transition-colors ring-1 ring-white/20 text-white"
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </button>
          )}

          {images.length > 1 && (
            <div className="flex items-center gap-1.5" role="tablist" aria-label="Photo slideshow">
              {images.map((_, i) => (
                <button
                  key={i}
                  role="tab"
                  aria-selected={i === current}
                  aria-label={`Photo ${i + 1} of ${images.length}`}
                  onClick={() => setCurrent(i)}
                  className={[
                    "rounded-full transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
                    i === current
                      ? "w-5 h-1.5 bg-sc-teal"
                      : "w-1.5 h-1.5 bg-white/35 hover:bg-white/65",
                  ].join(" ")}
                />
              ))}
            </div>
          )}

          {showControls && (
            <button
              onClick={() => advance(1)}
              aria-label="Next photo"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 hover:bg-white/30 transition-colors ring-1 ring-white/20 text-white"
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
