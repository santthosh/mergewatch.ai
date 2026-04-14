/** Inline SVG logo — "The Merge Eye" */
export function LogoMark({ size = 24, className }: { size?: number; className?: string }) {
  const h = size;
  const w = Math.round(size * (200 / 110));
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 200 110"
      fill="none"
      width={w}
      height={h}
      className={className}
    >
      <path d="M10 55 C10 55, 50 5, 100 5 C150 5, 190 55, 190 55 C190 55, 150 105, 100 105 C50 105, 10 55, 10 55 Z" stroke="#00ff88" strokeWidth="4" fill="none" strokeLinejoin="round"/>
      <path d="M25 55 C25 55, 55 15, 100 15 C145 15, 175 55, 175 55" stroke="#00ff88" strokeWidth="2" fill="none" opacity="0.3"/>
      <circle cx="100" cy="55" r="28" stroke="#00ff88" strokeWidth="3" fill="none"/>
      <circle cx="100" cy="55" r="14" fill="#00ff88"/>
      <circle cx="107" cy="48" r="4" fill="#000"/>
      <circle cx="107" cy="48" r="3" fill="#fff" opacity="0.9"/>
      <circle cx="16" cy="55" r="5" fill="#00ff88"/>
      <circle cx="184" cy="55" r="5" fill="#00ff88"/>
      <line x1="16" y1="55" x2="40" y2="30" stroke="#00ff88" strokeWidth="2" opacity="0.4"/>
      <line x1="16" y1="55" x2="40" y2="80" stroke="#00ff88" strokeWidth="2" opacity="0.4"/>
      <line x1="184" y1="55" x2="160" y2="30" stroke="#00ff88" strokeWidth="2" opacity="0.4"/>
      <line x1="184" y1="55" x2="160" y2="80" stroke="#00ff88" strokeWidth="2" opacity="0.4"/>
    </svg>
  );
}

/** Small icon variant for favicon-sized contexts */
export function LogoIcon({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      fill="none"
      width={size}
      height={size}
      className={className}
    >
      <path d="M2 16 C2 16, 8 4, 16 4 C24 4, 30 16, 30 16 C30 16, 24 28, 16 28 C8 28, 2 16, 2 16 Z" stroke="#00ff88" strokeWidth="2.5" fill="none" strokeLinejoin="round"/>
      <circle cx="16" cy="16" r="6" fill="#00ff88"/>
      <circle cx="18" cy="14" r="1.5" fill="#000"/>
      <circle cx="4" cy="16" r="2" fill="#00ff88"/>
    </svg>
  );
}

/** Full wordmark: logo icon + "merge" white + "watch" green + ".ai" */
export function Wordmark({ iconSize = 20, className }: { iconSize?: number; className?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 ${className ?? ""}`}>
      <LogoIcon
        size={iconSize}
        className="shrink-0"
      />
      <span className="whitespace-nowrap text-lg font-bold tracking-tight">
        <span className="text-fg-primary">merge</span>
        <span className="text-accent-green">watch</span>
        <span className="text-fg-tertiary">.ai</span>
      </span>
    </span>
  );
}
