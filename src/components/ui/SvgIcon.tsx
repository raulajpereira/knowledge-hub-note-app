/**
 * The app's line icon: a 24×24 viewBox drawn with the current colour. `d` is
 * the icon's inner SVG (constant markup from the code, never user content).
 */
export function SvgIcon({
  d,
  size = 16,
  sw = 1.9,
  fill = 'none',
}: {
  d: string;
  size?: number | string;
  sw?: number | string;
  fill?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: d }}
    />
  );
}
