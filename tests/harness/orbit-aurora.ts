import type { InstancedMesh, Mesh, ShaderMaterial, WebGLRenderer } from 'three';
import type { Difficulty, PlayMode, QualityTier } from '../../app/game/contracts';
import { STEP } from '../../app/game/core/clock';
import { idleInput } from '../../app/game/core/input';
import { cosmicPresence, type OrbitSetpiece } from '../../app/game/core/orbit-setpieces';
import { Simulation } from '../../app/game/core/simulation';
import { volumeById } from '../../app/game/core/volumes';
import { Graphics } from '../../app/game/graphics/scene.client';

const nextFrame = () => new Promise<number>(resolve => requestAnimationFrame(resolve));

export async function measureAuroraEntry(quality: QualityTier, boost: boolean, difficulty: Difficulty, mode: PlayMode, post = true,
  options: { prepare?: boolean; capture?: boolean } = {}) {
  const canvas = document.createElement('canvas');
  document.body.append(canvas);
  const graphics = new Graphics(canvas, quality, false, { fixedTime: null, autoplay: false, align: true, god: false,
    boost, mobileQuality: false, post, record: false, debug: false });
  try {
    const makeRun = () => {
      const run = new Simulation(volumeById('orbit'), { align: true, branchSide: 'center' });
      run.start(difficulty, 0, undefined, mode);
      return run;
    };
    const sim = makeRun();
    const input = { ...idleInput, boosting: boost };
    graphics.resize(960, 540, 1);
    graphics.load(sim.volume, sim.path, mode);
    const scene = Reflect.get(graphics, 'volume');
    const world = scene.orbit;
    const pieces = Reflect.get(world, 'setpieces');
    const aurora: OrbitSetpiece = pieces.descriptions.find((p: OrbitSetpiece) => p.id === 'nebula');
    const renderer: WebGLRenderer = Reflect.get(graphics, 'renderer');
    const gl = graphics.gl;
    const timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    const frames = [];
    const captures: string[] = [];
    const probes: { station: number; ms: number; programs: number }[] = [];
    const fieldUploads: number[] = [];
    let builtMs: number | null = null, draws = 0, updateMs = 0, renderMs = 0;
    const create = pieces.create.bind(pieces);
    pieces.create = (piece: OrbitSetpiece) => {
      const start = performance.now();
      const entry = create(piece);
      if (piece === aurora) {
        builtMs = performance.now() - start;
        for (const mesh of entry.group.children) mesh.onAfterRender = () => draws++;
        if (entry.nebulaField) entry.nebulaField.onUpdate = () => fieldUploads.push(pieces.metrics().station);
      }
      return entry;
    };
    for (const key of ['updateAstralWorld', 'update'] as const) {
      const original = scene[key].bind(scene);
      scene[key] = (...args: unknown[]) => {
        const start = performance.now();
        try { return original(...args); } finally { updateMs += performance.now() - start; }
      };
    }
    const render = renderer.render.bind(renderer);
    renderer.render = (...args) => {
      const start = performance.now();
      try { return render(...args); } finally {
        const ms = performance.now() - start;
        renderMs += ms;
        if (args[0] !== scene.scene && args[0].children.some(child =>
          (child as Mesh<never, ShaderMaterial>).material?.uniforms?.choreoGain)) {
          probes.push({ station: pieces.metrics().station, ms, programs: renderer.info.programs?.length ?? 0 });
        }
      }
    };
    const beforePrepare = performance.now();
    if (options.prepare !== false) graphics.prepare();
    const preparation = { ms: performance.now() - beforePrepare, builtMs, programs: renderer.info.programs?.length ?? 0,
      ...renderer.info.memory, draws };
    const seen = new WeakSet<InstancedMesh>();
    for (const entry of ['cold', 'warm'] as const) {
      const run = entry === 'cold' ? sim : makeRun();
      while (run.trackDistance < aurora.from - 450 && run.phase === 'playing') run.step(STEP, input);
      // Prime the preceding scenery. The cold measurement is Aurora's first
      // visit, rather than the first opaque geometry submitted by the session.
      while (run.trackDistance < aurora.from - 370 && run.phase === 'playing') {
        await nextFrame();
        for (let i = 0; i < 2; i++) run.step(STEP, input);
        graphics.draw(run, true, true, { beat: run.beat, orbitAmount: 1 });
      }
      world.group.traverse((object: InstancedMesh) => { if (object.isInstancedMesh) seen.add(object); });
      let previous = await nextFrame();
      let programs = renderer.info.programs?.length ?? 0;
      let queries: { query: WebGLQuery; sample: { gpuMs: number | null } }[] = [];
      while (run.trackDistance < aurora.from + 48 && run.phase === 'playing') {
        // Follow the actual fixed-step simulation at 60 Hz, independent of monitor refresh rate.
        for (let i = 0; i < 2; i++) run.step(STEP, input);
        builtMs = null; draws = updateMs = renderMs = 0;
        const query = timer && gl.createQuery();
        if (query) gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
        const start = performance.now();
        graphics.draw(run, true, true, { beat: run.beat, orbitAmount: 1 });
        const drawMs = performance.now() - start;
        if (query) gl.endQuery(timer.TIME_ELAPSED_EXT);
        let batches = 0;
        world.group.traverse((object: InstancedMesh) => {
          if (!object.isInstancedMesh || seen.has(object)) return;
          seen.add(object);
          batches++;
        });
        const currentPrograms = renderer.info.programs?.length ?? 0;
        const sample = { entry, station: run.trackDistance, beat: run.beat, presence: cosmicPresence(aurora, run.trackDistance),
          frameMs: 0, drawMs, updateMs, renderMs, programs: currentPrograms, programDelta: currentPrograms - programs,
          ...renderer.info.memory, batches, builtMs, draws, gpuMs: null as number | null };
        programs = currentPrograms;
        frames.push(sample);
        if (query) queries.push({ query, sample });
        const now = await nextFrame();
        sample.frameMs = now - previous;
        previous = now;
        if (timer && gl.getParameter(timer.GPU_DISJOINT_EXT)) {
          for (const { query } of queries) gl.deleteQuery(query);
          queries = [];
        }
        queries = queries.filter(({ query, sample }) => {
          if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) return true;
          sample.gpuMs = gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6;
          gl.deleteQuery(query);
          return false;
        });
      }
      for (const { query } of queries) gl.deleteQuery(query);
      if (options.capture) {
        graphics.draw(run, true, true, { beat: run.beat, orbitAmount: 1 });
        captures.push(canvas.toDataURL());
      }
    }
    return { frames, from: aurora.from, captures, probes, fieldUploads, preparation, renderer: debug && gl.getParameter(debug.UNMASKED_RENDERER_WEBGL),
      gpuTimer: !!timer, dpr: graphics.metrics().dpr, glError: gl.getError() };
  } finally {
    graphics.dispose();
    canvas.remove();
  }
}
