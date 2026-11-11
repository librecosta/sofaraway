import { WebGLRenderer } from 'three';

export function mountViewport(host: HTMLDivElement) {
  const canvas = document.createElement('canvas');
  const renderer = new WebGLRenderer({ canvas });
  renderer.setSize(host.clientWidth, Math.max(1, host.clientHeight), false);
  host.append(canvas);
  return () => {
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
  };
}
