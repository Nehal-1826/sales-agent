/** Minimal inline stroke icons — no icon-library dependency. */

type IconProps = { size?: number; className?: string };

function base(size = 18, className?: string) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    'aria-hidden': true,
  };
}

export const IconDashboard = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
    <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
    <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
  </svg>
);

export const IconAgents = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <circle cx="12" cy="5" r="2.5" />
    <circle cx="5" cy="19" r="2.5" />
    <circle cx="19" cy="19" r="2.5" />
    <path d="M12 7.5v4M12 11.5 6.4 16.8M12 11.5l5.6 5.3" />
  </svg>
);

export const IconCrm = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <rect x="3" y="4" width="5" height="16" rx="1.5" />
    <rect x="9.5" y="4" width="5" height="11" rx="1.5" />
    <rect x="16" y="4" width="5" height="7" rx="1.5" />
  </svg>
);

export const IconChat = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M21 12a8 8 0 0 1-8 8H4l2.2-2.6A8 8 0 1 1 21 12Z" />
    <path d="M8.5 11h7M8.5 14.5h4" />
  </svg>
);

export const IconSettings = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2.2" />
    <circle cx="9" cy="17" r="2.2" />
  </svg>
);

export const IconSearch = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.4-4.4" />
  </svg>
);

export const IconProfile = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" />
    <circle cx="10" cy="10" r="2.4" />
    <path d="M6.5 16.5c.6-1.8 1.9-2.6 3.5-2.6s2.9.8 3.5 2.6M15 9.5h3M15 13h2" />
  </svg>
);

export const IconPen = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M14.5 5.5 18.5 9.5 8 20H4v-4L14.5 5.5Z" />
    <path d="m12.5 7.5 4 4" />
  </svg>
);

export const IconBot = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <rect x="4.5" y="7.5" width="15" height="11" rx="2.5" />
    <path d="M12 4.5v3M9 12.5h.01M15 12.5h.01M9.5 15.8c1.6.9 3.4.9 5 0" />
  </svg>
);

export const IconLoop = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M20 12a8 8 0 1 1-2.34-5.66" />
    <path d="M20 3.5V7h-3.5" />
  </svg>
);

export const IconUser = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <circle cx="12" cy="8.5" r="3.5" />
    <path d="M5 20c.8-3.6 3.4-5.3 7-5.3s6.2 1.7 7 5.3" />
  </svg>
);

export const IconList = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M8.5 6h12M8.5 12h12M8.5 18h12" />
    <circle cx="4.3" cy="6" r="1" />
    <circle cx="4.3" cy="12" r="1" />
    <circle cx="4.3" cy="18" r="1" />
  </svg>
);

export const IconOrchestrator = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <circle cx="12" cy="5.5" r="2.5" />
    <rect x="3.5" y="16" width="5" height="5" rx="1.2" />
    <rect x="15.5" y="16" width="5" height="5" rx="1.2" />
    <path d="M12 8v4M12 12l-6 4M12 12l6 4" />
  </svg>
);

export const IconDatabase = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <ellipse cx="12" cy="5.5" rx="7.5" ry="2.8" />
    <path d="M4.5 5.5v13c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-13M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8" />
  </svg>
);

export const IconPlug = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M9 3v5M15 3v5M7 8h10v3a5 5 0 0 1-10 0V8ZM12 16v5" />
  </svg>
);

export const IconSend = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M4 11.5 20 4l-7.5 16-2-6.5L4 11.5Z" />
  </svg>
);

export const iconForAgent: Record<string, (p: IconProps) => JSX.Element> = {
  search: IconSearch,
  profile: IconProfile,
  copywright: IconPen,
  responder: IconBot,
};
