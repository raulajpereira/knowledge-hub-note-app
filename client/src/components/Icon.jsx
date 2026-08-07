const PATHS = {
  home: [
    ['path', { d: 'M3 11.5 12 4l9 7.5' }],
    ['path', { d: 'M5.5 10v9a1 1 0 0 0 1 1H9a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1h2.5a1 1 0 0 0 1-1v-9' }],
  ],
  doc: [
    ['path', { d: 'M6 3.5h8l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1Z' }],
    ['path', { d: 'M14 3.5v4h4' }],
    ['path', { d: 'M8.5 13h7M8.5 16.5h7' }],
  ],
  mic: [
    ['rect', { x: 9, y: 3, width: 6, height: 11, rx: 3 }],
    ['path', { d: 'M5.5 11a6.5 6.5 0 0 0 13 0' }],
    ['path', { d: 'M12 17.5v3.5M9 21h6' }],
  ],
  check: [
    ['rect', { x: 4, y: 4, width: 16, height: 16, rx: 4 }],
    ['path', { d: 'M8.5 12.5l2.5 2.5 5-5.5' }],
  ],
  tag: [
    ['path', { d: 'M12.5 3.5H6a1 1 0 0 0-1 1v6.5a1 1 0 0 0 .3.7l9 9a1 1 0 0 0 1.4 0l6.3-6.3a1 1 0 0 0 0-1.4l-9-9a1 1 0 0 0-.5-.5Z' }],
    ['circle', { cx: 8.5, cy: 8.5, r: 1.3 }],
  ],
  archive: [
    ['rect', { x: 3.5, y: 4.5, width: 17, height: 4, rx: 1 }],
    ['path', { d: 'M5 8.5v9.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8.5' }],
    ['path', { d: 'M10 13h4' }],
  ],
  settings: [
    ['circle', { cx: 12, cy: 12, r: 3 }],
    ['path', { d: 'M19.4 13.5a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V20a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H4a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H10a1.7 1.7 0 0 0 1-1.5V4a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V10a1.7 1.7 0 0 0 1.5 1H20a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.4 1Z' }],
  ],
  plus: [['path', { d: 'M12 5v14M5 12h14' }]],
  search: [
    ['circle', { cx: 11, cy: 11, r: 6.5 }],
    ['path', { d: 'M20 20l-4.5-4.5' }],
  ],
  dots: [
    ['circle', { cx: 12, cy: 5, r: 1.4, fillOverride: true }],
    ['circle', { cx: 12, cy: 12, r: 1.4, fillOverride: true }],
    ['circle', { cx: 12, cy: 19, r: 1.4, fillOverride: true }],
  ],
  pin: [
    ['path', { d: 'M9 4.5h6l-.7 5.5L18 13.5H6L9.7 10Z' }],
    ['path', { d: 'M12 13.5V21' }],
  ],
  folder: [['path', { d: 'M3.5 6.5a1 1 0 0 1 1-1H10l2 2.2h7.5a1 1 0 0 1 1 1V17a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1Z' }]],
  trash: [
    ['path', { d: 'M5 7.5h14M9.5 7.5V5.5a1.5 1.5 0 0 1 1.5-1.5h2a1.5 1.5 0 0 1 1.5 1.5v2' }],
    ['path', { d: 'M7 7.5 7.8 19a1.5 1.5 0 0 0 1.5 1.4h5.4A1.5 1.5 0 0 0 16.2 19l.8-11.5' }],
    ['path', { d: 'M10.5 11v6M13.5 11v6' }],
  ],
  undo: [
    ['path', { d: 'M6 10.5h8.5a4.5 4.5 0 0 1 0 9H12' }],
    ['path', { d: 'M9.5 6.5 5.5 10.5l4 4' }],
  ],
  lock: [
    ['rect', { x: 5, y: 10.5, width: 14, height: 9.5, rx: 2 }],
    ['path', { d: 'M8 10.5V7.5a4 4 0 0 1 8 0v3' }],
    ['circle', { cx: 12, cy: 15, r: 1.4, fillOverride: true }],
  ],
  logout: [
    ['path', { d: 'M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4' }],
    ['path', { d: 'M16 17l5-5-5-5' }],
    ['path', { d: 'M21 12H9' }],
  ],
  eye: [
    ['path', { d: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z' }],
    ['circle', { cx: 12, cy: 12, r: 2.7 }],
  ],
  eyeOff: [
    ['path', { d: 'M3.5 3.5l17 17' }],
    ['path', { d: 'M10.6 5.6A10.8 10.8 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a15.6 15.6 0 0 1-3.3 4.1M6.8 7.4C4.2 9 2.5 12 2.5 12s3.5 6.5 9.5 6.5a9.7 9.7 0 0 0 3-.5' }],
    ['path', { d: 'M9.9 12a2.1 2.1 0 0 0 2.1 2.1' }],
  ],
  copy: [
    ['rect', { x: 8.5, y: 8.5, width: 11, height: 11, rx: 2 }],
    ['path', { d: 'M15 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v7.5A1.5 1.5 0 0 0 6 15h2.5' }],
  ],
  sparkle: [['path', { d: 'M12 3.5 13.6 9l5.4 1.6-5.4 1.6L12 18l-1.6-5.8L5 10.6 10.4 9Z', fillOverride: true }]],
  code: [
    ['path', { d: 'M9 8 4.5 12 9 16' }],
    ['path', { d: 'M15 8l4.5 4-4.5 4' }],
  ],
  bell: [
    ['path', { d: 'M6 10.5a6 6 0 1 1 12 0c0 4 1.2 5.5 1.2 5.5H4.8S6 14.5 6 10.5Z' }],
    ['path', { d: 'M10 19a2 2 0 0 0 4 0' }],
  ],
  chat: [['path', { d: 'M4 5h16v10.5H9.5L5 19v-3.5H4Z' }]],
  mail: [
    ['rect', { x: 3.5, y: 5.5, width: 17, height: 13, rx: 2 }],
    ['path', { d: 'M4 7l8 6.5L20 7' }],
  ],
  send: [['path', { d: 'M4 12l16-8-6 8 6 8-16-8Z' }]],
  calendar: [
    ['rect', { x: 3.5, y: 5, width: 17, height: 15.5, rx: 2 }],
    ['path', { d: 'M3.5 9.5h17' }],
    ['path', { d: 'M8 3v4M16 3v4' }],
  ],
  history: [
    ['path', { d: 'M4 12a8 8 0 1 0 2.5-5.8' }],
    ['path', { d: 'M3 4v4.5h4.5' }],
    ['path', { d: 'M12 8v4.5l3 2' }],
  ],
  link: [
    ['path', { d: 'M9.5 14.5 14.5 9.5' }],
    ['path', { d: 'M11 6.5l1.4-1.4a4 4 0 1 1 5.6 5.6L16.5 12' }],
    ['path', { d: 'M13 17.5l-1.4 1.4a4 4 0 1 1-5.6-5.6L7.5 12' }],
  ],
  news: [
    ['rect', { x: 3.5, y: 5.5, width: 13, height: 13, rx: 1.5 }],
    ['path', { d: 'M16.5 8.5H19a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H8' }],
    ['path', { d: 'M6.5 9h7M6.5 12h7M6.5 15h4' }],
  ],
  external: [
    ['path', { d: 'M9 6H6a1.5 1.5 0 0 0-1.5 1.5v10.5A1.5 1.5 0 0 0 6 19.5h10.5A1.5 1.5 0 0 0 18 18v-3' }],
    ['path', { d: 'M13.5 4.5H19.5V10.5' }],
    ['path', { d: 'M19 5 11 13' }],
  ],
  bookmark: [
    ['path', { d: 'M6.5 4.5h11a1 1 0 0 1 1 1V20l-6.5-4-6.5 4V5.5a1 1 0 0 1 1-1Z' }],
  ],
  bookmarkFilled: [
    ['path', { d: 'M6.5 4.5h11a1 1 0 0 1 1 1V20l-6.5-4-6.5 4V5.5a1 1 0 0 1 1-1Z', fillOverride: true }],
  ],
  chevron: [['path', { d: 'M9 6l6 6-6 6' }]],
  graph: [
    ['circle', { cx: 6, cy: 6.5, r: 2.5 }],
    ['circle', { cx: 18, cy: 6.5, r: 2.5 }],
    ['circle', { cx: 12, cy: 18, r: 2.5 }],
    ['path', { d: 'M8.2 7.8 15.8 7.8M7.3 8.7 10.8 15.8M16.7 8.7 13.2 15.8' }],
  ],
  sidebar: [
    ['rect', { x: 3.5, y: 4.5, width: 17, height: 15, rx: 2 }],
    ['path', { d: 'M9.5 4.5v15' }],
  ],
  edit: [
    ['path', { d: 'M16.5 3.5 20.5 7.5 8 20H4v-4Z' }],
    ['path', { d: 'M14 6l4 4' }],
  ],
  shield: [
    ['path', { d: 'M12 3.5 19 6.5v5.5c0 4.5-3 7.5-7 8.5-4-1-7-4-7-8.5V6.5Z' }],
    ['path', { d: 'M9 12l2 2 4-4.5' }],
  ],
  users: [
    ['circle', { cx: 9, cy: 8.5, r: 3 }],
    ['path', { d: 'M3.5 19.5c0-3.5 2.5-5.5 5.5-5.5s5.5 2 5.5 5.5' }],
    ['path', { d: 'M16 8.5a3 3 0 1 0 0-6' }],
    ['path', { d: 'M14.8 14.2c2.6 0.3 4.7 2.3 4.7 5.3' }],
  ],
  download: [
    ['path', { d: 'M12 3.5v11.5' }],
    ['path', { d: 'M7.5 10.5 12 15l4.5-4.5' }],
    ['path', { d: 'M4.5 17v2.5a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1V17' }],
  ],
  terminal: [
    ['rect', { x: 3.5, y: 4.5, width: 17, height: 15, rx: 2 }],
    ['path', { d: 'M7 9.5 10.5 12.5 7 15.5' }],
    ['path', { d: 'M12.5 15.5h4.5' }],
  ],
  building: [
    ['rect', { x: 5, y: 3.5, width: 11, height: 17, rx: 1 }],
    ['path', { d: 'M16 10.5h3v10h-3' }],
    ['path', { d: 'M8 7.5h1.5M11.5 7.5H13M8 11h1.5M11.5 11H13M8 14.5h1.5M11.5 14.5H13M8 18h1.5M11.5 18H13' }],
  ],
  server: [
    ['rect', { x: 3.5, y: 4, width: 17, height: 6.5, rx: 1.5 }],
    ['rect', { x: 3.5, y: 13.5, width: 17, height: 6.5, rx: 1.5 }],
    ['path', { d: 'M7 7.2h.01M7 16.7h.01' }],
  ],
  truck: [
    ['rect', { x: 2.5, y: 7.5, width: 11, height: 9, rx: 1 }],
    ['path', { d: 'M13.5 10.5H17l3.5 3.5v2.5h-3.5' }],
    ['circle', { cx: 7, cy: 18.5, r: 1.8 }],
    ['circle', { cx: 17, cy: 18.5, r: 1.8 }],
  ],
  idCard: [
    ['rect', { x: 2.5, y: 5, width: 19, height: 14, rx: 2 }],
    ['circle', { cx: 8, cy: 11, r: 2 }],
    ['path', { d: 'M5 16c0-1.8 1.4-3 3-3s3 1.2 3 3' }],
    ['path', { d: 'M14 9.5h4.5M14 13h4.5' }],
  ],
  monitor: [
    ['rect', { x: 3, y: 4, width: 18, height: 12.5, rx: 1.5 }],
    ['path', { d: 'M8.5 20h7M12 16.5V20' }],
  ],
  focus: [
    ['path', { d: 'M4 9V5a1 1 0 0 1 1-1h4' }],
    ['path', { d: 'M20 9V5a1 1 0 0 0-1-1h-4' }],
    ['path', { d: 'M4 15v4a1 1 0 0 0 1 1h4' }],
    ['path', { d: 'M20 15v4a1 1 0 0 1-1 1h-4' }],
  ],
  plug: [
    ['path', { d: 'M9 2v5M15 2v5' }],
    ['path', { d: 'M6.5 7h11v4.5a5.5 5.5 0 0 1-11 0Z' }],
    ['path', { d: 'M12 16v6' }],
  ],
  whiteboard: [
    ['rect', { x: 3, y: 5, width: 18, height: 13, rx: 1.5 }],
    ['path', { d: 'M7 15c1.5-3 2.5-4 4-4s2 2 3.5 2 2-2 3.5-3' }],
  ],
  camera: [
    ['path', { d: 'M4 8.5a1 1 0 0 1 1-1h2l1.2-2h7.6l1.2 2h2a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z' }],
    ['circle', { cx: 12, cy: 13, r: 3.5 }],
  ],
  cursor: [
    ['path', { d: 'M5 3.5 19 10l-6 1.5L11 19Z' }],
  ],
  textTool: [
    ['path', { d: 'M5 5.5h14M12 5.5V19' }],
  ],
  square: [
    ['rect', { x: 4, y: 4, width: 16, height: 16, rx: 1.5 }],
  ],
  circleShape: [
    ['circle', { cx: 12, cy: 12, r: 8.5 }],
  ],
  arrowShape: [
    ['path', { d: 'M5 19 19 5' }],
    ['path', { d: 'M9 5h10v10' }],
  ],
  layers: [
    ['path', { d: 'M12 3.5 21 8l-9 4.5L3 8Z' }],
    ['path', { d: 'M3 13l9 4.5 9-4.5' }],
    ['path', { d: 'M3 17.5 12 22l9-4.5' }],
  ],
  refresh: [
    ['path', { d: 'M20 11a8 8 0 0 0-14.5-4.5M4 5v5h5' }],
    ['path', { d: 'M4 13a8 8 0 0 0 14.5 4.5M20 19v-5h-5' }],
  ],
};

export default function Icon({ name, size = 18, color = 'currentColor', strokeWidth = 1.8 }) {
  const shapes = PATHS[name] || PATHS.doc;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {shapes.map(([tag, props], i) => {
        const { fillOverride, ...rest } = props;
        const Tag = tag;
        return <Tag key={i} {...rest} {...(fillOverride ? { fill: color, stroke: 'none' } : {})} />;
      })}
    </svg>
  );
}
