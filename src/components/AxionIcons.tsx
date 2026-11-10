import React from 'react';

export function AxionIconSprite() {
  return (
    <svg className="hidden" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <defs>
        {/* 1. NAVIGATION & CORE SHELL */}
        <symbol id="ax-tasks" viewBox="0 0 24 24">
          <rect x="3.5" y="4.5" width="4" height="4" rx="1" />
          <path d="M10.5 6.5h10" />
          <rect x="3.5" y="10" width="4" height="4" rx="1" />
          <path d="M10.5 12h10" />
          <rect x="3.5" y="15.5" width="4" height="4" rx="1" />
          <path d="M10.5 17.5h6" />
        </symbol>
        <symbol id="ax-archive" viewBox="0 0 24 24">
          <rect x="3" y="4" width="18" height="4" rx="1.2" />
          <path d="M4.5 8v10.5A2.5 2.5 0 0 0 7 21h10a2.5 2.5 0 0 0 2.5-2.5V8" />
          <path d="M10 12.5h4" />
        </symbol>
        <symbol id="ax-analysis" viewBox="0 0 24 24">
          <path d="M3.5 19.5h17" />
          <rect x="5.5" y="11" width="3" height="8.5" rx="0.8" />
          <rect x="10.5" y="6" width="3" height="13.5" rx="0.8" />
          <rect x="15.5" y="9" width="3" height="10.5" rx="0.8" />
        </symbol>
        <symbol id="ax-goals" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="8.5" />
          <circle cx="12" cy="12" r="4.5" />
          <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
        </symbol>
        <symbol id="ax-review" viewBox="0 0 24 24">
          <rect x="3.5" y="4.5" width="17" height="16" rx="2.5" />
          <path d="M8 3v3M16 3v3M3.5 9.5h17" />
          <path d="M9.5 14.5l1.8 1.8 3.7-3.8" />
        </symbol>
        <symbol id="ax-settings" viewBox="0 0 24 24">
          <path d="M4 7h9M17 7h3" />
          <circle cx="15" cy="7" r="2" />
          <path d="M4 12h3M11 12h9" />
          <circle cx="9" cy="12" r="2" />
          <path d="M4 17h11M19 17h1" />
          <circle cx="17" cy="17" r="2" />
        </symbol>
        <symbol id="ax-account" viewBox="0 0 24 24">
          <circle cx="12" cy="8.5" r="3.8" />
          <path d="M5 19.5c1.5-3.3 4-5 7-5s5.5 1.7 7 5" />
        </symbol>
        <symbol id="ax-chat" viewBox="0 0 24 24">
          <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7A2.5 2.5 0 0 1 17.5 16H9l-4.5 3.5V16A2.5 2.5 0 0 1 4 13.5v-7Z" />
          <path d="M8.5 9.2h7M8.5 12.2h4.5" />
        </symbol>

        {/* 2. OPERATIONAL CONTROLS */}
        <symbol id="ax-plus" viewBox="0 0 24 24">
          <path d="M12 5v14M5 12h14" />
        </symbol>
        <symbol id="ax-play" viewBox="0 0 24 24">
          <polygon points="7.5 5.5 18.5 12 7.5 18.5 7.5 5.5" />
        </symbol>
        <symbol id="ax-tick" viewBox="0 0 24 24">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </symbol>
        <symbol id="ax-edit" viewBox="0 0 24 24">
          <path d="M15.5 5l3.5 3.5L8 19.5H4.5V16L15.5 5Z" />
          <path d="M13.5 7l3.5 3.5" />
        </symbol>
        <symbol id="ax-delete" viewBox="0 0 24 24">
          <path d="M4.5 6.5h15" />
          <path d="M9.5 6.5V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v1.5" />
          <path d="M6.5 6.5l1 12.5a2 2 0 0 0 2 1.8h5a2 2 0 0 0 2-1.8l1-12.5" />
          <path d="M10 11v5.5M14 11v5.5" />
        </symbol>
        <symbol id="ax-merge" viewBox="0 0 24 24">
          <path d="M6 5v4a4 4 0 0 0 4 4h4a4 4 0 0 0 4-4V5" />
          <path d="M12 13v7" />
          <path d="M9 17l3 3 3-3" />
        </symbol>
        <symbol id="ax-search" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="6.5" />
          <path d="M16 16l4.2 4.2" />
        </symbol>
        <symbol id="ax-filter" viewBox="0 0 24 24">
          <polygon points="4 5 20 5 14 12.5 14 18.5 10 20 10 12.5 4 5" />
        </symbol>
        <symbol id="ax-close" viewBox="0 0 24 24">
          <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
        </symbol>
        <symbol id="ax-expand" viewBox="0 0 24 24">
          <path d="M15 4.5h4.5V9M9 19.5H4.5V15M19.5 4.5l-6 6M4.5 19.5l6-6" />
        </symbol>
        <symbol id="ax-send" viewBox="0 0 24 24">
          <path d="M21 3L10 14" />
          <polygon points="21 3 14 21 10 14 3 10 21 3" />
        </symbol>
        <symbol id="ax-chevron-left" viewBox="0 0 24 24">
          <path d="M15 18l-6-6 6-6" />
        </symbol>
        <symbol id="ax-chevron-right" viewBox="0 0 24 24">
          <path d="M9 18l6-6-6-6" />
        </symbol>

        {/* 3. SESSION MODES */}
        <symbol id="ax-study" viewBox="0 0 24 24">
          <path d="M3.5 6.5A2.5 2.5 0 0 1 6 4h5a1 1 0 0 1 1 1v14.5a1.5 1.5 0 0 0-1.5-1.5H5.5a2 2 0 0 1-2-2v-9.5Z" />
          <path d="M20.5 6.5A2.5 2.5 0 0 0 18 4h-5a1 1 0 0 0-1 1v14.5a1.5 1.5 0 0 1 1.5-1.5h5a2 2 0 0 0 2-2v-9.5Z" />
        </symbol>
        <symbol id="ax-revise" viewBox="0 0 24 24">
          <path d="M4.5 11A7.5 7.5 0 0 1 18 6.5L19.5 8" />
          <path d="M19.5 4.5V8H16" />
          <path d="M19.5 13A7.5 7.5 0 0 1 6 17.5L4.5 16" />
          <path d="M4.5 19.5V16H8" />
        </symbol>
        <symbol id="ax-exercise" viewBox="0 0 24 24">
          <path d="M13 3.5L5.5 13.5h6l-1 7 8-10h-6l.5-7Z" />
        </symbol>

        {/* 4. METRICS */}
        <symbol id="ax-time" viewBox="0 0 24 24">
          <circle cx="12" cy="12.5" r="8" />
          <path d="M12 8.5v4l2.8 1.8M9.5 2.5h5" />
        </symbol>
        <symbol id="ax-active" viewBox="0 0 24 24">
          <path d="M3 12h4l2.5-6 4.5 12 2.5-6H21" />
        </symbol>
        <symbol id="ax-distraction" viewBox="0 0 24 24">
          <path d="M12 4L3.2 19a1.2 1.2 0 0 0 1 1.8h15.6a1.2 1.2 0 0 0 1-1.8L12 4Z" />
          <path d="M12 10v4.5" />
          <circle cx="12" cy="17.3" r="0.9" fill="currentColor" stroke="none" />
        </symbol>
        <symbol id="ax-mcq" viewBox="0 0 24 24">
          <circle cx="6" cy="7" r="2" />
          <path d="M11 7h9" />
          <circle cx="6" cy="12" r="2" />
          <circle cx="6" cy="12" r="0.8" fill="currentColor" stroke="none" />
          <path d="M11 12h9" />
          <circle cx="6" cy="17" r="2" />
          <path d="M11 17h6" />
        </symbol>
        <symbol id="ax-pages" viewBox="0 0 24 24">
          <rect x="6" y="3.5" width="12.5" height="16" rx="2" />
          <path d="M4.5 7v11.5A2.5 2.5 0 0 0 7 21h9.5" />
          <path d="M9.5 8.5h5.5M9.5 12h5.5M9.5 15.5h3.5" />
        </symbol>
        <symbol id="ax-retention" viewBox="0 0 24 24">
          <path d="M4.5 16.5a7.5 7.5 0 1 1 15 0" />
          <path d="M12 12.5l3.5-3.5" />
          <circle cx="12" cy="12.5" r="1.5" />
        </symbol>
        <symbol id="ax-notes" viewBox="0 0 24 24">
          <rect x="4" y="4" width="16" height="16" rx="2.5" />
          <path d="M8 9h8M8 12.5h8M8 16h5" />
        </symbol>

        {/* 5. CLOUD & SYSTEM */}
        <symbol id="ax-calendar" viewBox="0 0 24 24">
          <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
          <path d="M8 3.5v3M16 3.5v3M3.5 9.5h17" />
          <circle cx="8.5" cy="13.5" r="1" fill="currentColor" stroke="none" />
          <circle cx="12" cy="13.5" r="1" fill="currentColor" stroke="none" />
          <circle cx="15.5" cy="13.5" r="1" fill="currentColor" stroke="none" />
        </symbol>
        <symbol id="ax-resync" viewBox="0 0 24 24">
          <path d="M6.5 17.5h10.5a4 4 0 0 0 .7-7.9A5.5 5.5 0 0 0 7 8a4.5 4.5 0 0 0-.5 9.5Z" />
          <path d="M10 13.5l2-2 2 2M12 11.5v4.5" />
        </symbol>
        <symbol id="ax-export" viewBox="0 0 24 24">
          <path d="M4.5 15.5v2.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2.5" />
          <path d="M12 4.5v10.5M8.5 11.5L12 15l3.5-3.5" />
        </symbol>
        <symbol id="ax-import" viewBox="0 0 24 24">
          <path d="M4.5 15.5v2.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2.5" />
          <path d="M12 15V4.5M8.5 8L12 4.5 15.5 8" />
        </symbol>
      </defs>
    </svg>
  );
}

export function AxIcon({
  name,
  className = 'text-slate-400',
  style
}: {
  name: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const id = name.startsWith('#') ? name : `#ax-${name}`;
  return (
    <svg className={`ax-icon ${className}`} style={style}>
      <use href={id} />
    </svg>
  );
}
