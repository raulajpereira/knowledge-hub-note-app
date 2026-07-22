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
  chat: [['path', { d: 'M4 5h16v10.5H9.5L5 19v-3.5H4Z' }]],
  send: [['path', { d: 'M4 12l16-8-6 8 6 8-16-8Z' }]],
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
