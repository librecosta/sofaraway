import type { QualityTier } from '../contracts';

export interface GraphicsCapabilities {
  halfFloat: boolean;
  rgba8: boolean;
  samples: readonly number[];
  rgba8Samples: readonly number[];
  maxTextureSize: number;
  maxRenderbufferSize: number;
  maxSize: number;
}

export interface QualityProfile {
  dpr: number;
  samples: number;
  taps: number;
  dof: boolean;
  halfFloat: boolean;
}

function supportsTarget(gl: WebGL2RenderingContext, format: number, samples: number) {
  const read = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING);
  const draw = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING);
  const boundTexture = gl.getParameter(gl.TEXTURE_BINDING_2D);
  const boundBuffer = gl.getParameter(gl.RENDERBUFFER_BINDING);
  const framebuffer = gl.createFramebuffer();
  const depth = gl.createRenderbuffer();
  const color = samples ? gl.createRenderbuffer() : null;
  const texture = samples ? null : gl.createTexture();
  const size = 4;
  try {
    if (!framebuffer || !depth || !(color || texture)) return false;
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    if (color) {
      gl.bindRenderbuffer(gl.RENDERBUFFER, color);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, format, size, size);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, color);
    } else {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texStorage2D(gl.TEXTURE_2D, 1, format, size, size);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    }
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    if (samples) gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, size, size);
    else gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, size, size);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
    return gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  } finally {
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, draw);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, read);
    gl.bindTexture(gl.TEXTURE_2D, boundTexture);
    gl.bindRenderbuffer(gl.RENDERBUFFER, boundBuffer);
    gl.deleteFramebuffer(framebuffer);
    gl.deleteRenderbuffer(depth);
    gl.deleteRenderbuffer(color);
    gl.deleteTexture(texture);
  }
}

export function readCapabilities(gl: WebGL2RenderingContext): GraphicsCapabilities {
  const rgba8 = supportsTarget(gl, gl.RGBA8, 0);
  const halfFloat = !!gl.getExtension('EXT_color_buffer_float') && supportsTarget(gl, gl.RGBA16F, 0);
  const maxTextureSize: number = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  const maxRenderbufferSize: number = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
  const depthSamples: Int32Array | null = gl.getInternalformatParameter(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, gl.SAMPLES);
  const samplesFor = (format: number): number[] =>
    Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER, format, gl.SAMPLES) as Int32Array ?? [])
      .filter(samples => samples > 0 && samples <= 4 && depthSamples?.includes(samples) && supportsTarget(gl, format, samples));
  return {
    halfFloat,
    rgba8,
    samples: halfFloat ? samplesFor(gl.RGBA16F) : [],
    rgba8Samples: rgba8 ? samplesFor(gl.RGBA8) : [],
    maxTextureSize,
    maxRenderbufferSize,
    maxSize: Math.min(maxTextureSize, maxRenderbufferSize),
  };
}

export function selectProfile(
  tier: QualityTier, mobile: boolean, capabilities: GraphicsCapabilities,
): QualityProfile {
  const high = tier === 'high' || (tier === 'auto' && !mobile);
  const low = tier === 'low';
  return {
    dpr: high ? 1.6 : low ? 1 : 1.25,
    samples: high ? Math.max(0, ...(capabilities.halfFloat ? capabilities.samples : capabilities.rgba8Samples)) : 0,
    taps: high ? 14 : low ? 6 : 8,
    dof: !low && capabilities.halfFloat,
    halfFloat: capabilities.halfFloat,
  };
}
