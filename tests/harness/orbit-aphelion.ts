import { Vector3, type BufferGeometry, type Mesh, type ShaderMaterial, type WebGLRenderer } from 'three';
import type { QualityTier } from '../../app/game/contracts';
import { ORBIT_WORLD_SEED } from '../../app/game/core/orbit-field';
import { buildRunPath } from '../../app/game/graphics/path';
import { Graphics } from '../../app/game/graphics/scene.client';
import { volumeById } from '../../app/game/core/volumes';

export async function inspectAphelion(quality: QualityTier, view: 'course' | 'lit' | 'terminator' | 'poles' | 'moon' = 'course',
  post = true, amount = 1, beat = 358, dpr = 1, sweep = false) {
  const canvas = document.createElement('canvas');
  document.body.append(canvas);
  const graphics = new Graphics(canvas, quality, false, { fixedTime: null, autoplay: false, align: true, god: false,
    boost: false, mobileQuality: false, post, record: false, debug: true });
  try {
    const path = buildRunPath(volumeById('orbit'));
    const station = path.reference!.station(beat, 'standard');
    graphics.resize(960, 540, dpr);
    graphics.loadOrbit(path, ORBIT_WORLD_SEED, 'flight');
    graphics.prepare();
    const scene = Reflect.get(graphics, 'volume');
    const pieces = Reflect.get(scene.orbit, 'setpieces');
    const renderer: WebGLRenderer = Reflect.get(graphics, 'renderer');
    type Body = Mesh<BufferGeometry, ShaderMaterial>;
    const planet = () => Reflect.get(pieces, 'active').get('planet') as
      { group: { parent: unknown; visible: boolean }; fade: { value: number }; celestials: Body[]; rings: Body } | undefined;
    const bodies = (entry: NonNullable<ReturnType<typeof planet>>) => [...entry.celestials, entry.rings];
    const programs = (material: ShaderMaterial) => Reflect.get(renderer.properties.get(material) as object, 'currentProgram');
    const entry = planet()!;
    const prepared = bodies(entry).map(mesh => programs(mesh.material));
    let releasedMaterials = 0;
    let releasedRing = 0;
    for (const mesh of bodies(entry)) mesh.material.addEventListener('dispose', () => releasedMaterials++);
    entry.rings.geometry.addEventListener('dispose', () => releasedRing++);
    const target = pieces.descriptions.find((piece: { id: string }) => piece.id === 'planet');
    const gl = graphics.gl;
    const frames = [];
    let previous = await new Promise<number>(resolve => requestAnimationFrame(resolve));
    const angles = { lit: [-.07, .33, .94], terminator: [.89, .12, .45], poles: [.34, .88, .38], moon: [.04, .27, .96] };
    const count = sweep ? 120 : 1;
    for (let i = 0; i < count; i++) {
      const sight = sweep ? target.from - 32 + i * 1.8 : station;
      const t = performance.now();
      graphics.drawOrbit({ station: sight, x: 0, y: 0, time: beat * 60 / 128, lighting: { beat, amount } });
      const entry = planet();
      const mesh = entry?.celestials[0];
      if (view !== 'course' && mesh) {
        const subject = view === 'moon' ? entry!.celestials.find(node => node.name === 'Aphelion companion')! : mesh;
        const camera = graphics.camera!;
        camera.position.copy(subject.position).addScaledVector(new Vector3(...angles[view]).normalize(),
          subject.scale.x * (view === 'moon' ? 2.6 : 2.2));
        camera.lookAt(subject.position);
        Reflect.get(graphics, 'render').call(graphics, scene, beat * 60 / 128, false);
      }
      const cpuMs = performance.now() - t;
      const now = await new Promise<number>(resolve => requestAnimationFrame(resolve));
      const m = graphics.metrics();
      frames.push({ station: sight, presence: entry?.fade.value ?? 0, frameMs: now - previous, cpuMs,
        calls: m.calls, triangles: m.triangles, programs: m.programs, textures: m.textures, geometries: m.geometries,
        identity: mesh?.uuid, visible: !!entry?.group.parent && entry.group.visible,
        prewarmed: prepared.every((program, index) => program && program === programs(bodies(entry!)[index].material)) });
      previous = now;
    }
    // Capture immediately after a draw, including on contexts without preserved buffers.
    const shot = view === 'course'
      ? (() => {
        const step = frames.at(-1)!.station;
        graphics.drawOrbit({ station: step, x: 0, y: 0, time: beat * 60 / 128, lighting: { beat, amount } });
        return canvas.toDataURL();
      })()
      : (() => { Reflect.get(graphics, 'render').call(graphics, scene, beat * 60 / 128, false); return canvas.toDataURL(); })();
    const glError = gl.getError();
    const device = gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info')?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER);
    const features = bodies(entry).map(mesh => ({ name: mesh.name, order: mesh.renderOrder,
      depthTest: mesh.material.depthTest, depthWrite: mesh.material.depthWrite, singlePass: mesh.material.forceSinglePass }));
    graphics.releaseSurface();
    return { shot, frames, glError, renderer: device, releasedMaterials, releasedRing, features };
  } finally { graphics.dispose(); canvas.remove(); }
}
