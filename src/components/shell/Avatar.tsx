/* eslint-disable @next/next/no-img-element -- the user's own image, streamed by our API */
import { assetUrl } from './assetUrl';
import { initials } from './plan';

/** Round avatar: the uploaded photo, or the initials on the prototype's warm gradient. */
export function AvatarFace({
  name,
  photoV,
  size,
  fontSize,
  ring = '0 0 0 2px rgba(255,255,255,.14)',
}: {
  name: string;
  photoV?: number;
  size: number;
  fontSize: number;
  ring?: string;
}) {
  return (
    <span
      className="kh-avatar__face"
      style={{ position: 'relative', width: size, height: size, fontSize, boxShadow: ring, flex: 'none' }}
    >
      {photoV ? (
        <img
          src={assetUrl('avatar', photoV)}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        initials(name)
      )}
    </span>
  );
}
