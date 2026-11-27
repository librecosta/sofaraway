import type { ComponentPropsWithoutRef } from 'react';

type Props = Pick<ComponentPropsWithoutRef<'button'>, 'aria-label' | 'children' | 'className'> & {
  to: string;
  newTab?: boolean;
  preview?: boolean;
};

export function NavigationButton({ to, newTab, preview, ...props }: Props) {
  return <button type="button" role="link" {...props} onClick={() => {
    if (preview) return;
    if (newTab) window.open(to, '_blank', 'noopener,noreferrer');
    else window.location.assign(to);
  }} />;
}
