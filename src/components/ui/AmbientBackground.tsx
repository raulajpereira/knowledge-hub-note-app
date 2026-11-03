import { StatusBarColor } from './useStatusBarColor';

// App background: warm gradient + four blurred colour blobs (ZNotes root),
// or a photo with a dim layer: the user's own, or a built-in one (Noite).
// Presets from the prototype `AMB`.
// The light theme lays a pale veil over either (.kh-ambient::after) and dims
// the photo towards white (--dim-rgb).
type Ambient = {
  base: string;
  b1: string;
  b2: string;
  b3: string;
  /** built-in photo (in /public), shown like the user's photo, with blur and dim */
  photo?: string;
  /** small picture for the picker */
  thumb?: string;
};
const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';

export const AMBIENTS = {
  Areia: {
    base: 'linear-gradient(160deg,#4a3c33 0%,#2b221d 55%,#1d1714 100%)',
    b1: '#b89478',
    b2: '#8a6c58',
    b3: '#d2b79c',
  },
  Grafite: {
    base: 'linear-gradient(160deg,#3a3b3e 0%,#232427 55%,#161719 100%)',
    b1: '#7d8088',
    b2: '#5d6068',
    b3: '#a4a2a0',
  },
  Crepúsculo: {
    base: 'linear-gradient(160deg,#2b2448 0%,#1a1630 55%,#100e1f 100%)',
    b1: '#6a4fc0',
    b2: '#3d5bb0',
    b3: '#9a6fd0',
  },
  // a dark-blue starry sky
  Noite: {
    base: 'linear-gradient(160deg,#071027 0%,#0a1b45 55%,#16367a 100%)',
    b1: '#2c4fb0',
    b2: '#4a3a9e',
    b3: '#2f7fc0',
    photo: `${BASE}/bg/noite.jpg`,
    thumb: `${BASE}/bg/noite-thumb.jpg`,
  },
} satisfies Record<string, Ambient>;

export type AmbientName = keyof typeof AMBIENTS;

type Props = {
  ambient?: AmbientName;
  /** URL of the user's background photo (streamed by the app). */
  photoUrl?: string | null;
  /** Darkening over the photo, 0–100 %. */
  dim?: number;
  /** Blur of the photo in px (keeps the glass effect readable). */
  blur?: number;
};

export function AmbientBackground({ ambient = 'Areia', photoUrl, dim = 20, blur = 0 }: Props) {
  const a: Ambient = AMBIENTS[ambient] ?? AMBIENTS.Areia;
  // the user's photo, else the preset's own picture
  const src = photoUrl || a.photo || null;
  return (
    <div className="kh-ambient" style={{ background: a.base }} aria-hidden="true">
      <StatusBarColor photoUrl={src} dim={dim} top={a.base.match(/#[0-9a-f]{6}/i)![0]} blob={a.b1} />
      {src ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- signed, user-provided URL */}
          <img
            className="kh-ambient__photo"
            src={src}
            alt=""
            style={
              blur
                ? {
                    inset: -80,
                    width: 'calc(100% + 160px)',
                    height: 'calc(100% + 160px)',
                    filter: `blur(${blur}px) saturate(115%)`,
                  }
                : undefined
            }
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `rgb(var(--dim-rgb, 22 16 12) / ${dim / 100})`,
            }}
          />
        </>
      ) : (
        <>
          <div
            className="kh-ambient__blob"
            style={{
              width: 720,
              height: 720,
              left: -160,
              top: -220,
              background: a.b1,
              filter: 'blur(90px)',
              opacity: 0.9,
            }}
          />
          <div
            className="kh-ambient__blob"
            style={{
              width: 620,
              height: 620,
              right: -120,
              top: 120,
              background: a.b2,
              filter: 'blur(100px)',
              opacity: 0.8,
            }}
          />
          <div
            className="kh-ambient__blob"
            style={{
              width: 560,
              height: 560,
              left: '38%',
              bottom: -260,
              background: a.b3,
              filter: 'blur(100px)',
              opacity: 0.75,
            }}
          />
          <div
            className="kh-ambient__blob"
            style={{
              width: 260,
              height: 260,
              left: '30%',
              top: '22%',
              background: a.b2,
              filter: 'blur(70px)',
              opacity: 0.5,
            }}
          />
        </>
      )}
    </div>
  );
}
