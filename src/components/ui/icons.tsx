// Stroke icons used by the primitives (24×24 grid, as in the prototypes).
type P = { size?: number; strokeWidth?: number };

const svg = (size: number, sw: number, children: React.ReactNode) => (
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
  >
    {children}
  </svg>
);

export const ChevronDown = ({ size = 12, strokeWidth = 2.6 }: P) =>
  svg(size, strokeWidth, <path d="M6 9l6 6 6-6" />);
export const Check = ({ size = 12, strokeWidth = 3 }: P) =>
  svg(size, strokeWidth, <path d="M5 12l4.5 4.5L19 7" />);
export const Close = ({ size = 16, strokeWidth = 2 }: P) =>
  svg(size, strokeWidth, <path d="M6 6l12 12M18 6L6 18" />);
export const Search = ({ size = 16, strokeWidth = 1.9 }: P) =>
  svg(
    size,
    strokeWidth,
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </>,
  );
export const Eye = ({ size = 18, strokeWidth = 1.9 }: P) =>
  svg(
    size,
    strokeWidth,
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>,
  );
export const EyeOff = ({ size = 18, strokeWidth = 1.9 }: P) =>
  svg(
    size,
    strokeWidth,
    <>
      <path d="M3 3l18 18" />
      <path d="M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1" />
      <path d="M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </>,
  );
export const Trash = ({ size = 22, strokeWidth = 1.9 }: P) =>
  svg(
    size,
    strokeWidth,
    <>
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="M6 7l1 13h10l1-13" />
    </>,
  );
export const Info = ({ size = 22, strokeWidth = 1.9 }: P) =>
  svg(
    size,
    strokeWidth,
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>,
  );
export const Lock = ({ size = 18, strokeWidth = 1.9 }: P) =>
  svg(
    size,
    strokeWidth,
    <>
      <rect x="5" y="11" width="14" height="9" rx="2.5" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>,
  );
export const Bell = ({ size = 18, strokeWidth = 1.9 }: P) =>
  svg(
    size,
    strokeWidth,
    <>
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </>,
  );
export const Plus = ({ size = 16, strokeWidth = 2.2 }: P) =>
  svg(size, strokeWidth, <path d="M12 5v14M5 12h14" />);
