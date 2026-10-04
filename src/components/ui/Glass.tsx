import { forwardRef } from 'react';
import { cx } from './cx';

type GlassProps = React.HTMLAttributes<HTMLDivElement> & {
  /** panel: 30px radius (main panes) · card: 24px · soft: quieter inner surface */
  variant?: 'panel' | 'card' | 'soft';
  as?: 'div' | 'section' | 'aside' | 'form' | 'header' | 'nav';
};

/** Liquid-glass surface — README §6 "Vidro (cartões)". */
export const Glass = forwardRef<HTMLDivElement, GlassProps>(function Glass(
  { variant = 'panel', as: Tag = 'div', className, ...rest },
  ref,
) {
  return (
    <Tag
      ref={ref as React.Ref<HTMLDivElement & HTMLFormElement>}
      className={cx(
        'kh-glass',
        variant === 'card' ? 'kh-glass--card' : 'kh-glass--panel',
        variant === 'soft' && 'kh-glass--soft',
        className,
      )}
      {...(rest as React.HTMLAttributes<HTMLElement>)}
    />
  );
});

/** Sunken area (tables, lists inside panels). */
export function Well({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('kh-well', className)} {...rest} />;
}
