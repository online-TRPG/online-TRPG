export function Icon({ name }: { name: string }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (name) {
    case "logo":
      return (
        <svg {...common}>
          <path d="M12 3l7.5 4.5v9L12 21l-7.5-4.5v-9L12 3z" />
          <path d="M12 8v8M8.5 10l7 4M15.5 10l-7 4" />
        </svg>
      );
    case "plus":
      return (
        <svg {...common}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case "search":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-4-4" />
        </svg>
      );
    case "enter":
      return (
        <svg {...common}>
          <path d="M9 18l6-6-6-6" />
          <path d="M15 12H3" />
          <path d="M21 4v16" />
        </svg>
      );
    case "copy":
      return (
        <svg {...common}>
          <rect x="8" y="8" width="11" height="11" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
        </svg>
      );
    case "x":
      return (
        <svg {...common}>
          <path d="M18 6 6 18" />
          <path d="M6 6l12 12" />
        </svg>
      );
    case "logout":
      return (
        <svg {...common}>
          <path d="M10 17l5-5-5-5" />
          <path d="M15 12H3" />
          <path d="M21 4v16" />
        </svg>
      );
    case "chevron-down":
      return (
        <svg {...common}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      );
    case "message-circle":
      return (
        <svg {...common}>
          <path d="M21 11.5a8.5 8.5 0 0 1-12.9 7.3L3 20l1.2-4.7A8.5 8.5 0 1 1 21 11.5z" />
        </svg>
      );
    case "users":
      return (
        <svg {...common}>
          <path d="M16 20c0-2.8-2.7-5-6-5s-6 2.2-6 5" />
          <circle cx="10" cy="8" r="4" />
          <path d="M20 19c0-2.1-1.6-3.9-3.8-4.6" />
          <path d="M16.5 4.6a3 3 0 0 1 0 5.8" />
        </svg>
      );
    case "help-circle":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 9a2.8 2.8 0 0 1 5.2 1.5c0 2-2.7 2.2-2.7 4" />
          <path d="M12 18h.01" />
        </svg>
      );
    case "hand":
      return (
        <svg {...common}>
          <path d="M8 11V5a2 2 0 0 1 4 0v5" />
          <path d="M12 10V4a2 2 0 0 1 4 0v8" />
          <path d="M16 11V7a2 2 0 0 1 4 0v7c0 4-2.7 7-7 7h-1c-2.2 0-3.7-.9-5-2.5L3.7 14a2 2 0 0 1 3.1-2.5L9 14" />
        </svg>
      );
    case "ear":
      return (
        <svg {...common}>
          <path d="M6 10a6 6 0 0 1 12 0c0 4-4 4.5-4 8a3 3 0 0 1-5.8 1" />
          <path d="M9 10a3 3 0 1 1 6 0c0 2-2.5 2.2-2.5 4.5" />
        </svg>
      );
    case "move":
      return (
        <svg {...common}>
          <path d="M12 3v18M3 12h18" />
          <path d="M8 7l4-4 4 4M16 17l-4 4-4-4M7 8l-4 4 4 4M17 8l4 4-4 4" />
        </svg>
      );
    case "tool":
      return (
        <svg {...common}>
          <path d="M14.7 6.3a4 4 0 0 0 5 5L11 20l-5-5 8.7-8.7z" />
          <path d="M6 15l3 3" />
        </svg>
      );
    case "map":
      return (
        <svg {...common}>
          <path d="M9 18l-6 3V6l6-3 6 3 6-3v15l-6 3-6-3z" />
          <path d="M9 3v15M15 6v15" />
        </svg>
      );
    case "crosshair":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="7" />
          <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
          <circle cx="12" cy="12" r="2" />
        </svg>
      );
    case "clock":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case "wand":
      return (
        <svg {...common}>
          <path d="M15 4l5 5L8 21l-5-5L15 4z" />
          <path d="M13 6l5 5" />
          <path d="M5 4v3M3.5 5.5h3M20 17v3M18.5 18.5h3" />
        </svg>
      );
    case "eye":
      return (
        <svg {...common}>
          <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" />
          <circle cx="12" cy="12" r="2.5" />
        </svg>
      );
    case "shield":
      return (
        <svg {...common}>
          <path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3z" />
        </svg>
      );
    case "spark":
      return (
        <svg {...common}>
          <path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2z" />
          <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" />
        </svg>
      );
    case "rest":
      return (
        <svg {...common}>
          <path d="M4 14a8 8 0 0 0 13.6 5.7A8.5 8.5 0 0 1 13 3a8 8 0 0 0-9 11z" />
        </svg>
      );
    case "user":
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
        </svg>
      );
    case "settings":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a2 2 0 0 1-4 0v-.2a1 1 0 0 0-.7-.9 1 1 0 0 0-1.1.2l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a2 2 0 0 1 0-4h.2a1 1 0 0 0 .9-.7 1 1 0 0 0-.2-1.1l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a2 2 0 0 1 4 0v.2a1 1 0 0 0 .7.9 1 1 0 0 0 1.1-.2l.1-.1a2 2 0 0 1 2.8 2.8l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6h.2a2 2 0 0 1 0 4h-.2a1 1 0 0 0-.9.7Z" />
        </svg>
      );
    case "maximize":
      return (
        <svg {...common}>
          <path d="M15 3h6v6" />
          <path d="M9 21H3v-6" />
          <path d="M21 3l-7 7" />
          <path d="M3 21l7-7" />
        </svg>
      );
    case "minimize":
      return (
        <svg {...common}>
          <path d="M4 14h6v6" />
          <path d="M20 10h-6V4" />
          <path d="M14 10l7-7" />
          <path d="M3 21l7-7" />
        </svg>
      );
    case "send":
      return (
        <svg {...common}>
          <path d="M22 2 11 13" />
          <path d="m22 2-7 20-4-9-9-4Z" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
        </svg>
      );
  }
}
