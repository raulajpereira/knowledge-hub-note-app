// App background: warm gradient + four blurred colour blobs (ZNotes root),
// or the user's photo with a dim layer. Presets from the prototype `AMB`.
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
} as const;

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
  const a = AMBIENTS[ambient];
  return (
    <div className="kh-ambient" style={{ background: a.base }} aria-hidden="true">
      {photoUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- signed, user-provided URL */}
          <img
            className="kh-ambient__photo"
            src={photoUrl}
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
          <div style={{ position: 'absolute', inset: 0, background: `rgba(22,16,12,${dim / 100})` }} />
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
