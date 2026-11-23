type Profile = readonly [height: number, depth: number, width: number, thickness: number, density: number];
type Knot = readonly [x: number, ...profile: Profile];

const spine: readonly Knot[] = [
  [-3.02, -.86, 4960, .22, 870, 0],
  [-2.28, -.30, 4750, .42, 1110, .80],
  [-1.45, .46, 4550, .49, 970, .96],
  [-.65, .92, 4740, .37, 1050, .86],
  [.25, 1.05, 5030, .30, 1030, .77],
  [1.07, .76, 5240, .39, 1000, .99],
  [1.95, .52, 5460, .26, 920, .59],
  [3.03, .95, 5570, .15, 710, 0],
];

type Branch = { readonly id: string; readonly parent: 'spine'; readonly root: number; readonly tip: readonly Knot[] };

// Each child starts with its parent's position and tangent. The remaining
// knots control its own width, depth and density in the same spatial frame.
export const auroraBranches: readonly Branch[] = [
  { id: 'return-flow', parent: 'spine', root: -1.88, tip: [
    [-1.10, -.34, 4180, .25, 880, .66], [-.25, -.57, 4130, .24, 780, .69],
    [.48, -.48, 4330, .18, 740, .48], [1.23, -.02, 4600, .08, 650, 0],
  ] },
  { id: 'cloud-cliff', parent: 'spine', root: -1.31, tip: [
    [-1.85, -.14, 5340, .35, 820, .81], [-2.38, -.84, 5600, .31, 880, .65],
    [-2.74, -1.72, 5710, .14, 730, 0],
  ] },
  { id: 'wind-sheet', parent: 'spine', root: -.52, tip: [
    [.12, 1.58, 5740, .27, 890, .72], [.94, 1.75, 5980, .31, 930, .55],
    [1.91, 1.31, 6260, .17, 720, 0],
  ] },
  { id: 'foreground-stream', parent: 'spine', root: .93, tip: [
    [1.47, .27, 4390, .21, 800, .75], [1.95, -.55, 3740, .25, 780, .64],
    [2.46, -1.14, 3240, .15, 700, .32], [3.01, -1.24, 3100, .09, 600, 0],
  ] },
];

export const auroraSlices = [
  { role: 'far-envelope', depth: 6380 },
  { role: 'far-cliff', depth: 5780 },
  { role: 'spine', depth: 5200 },
  { role: 'cavity-wall', depth: 4660 },
  { role: 'return-flow', depth: 4110 },
  { role: 'foreground-dust', depth: 3460 },
] as const;

export const auroraFrame = { width: 15500, height: 9200, lift: 250, xExtent: 3.1, yExtent: 2.35 };
export const auroraCavity = { x: -.13, y: .19, depth: 4550, width: .89, height: .66 };
export const auroraViews = [
  'Composite', 'Main Spine Only', 'Branches Only', 'Cavity / Dust', 'Emission Regions', 'Neutral Density',
] as const;

function tangent(knots: readonly Knot[], i: number, component: number) {
  const a = knots[Math.max(0, i - 1)];
  const b = knots[Math.min(knots.length - 1, i + 1)];
  return (b[component] - a[component]) / (b[0] - a[0]);
}

function sample(knots: readonly Knot[], x: number, startTangent?: Profile) {
  const start = knots[0][0], end = knots[knots.length - 1][0];
  if (x < Math.min(start, end) || x > Math.max(start, end)) return;
  const reverse = start > end;
  let i = 0;
  while (i < knots.length - 2 && (reverse ? x < knots[i + 1][0] : x > knots[i + 1][0])) i++;
  const a = knots[i], b = knots[i + 1];
  const span = b[0] - a[0], t = (x - a[0]) / span, t2 = t * t, t3 = t2 * t;
  const values: number[] = [], slopes: number[] = [];
  for (let c = 1; c <= 5; c++) {
    const m = (i === 0 && startTangent ? startTangent[c - 1] : tangent(knots, i, c)) * span;
    const n = tangent(knots, i + 1, c) * span;
    values.push((2 * t3 - 3 * t2 + 1) * a[c] + (t3 - 2 * t2 + t) * m
      + (-2 * t3 + 3 * t2) * b[c] + (t3 - t2) * n);
    slopes.push(((6 * t2 - 6 * t) * (a[c] - b[c]) + (3 * t2 - 4 * t + 1) * m + (3 * t2 - 2 * t) * n) / span);
  }
  return { values: values as unknown as Profile, slopes: slopes as unknown as Profile };
}

const paths = auroraBranches.map(branch => {
  const root = sample(spine, branch.root)!;
  const knots: readonly Knot[] = [[branch.root, ...root.values], ...branch.tip];
  return { branch, knots, tangent: root.slopes };
});

export function auroraProfiles(x: number) {
  return {
    spine: sample(spine, x),
    branches: paths.map(({ branch, knots, tangent }) => ({
      id: branch.id, profile: sample(knots, x, tangent),
      weight: Math.min(1, Math.abs(x - branch.root) * 3) ** 2,
    })),
  };
}

const squared = (n: number) => n * n;

/** Prepare a column of the field in the anchor's right/up/forward frame. */
export function auroraDensityColumn(profiles: ReturnType<typeof auroraProfiles>, x: number, z: number, seed: number) {
  function sectionalProfile(profile: ReturnType<typeof sample>, weight: number, primary: boolean) {
    if (!profile || weight === 0) return [];
    const [height, depth, width, thickness, density] = profile.values;
    const slope = profile.slopes[0];
    return [{ height, slope, primary, falloff: 2 / squared(Math.max(.05, width) * Math.hypot(1, slope * .64)),
      density: weight * Math.max(0, density) * Math.exp(-1.8 * squared((z - depth) / thickness)) }];
  }
  const sections = [
    ...sectionalProfile(profiles.spine, 1, true),
    ...profiles.branches.flatMap(path => sectionalProfile(path.profile, path.weight, false)),
  ];
  // Irregular, partially evacuated cavity. Its wall absorbs where it meets
  // real gas, while a small optical-depth floor leaves stars in its interior.
  const cavity = auroraCavity;
  const dx = (x - cavity.x) / cavity.width;
  const phase = (seed >>> 0) % 251 * .13;
  const bend = .12 * Math.sin(dx * 3 + phase);
  const cavityDepth = Math.exp(-squared((z - cavity.depth) / 1180));
  return (y: number) => {
    let primary = 0, branch = 0, flow = 0;
    for (const section of sections) {
      const amount = section.density * Math.exp(-section.falloff * squared(y - section.height));
      if (section.primary) primary += amount;
      else branch += amount;
      flow += amount * section.slope;
    }
    const total = primary + branch;
    const dy = (y - cavity.y) / cavity.height;
    const radial2 = squared(dx + .13 * dy) + squared(dy + bend);
    const boundary = Math.exp(-squared((Math.sqrt(radial2) - 1) / .2));
    const hollow = 1 - .96 * Math.exp(-3.4 * squared(radial2)) * cavityDepth;
    const dust = total * (.52 * boundary + .09) * cavityDepth;
    return [primary * hollow, Math.min(branch, 1) * hollow, dust, total > .001 ? flow / total : 0] as const;
  };
}
