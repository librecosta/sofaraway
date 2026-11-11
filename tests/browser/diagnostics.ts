import type { Page } from '@playwright/test';

export interface Metrics {
  phase: string;
  beat: number;
  distance: number;
  camera: { tx: number; ty: number };
  speed: number;
  chunks: number;
  canvas: [number, number];
  targets: [number, number, number][];
  dpr: number;
  dof: boolean;
  colorTarget: 'rgba16f' | 'rgba8' | null;
  postFailure: string | null;
  geometries: number;
  textures: number;
  programs: number;
  calls: number;
  triangles: number;
  initMs: number;
  switchMs: number;
}

export const readMetrics = (page: Page) =>
  page.locator('#errbox').evaluate(el => JSON.parse(el.textContent!) as Metrics);
