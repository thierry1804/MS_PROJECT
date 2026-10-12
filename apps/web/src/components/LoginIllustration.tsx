/**
 * Decorative half of the login split-screen: an editorial line-drawing of a
 * drafting table — the literal "table à dessin" DESIGN.md names as this
 * app's concept — not a UI screenshot or stock photo. Flat line art, ink/paper
 * palette only, one accent touch on the pencil ferrule.
 */
export function LoginIllustration() {
  return (
    <svg viewBox="0 0 480 640" fill="none" aria-hidden="true" className="login-illustration">
      <defs>
        <filter id="paper-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="10" stdDeviation="14" floodColor="var(--ink-0)" floodOpacity="0.16" />
        </filter>
      </defs>

      {/* Drafting table top */}
      <rect x="30" y="140" width="420" height="440" rx="8" fill="var(--paper-2)" transform="rotate(-2.5 240 360)" />
      {/* Table edge / leg hint */}
      <path d="M50 560 L30 610 M430 560 L450 610" stroke="var(--ink-3)" strokeWidth="6" strokeLinecap="round" />

      {/* Paper sheet, slightly rotated, with drop shadow */}
      <g filter="url(#paper-shadow)">
        <rect
          x="78"
          y="96"
          width="300"
          height="400"
          rx="4"
          fill="var(--paper-0)"
          stroke="var(--ink-3)"
          strokeWidth="1.5"
          transform="rotate(2 228 296)"
        />
      </g>

      {/* Sketch on the paper: a simple plan outline + dimension line + note dashes */}
      <g transform="rotate(2 228 296)" stroke="var(--ink-2)" strokeWidth="1.3" strokeLinecap="round">
        <rect x="112" y="150" width="190" height="130" fill="none" />
        <line x1="112" y1="150" x2="88" y2="126" />
        <line x1="302" y1="150" x2="326" y2="126" />
        <line x1="88" y1="126" x2="326" y2="126" strokeDasharray="2 5" />
        <line x1="130" y1="310" x2="190" y2="310" />
        <line x1="130" y1="326" x2="250" y2="326" />
        <line x1="130" y1="342" x2="210" y2="342" />
        <line x1="150" y1="200" x2="210" y2="200" opacity="0.5" />
        <line x1="150" y1="216" x2="265" y2="216" opacity="0.5" />
        <circle cx="330" cy="420" r="18" />
        <line x1="330" y1="402" x2="330" y2="438" />
        <line x1="312" y1="420" x2="348" y2="420" />
      </g>

      {/* Triangle set-square */}
      <polygon
        points="300,330 420,330 300,440"
        fill="var(--paper-1)"
        fillOpacity="0.92"
        stroke="var(--ink-3)"
        strokeWidth="1.5"
        transform="rotate(4 360 385)"
      />

      {/* T-square / ruler, diagonal across the sheet */}
      <g transform="rotate(-28 240 300)">
        <rect x="70" y="470" width="340" height="20" rx="2" fill="var(--paper-0)" stroke="var(--ink-1)" strokeWidth="1.5" />
        {Array.from({ length: 16 }, (_, i) => 80 + i * 20).map((x) => (
          <line key={x} x1={x} y1="470" x2={x} y2={x % 40 === 0 ? 480 : 476} stroke="var(--ink-2)" strokeWidth="1" />
        ))}
      </g>

      {/* Pencil, resting diagonally */}
      <g transform="rotate(38 150 500)">
        <rect x="70" y="492" width="150" height="14" rx="3" fill="var(--ink-1)" />
        <rect x="70" y="492" width="22" height="14" fill="var(--accent)" />
        <path d="M220 492 L240 499 L220 506 Z" fill="var(--ink-0)" />
      </g>

      {/* Compass, top-left corner of the table */}
      <g transform="translate(60 180) rotate(-12)" stroke="var(--ink-2)" strokeWidth="1.4" strokeLinecap="round">
        <path d="M0 0 L-22 46" />
        <path d="M0 0 L20 46" />
        <circle cx="0" cy="0" r="4" fill="var(--ink-2)" stroke="none" />
        <path d="M-22 46 A 22 22 0 0 1 20 46" fill="none" strokeDasharray="1 4" opacity="0.6" />
      </g>
    </svg>
  );
}
