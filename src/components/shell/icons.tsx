import { NAV_ICON_PATHS } from './navData';

// Shell icons: the prototype's 24×24 stroke paths. Inner markup comes from
// constants in this repo (never user input), so innerHTML is safe here.

type P = { size?: number; sw?: number };

function Svg({ size = 17, sw = 1.8, d }: P & { d: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: d }}
    />
  );
}

export const NavIcon = ({ id, size = 18 }: { id: string; size?: number }) => (
  <Svg size={size} d={NAV_ICON_PATHS[id] ?? ''} />
);

const D = {
  search: '<circle cx="11" cy="11" r="7"></circle><line x1="16.5" y1="16.5" x2="21" y2="21"></line>',
  tcodes:
    '<rect x="3" y="4" width="18" height="16" rx="3"></rect><path d="M7 10l3 2.5L7 15"></path><line x1="12.5" y1="15" x2="17" y2="15"></line>',
  news: '<path d="M4 5h13v14a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2z"></path><path d="M17 9h3v10a2 2 0 0 1-2 2"></path><path d="M7.5 9h6"></path><path d="M7.5 13h6"></path><path d="M7.5 17h3.5"></path>',
  whiteboard:
    '<rect x="3" y="4" width="18" height="13" rx="2.5"></rect><path d="M7 13l3-3 2.5 2.5L17 8"></path><path d="M9 21l3-4 3 4"></path>',
  activity: '<path d="M3 12h4l3-8 4 16 3-8h4"></path>',
  focus:
    '<path d="M4 9V5a1 1 0 0 1 1-1h4"></path><path d="M15 4h4a1 1 0 0 1 1 1v4"></path><path d="M20 15v4a1 1 0 0 1-1 1h-4"></path><path d="M9 20H5a1 1 0 0 1-1-1v-4"></path><circle cx="12" cy="12" r="2.5"></circle>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"></path><path d="M10 20.5a2 2 0 0 0 4 0"></path>',
  spark:
    '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"></path><path d="M18.5 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"></path>',
  shield: '<path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z"></path><path d="M9 12l2 2 4-4"></path>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2.5"></rect><path d="M8 11V8a4 4 0 0 1 8 0v3"></path>',
  lockSm:
    '<rect x="5" y="11" width="14" height="10" rx="2.5"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path>',
  trash: '<path d="M4 7h16"></path><path d="M9 7V4h6v3"></path><path d="M6 7l1 13h10l1-13"></path>',
  settings: '<circle cx="12" cy="12" r="3"></circle><circle cx="12" cy="12" r="8.5"></circle>',
  about:
    '<path d="M14 4h6v6"></path><path d="M20 4l-9 9"></path><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"></path>',
  chevRight: '<path d="M9 6l6 6-6 6"></path>',
  chevDown: '<path d="M6 9l6 6 6-6"></path>',
  close: '<line x1="6" y1="6" x2="18" y2="18"></line><line x1="18" y1="6" x2="6" y2="18"></line>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"></path><circle cx="12" cy="12" r="3"></circle>',
  eyeOff:
    '<path d="M3 3l18 18"></path><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1"></path><path d="M6.6 6.6A17.4 17.4 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6"></path><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"></path>',
  download: '<path d="M12 4v11"></path><path d="M7 10l5 5 5-5"></path><path d="M5 20h14"></path>',
  logout:
    '<path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4"></path><path d="M16 16l4-4-4-4"></path><path d="M20 12H9"></path>',
  camera: '<path d="M4 8h3l2-2.5h6L17 8h3v11H4z"></path><circle cx="12" cy="13" r="3.5"></circle>',
  pencil: '<path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"></path>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"></path>',
  dash: '<path d="M7 12h10"></path>',
  laptop:
    '<rect x="3" y="4" width="18" height="12" rx="2"></rect><path d="M8 20h8"></path><path d="M12 16v4"></path>',
  phone:
    '<rect x="7" y="2.5" width="10" height="19" rx="2.5"></rect><line x1="11" y1="18" x2="13" y2="18"></line>',
};

export type IconName = keyof typeof D;
export const Icon = ({ name, size, sw }: P & { name: IconName }) => <Svg size={size} sw={sw} d={D[name]} />;

/** Crown of the "Mudar para PRO" card (filled). */
export const Crown = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M3 8l4.5 3.5L12 5l4.5 6.5L21 8l-2 10H5z" />
    <rect x="5" y="19" width="14" height="2" rx="1" />
  </svg>
);
