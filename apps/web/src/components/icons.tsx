/** Minimal line icons for the toolbar: 16px viewbox, 1.3 stroke, currentColor. Consistent family, no fill. */
const base = {
  width: 14,
  height: 14,
  viewBox: "0 0 16 16",
  fill: "none",
  "aria-hidden": true,
} as const;

export function PlusIcon() {
  return (
    <svg {...base}>
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function SubtaskIcon() {
  return (
    <svg {...base}>
      <path
        d="M4 2.5v6c0 1 .6 1.5 1.6 1.5H10M8.3 7.7 10.4 10l-2.1 2.3"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12.7 3v4M10.7 5h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export function IndentIcon() {
  return (
    <svg {...base}>
      <path
        d="M2.5 4h11M2.5 8h5M2.5 12h11M6 6.3 8.3 8 6 9.7"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function OutdentIcon() {
  return (
    <svg {...base}>
      <path
        d="M2.5 4h11M6.5 8h7M2.5 12h11M8.5 6.3 6.2 8l2.3 1.7"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2.7 4.2h10.6M6 4.2V2.9c0-.4.3-.7.7-.7h2.6c.4 0 .7.3.7.7v1.3M3.6 4.2l.5 8.5c0 .5.5 1 1 1h5.8c.5 0 1-.5 1-1l.5-8.5M6.6 6.9v4.1M9.4 6.9v4.1"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function FlagIcon() {
  return (
    <svg {...base}>
      <path
        d="M4 13.5V2.5M4 3.2c1.4-.9 2.8-.9 4.2 0s2.8.9 4.2 0v6c-1.4.9-2.8.9-4.2 0s-2.8-.9-4.2 0"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function GapIcon() {
  return (
    <svg {...base}>
      <path
        d="M4.5 2.5v11M11.5 2.5v11M7 8h2M7.8 6.2 6 8l1.8 1.8M8.2 6.2 10 8l-1.8 1.8"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ScaleIcon() {
  return (
    <svg {...base}>
      <path
        d="M8 2.5v11M4.8 4.5h6.4M2.5 4.5 4.8 9a2.3 2.3 0 0 0 4.6 0L6 9m6.5-4.5L10.6 9a2.3 2.3 0 0 0 4.6 0l-2.1-4.5"
        stroke="currentColor"
        strokeWidth="1.15"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DownloadIcon() {
  return (
    <svg {...base}>
      <path
        d="M8 2.5v7.3M4.8 7 8 10.2 11.2 7M3 13h10"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DocIcon() {
  return (
    <svg {...base}>
      <path
        d="M5 2.5h4.2L11.5 5v8.5h-6.5z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M9 2.5V5h2.5M6.3 8h3M6.3 10.2h3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}
