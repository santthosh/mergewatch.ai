import { Nunito } from "next/font/google";

// Loaded via next/font so the Nunito 800 glyphs are self-hosted at build
// time — no runtime Google Fonts request and no FOUT on the wordmark.
const nunito = Nunito({
  subsets: ["latin"],
  weight: ["800"],
  display: "swap",
});

/**
 * Logomark glyph — arc + filled dot with a cream-highlight "eye".
 * Geometry is a 1:1 port of assets/mergewatch-wordmark.svg: arc stroke-
 * width 82, dot r=108, highlight r=32.4 at (474.2, 601.2). Arc + dot
 * inherit currentColor so the mark takes on the surrounding text color;
 * the highlight stays fixed at #F4F2EA per the brand spec.
 *
 * `size` sets the rendered height; width auto-scales to the glyph's
 * ~1.89:1 aspect ratio.
 */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  const width = Math.round(size * (692 / 366));
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="166 386 692 366"
      width={width}
      height={size}
      role="img"
      aria-label="MergeWatch logomark"
      className={className}
    >
      <path
        d="M 207 579.4 Q 512 274.4 817 579.4"
        fill="none"
        stroke="currentColor"
        strokeWidth={82}
        strokeLinecap="round"
      />
      <circle cx={512} cy={644.4} r={108} fill="currentColor" />
      {/* Highlight is the page-background color so it always reads as the
          inverse of the eye — dark on light-theme, light on dark-theme. */}
      <circle cx={474.2} cy={601.2} r={32.4} fill="var(--bg-page)" />
    </svg>
  );
}

/** Small icon variant for tight contexts (favicons, compact chrome). */
export function LogoIcon({ size = 20, className }: { size?: number; className?: string }) {
  return <LogoMark size={size} className={className} />;
}

/**
 * Full wordmark: logomark + "mergewatch" + dimmed ".ai".
 * Matches assets/mergewatch-wordmark.svg visually while adapting to the
 * active theme via currentColor — whatever `text-*` class the consumer
 * provides also sets the glyph fill.
 */
export function Wordmark({ iconSize = 28, className }: { iconSize?: number; className?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-2 text-fg-primary ${className ?? ""}`}>
      <LogoMark size={iconSize} className="shrink-0" />
      <span
        className={`whitespace-nowrap text-xl tracking-tight ${nunito.className}`}
        style={{ fontWeight: 800, letterSpacing: "-0.02em" }}
      >
        mergewatch<span className="opacity-55">.ai</span>
      </span>
    </span>
  );
}
