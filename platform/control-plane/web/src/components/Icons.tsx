import type { ReactElement, SVGProps } from "react";

function icon(Wrapped: (p: SVGProps<SVGSVGElement>) => ReactElement) {
  return function Icon(props: SVGProps<SVGSVGElement>) {
    return (
      <Wrapped
        width={20}
        height={20}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        {...props}
      />
    );
  };
}

export const IconDashboard = icon((p) => (
  <svg {...p}>
    <rect x="3" y="3" width="7" height="9" rx="1" />
    <rect x="14" y="3" width="7" height="5" rx="1" />
    <rect x="14" y="12" width="7" height="9" rx="1" />
    <rect x="3" y="16" width="7" height="5" rx="1" />
  </svg>
));

export const IconFolder = icon((p) => (
  <svg {...p}>
    <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.89l-.812-1.22A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
  </svg>
));

export const IconCpu = icon((p) => (
  <svg {...p}>
    <rect x="6" y="6" width="12" height="12" rx="2" />
    <path d="M9 6V4M15 6V4M9 18v2M15 18v2M18 9h2M18 15h2M6 9H4M6 15H4" />
  </svg>
));

export const IconSmartphone = icon((p) => (
  <svg {...p}>
    <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
    <path d="M12 18h.01" />
  </svg>
));

export const IconUsers = icon((p) => (
  <svg {...p}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
));

export const IconWebhook = icon((p) => (
  <svg {...p}>
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
));

export const IconChevronRight = icon((p) => (
  <svg {...p}>
    <path d="m9 18 6-6-6-6" />
  </svg>
));
