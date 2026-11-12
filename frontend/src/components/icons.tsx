import type { ReactNode } from "react";

// The prototype's star icon (our own drawing).
export function StarIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
    </svg>
  );
}

// Small line icons from the prototype, for card fronts.
function Icon({ size, children }: { size: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const CheckIcon = () => (
  <Icon size={12}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Icon>
);
export const ClockIcon = () => (
  <Icon size={12}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Icon>
);
export const LinesIcon = () => (
  <Icon size={13}>
    <path d="M5 7h14M5 12h14M5 17h9" />
  </Icon>
);
export const BubbleIcon = () => (
  <Icon size={13}>
    <path d="M5 5h14v10H10l-5 4z" />
  </Icon>
);
export const TickboxIcon = () => (
  <Icon size={13}>
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <path d="M8 12l3 3 5-6" />
  </Icon>
);
export const ArchiveIcon = () => (
  <Icon size={14}>
    <rect x="3" y="4" width="18" height="5" rx="1" />
    <path d="M5 9v10h14V9M10 13h4" />
  </Icon>
);
export const DotsIcon = () => (
  <Icon size={16}>
    <circle cx="5" cy="12" r="1.2" />
    <circle cx="12" cy="12" r="1.2" />
    <circle cx="19" cy="12" r="1.2" />
  </Icon>
);
