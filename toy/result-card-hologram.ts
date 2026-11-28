type Point = readonly [x: number, y: number];

export type CardPalette = {
  glass: string;
  shadow: string;
  light: string;
  accent: string;
  foil: readonly [string, string, string];
};

export function trace(ctx: CanvasRenderingContext2D, points: readonly Point[], close = true) {
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  for (const point of points.slice(1)) ctx.lineTo(...point);
  if (close) ctx.closePath();
}

export function drawHologram(ctx: CanvasRenderingContext2D, volume: keyof typeof motifs, palette: CardPalette) {
  ctx.save();
  const foil = ctx.createLinearGradient(449, 270, 671, 172);
  foil.addColorStop(0, palette.foil[0]);
  foil.addColorStop(.38, palette.foil[1]);
  foil.addColorStop(.66, palette.accent);
  foil.addColorStop(.78, '#ecf9ff');
  foil.addColorStop(1, palette.foil[2]);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  motifs[volume](ctx, palette, foil);
  ctx.restore();
}

function elsewhere(ctx: CanvasRenderingContext2D, palette: CardPalette, foil: CanvasGradient) {
  const frame: readonly Point[] = [
    [-81, -110], [52, -110], [108, -58], [108, 54], [60, 110], [-75, 110], [-130, 56], [-130, -53],
  ];
  const vanishing: Point = [617, 226];
  const gate = (depth: number) => frame.map(([x, y]): Point => [
    vanishing[0] + (x - 62) * depth, vanishing[1] + (y + 12) * depth,
  ]);
  const front = gate(.98);
  const back = gate(.18);
  for (let side = 0; side < front.length; side++) {
    const next = (side + 1) % front.length;
    trace(ctx, [front[side], front[next], back[next], back[side]]);
    ctx.globalAlpha = side % 2 === 0 ? .085 : .035;
    ctx.fillStyle = foil;
    ctx.fill();
    ctx.globalAlpha = .24;
    ctx.strokeStyle = foil;
    ctx.lineWidth = .7;
    ctx.stroke();
  }
  for (const [index, depth] of [.98, .91, .8, .68, .57, .47, .39, .32, .26, .21, .17].entries()) {
    trace(ctx, gate(depth));
    ctx.globalAlpha = index === 0 ? .78 : index % 3 === 0 ? .6 : .25;
    ctx.lineWidth = index === 0 ? 1.7 : .8;
    ctx.stroke();
  }
  for (const side of [0, 6, 7]) {
    ctx.save();
    const next = (side + 1) % front.length;
    trace(ctx, [front[side], front[next], back[next], back[side]]);
    ctx.clip();
    const fluting = ctx.createLinearGradient(478, 135, 612, 236);
    fluting.addColorStop(0, palette.foil[0] + '00');
    fluting.addColorStop(.42, palette.foil[1] + '42');
    fluting.addColorStop(.67, palette.accent + '77');
    fluting.addColorStop(1, palette.accent + '00');
    ctx.globalAlpha = .75;
    ctx.strokeStyle = fluting;
    ctx.lineWidth = .55;
    for (let rib = 0; rib < 32; rib++) {
      const t = rib / 32;
      const [a, b] = [front[side], front[next]];
      trace(ctx, [[a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], vanishing], false);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.globalAlpha = .66;
  ctx.fillStyle = palette.accent;
  for (let tick = 0; tick < 17; tick++) {
    const depth = .97 - tick * .036;
    const [x, y] = gate(depth)[0];
    ctx.fillRect(x + 3, y - 4, tick % 4 === 0 ? 4 : 1.2, 1);
  }
}

function daybreak(ctx: CanvasRenderingContext2D, palette: CardPalette, foil: CanvasGradient) {
  const crown: Point = [536, 143], ridge: Point = [620, 159], right: Point = [659, 203];
  const heel: Point = [597, 306], tip: Point = [538, 329], left: Point = [467, 253];
  const upper: Point = [548, 180], core: Point = [589, 229], lower: Point = [531, 271];
  const facets: readonly (readonly Point[])[] = [
    [crown, ridge, upper], [crown, upper, lower, left], [upper, ridge, right, core],
    [upper, core, lower], [left, lower, tip], [lower, core, heel, tip], [core, right, heel],
  ];
  ctx.strokeStyle = foil;
  const warmFace = ctx.createLinearGradient(531, 151, 594, 301);
  warmFace.addColorStop(0, palette.foil[1] + '08');
  warmFace.addColorStop(.56, palette.accent + '51');
  warmFace.addColorStop(.72, palette.foil[2] + '3a');
  warmFace.addColorStop(1, palette.foil[2] + '09');
  const coldFace = ctx.createLinearGradient(465, 253, 657, 167);
  coldFace.addColorStop(0, palette.foil[0] + '46');
  coldFace.addColorStop(.45, palette.foil[0] + '1f');
  coldFace.addColorStop(.85, '#f2f8ff4e');
  coldFace.addColorStop(1, palette.foil[1] + '1a');
  for (const [index, facet] of facets.entries()) {
    trace(ctx, facet);
    ctx.fillStyle = index === 0 || index === 3 || index === 5 ? warmFace : coldFace;
    ctx.globalAlpha = [.92, .38, .67, 1, .59, .60, .37][index];
    ctx.fill();
    ctx.globalAlpha = .44;
    ctx.lineWidth = .8;
    ctx.stroke();
  }
  trace(ctx, [crown, ridge, right, heel, tip, left]);
  ctx.globalAlpha = .68;
  ctx.lineWidth = 1.35;
  ctx.stroke();
  trace(ctx, [upper, core, lower]);
  ctx.save();
  ctx.clip();
  ctx.lineWidth = .6;
  for (let facet = 0; facet < 12; facet++) {
    const offset = facet * 4.5;
    ctx.globalAlpha = .29;
    trace(ctx, [[529, 260 - offset], [595, 240 - offset]], false);
    ctx.stroke();
  }
  ctx.restore();
  const refraction = ctx.createLinearGradient(547, 212, 690, 267);
  refraction.addColorStop(0, palette.foil[0] + '00');
  refraction.addColorStop(.52, palette.foil[1] + 'a0');
  refraction.addColorStop(1, palette.foil[2] + '00');
  ctx.strokeStyle = refraction;
  ctx.lineWidth = .85;
  for (let ray = 0; ray < 17; ray++) {
    const offset = ray - 8;
    ctx.globalAlpha = ray % 4 === 0 ? .84 : .42;
    trace(ctx, [[490, 232 + offset * 2], [584, 224 + offset * 1.2], [690, 240 + offset * 7]], false);
    ctx.stroke();
  }
  ctx.globalAlpha = .62;
  ctx.strokeStyle = foil;
  trace(ctx, [[520, 155], [453, 258], [476, 284]], false);
  ctx.stroke();
  trace(ctx, [[629, 152], [671, 201], [646, 242]], false);
  ctx.stroke();
}

function descent(ctx: CanvasRenderingContext2D, palette: CardPalette, foil: CanvasGradient) {
  const shutter: readonly Point[] = [[427, 194], [485, 151], [633, 151], [671, 181], [608, 181], [532, 230], [460, 230]];
  ctx.fillStyle = foil;
  ctx.strokeStyle = foil;
  for (let half = 0; half < 2; half++) {
    ctx.save();
    if (half === 1) {
      ctx.translate(1100, 447);
      ctx.rotate(Math.PI);
    }
    trace(ctx, shutter);
    ctx.globalAlpha = .09;
    ctx.fill();
    ctx.globalAlpha = .53;
    ctx.lineWidth = 1.25;
    ctx.stroke();
    ctx.clip();
    for (let channel = 0; channel < 6; channel++) {
      const offset = channel * 8;
      ctx.globalAlpha = channel % 3 === 0 ? .49 : .2;
      ctx.lineWidth = .9;
      trace(ctx, [[411, 204 + offset], [490, 145 + offset], [630, 145 + offset], [673, 183 + offset]], false);
      ctx.stroke();
    }
    for (let slot = 0; slot < 13; slot++) {
      ctx.globalAlpha = slot % 3 === 0 ? .46 : .22;
      trace(ctx, [[493 + slot * 8, 154], [486 + slot * 8, 163]], false);
      ctx.stroke();
    }
    ctx.restore();
  }
  const scan = ctx.createLinearGradient(447, 270, 671, 173);
  scan.addColorStop(0, palette.foil[2] + '00');
  scan.addColorStop(.32, palette.foil[2] + '99');
  scan.addColorStop(.63, palette.foil[1]);
  scan.addColorStop(1, palette.foil[0] + '00');
  ctx.strokeStyle = scan;
  for (let index = 0; index < 15; index++) {
    const shift = index * 3;
    trace(ctx, [[438, 263 + shift], [510, 263 + shift], [610, 202 + shift], [675, 202 + shift]], false);
    ctx.globalAlpha = index % 5 === 0 ? .79 : .30;
    ctx.lineWidth = index % 5 === 0 ? 1.35 : .65;
    ctx.stroke();
  }
  ctx.globalAlpha = .34;
  ctx.strokeStyle = foil;
  ctx.lineWidth = .8;
  trace(ctx, [[446, 241], [498, 241], [600, 184], [650, 184]], false);
  ctx.stroke();
  trace(ctx, [[460, 319], [513, 319], [539, 303]], false);
  ctx.stroke();
}

function orbit(ctx: CanvasRenderingContext2D, palette: CardPalette, foil: CanvasGradient) {
  const x = 556, y = 233;
  const corona = ctx.createRadialGradient(x - 10, y - 14, 18, x, y, 65);
  corona.addColorStop(0, palette.foil[0] + '00');
  corona.addColorStop(.64, palette.foil[0] + '12');
  corona.addColorStop(.83, palette.foil[1] + '40');
  corona.addColorStop(.94, palette.foil[2] + '00');
  ctx.fillStyle = corona;
  ctx.fillRect(x - 67, y - 67, 134, 134);
  const aperture = ctx.createLinearGradient(x - 42, y + 35, x + 33, y - 45);
  aperture.addColorStop(0, palette.foil[0] + '39');
  aperture.addColorStop(.43, palette.shadow + '66');
  aperture.addColorStop(1, palette.foil[2] + '10');
  ctx.beginPath();
  ctx.arc(x, y, 43, 0, Math.PI * 2);
  ctx.fillStyle = aperture;
  ctx.fill();
  ctx.strokeStyle = foil;
  ctx.lineWidth = .8;
  for (let fringe = 0; fringe < 8; fringe++) {
    ctx.beginPath();
    ctx.arc(x, y, 45 + fringe * 1.75, -.91 + fringe * .14, 4.29 - fringe * .09);
    ctx.globalAlpha = .27 + (fringe % 3) * .13;
    ctx.stroke();
  }
  const tilt = -.48;
  for (let ring = 0; ring < 13; ring++) {
    const radius = 70 + ring * 4.75;
    ctx.beginPath();
    ctx.ellipse(x, y, radius, 22 + ring * 3.05, tilt - ring * .015, .1 + ring * .045, Math.PI * 2 - .25 + ring * .028);
    ctx.globalAlpha = ring % 4 === 0 ? .66 : .27;
    ctx.lineWidth = ring % 4 === 0 ? 1.15 : .7;
    ctx.stroke();
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt - .18);
  for (let tick = 0; tick < 42; tick++) {
    const angle = tick / 42 * Math.PI * 2;
    const length = tick % 7 === 0 ? 7 : 3;
    trace(ctx, [
      [Math.cos(angle) * 130, Math.sin(angle) * 61],
      [Math.cos(angle) * (130 + length), Math.sin(angle) * (61 + length)],
    ], false);
    ctx.globalAlpha = tick % 7 === 0 ? .66 : .30;
    ctx.lineWidth = .8;
    ctx.stroke();
  }
  ctx.restore();
}

const motifs = { elsewhere, daybreak, descent, orbit };
