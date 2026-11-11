import type { QualityTier } from '../contracts';

export interface GraphicsCapabilities {
  halfFloat: boolean;
  samples: readonly number[];
  maxSize: number;
}

export interface QualityProfile {
  dpr: number;
  samples: number;
  taps: number;
  dof: boolean;
  halfFloat: boolean;
}

export function readCapabilities(gl: WebGL2RenderingContext): GraphicsCapabilities {
  const halfFloat = !!gl.getExtension('EXT_color_buffer_float');
  const format = halfFloat ? gl.RGBA16F : gl.RGBA8;
  const samples: number[] = Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER, format, gl.SAMPLES) ?? []);
  return {
    halfFloat,
    samples,
    maxSize: Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)),
  };
}

export function selectProfile(
  tier: QualityTier, mobile: boolean, capabilities: GraphicsCapabilities,
): QualityProfile {
  const high = tier === 'high' || (tier === 'auto' && !mobile);
  const low = tier === 'low';
  return {
    dpr: high ? 1.6 : low ? 1 : 1.25,
    samples: high ? Math.max(0, ...capabilities.samples.filter(n => n <= 4)) : 0,
    taps: high ? 14 : low ? 6 : 8,
    dof: !low && capabilities.halfFloat,
    halfFloat: capabilities.halfFloat,
  };
}
