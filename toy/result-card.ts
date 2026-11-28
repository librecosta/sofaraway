import type { VolumeId } from '../app/game/contracts';
import { SCORING_RULES_VERSION } from '../app/game/core/scoring';
import { volumeById } from '../app/game/core/volumes';
import { totalRunScore } from '../app/game/runtime/records.client';
import type { RunSettlement } from '../app/game/runtime/run-settlement';
import type { createPlayerText } from '../app/i18n/player-text';

import { drawHologram, trace } from './result-card-hologram';
import type { CardPalette } from './result-card-hologram';

type PlayerText = ReturnType<typeof createPlayerText>;
export function canShareResult(run: RunSettlement) {
  return run.scoringVersion === SCORING_RULES_VERSION && run.policy.interactiveRandomRun && run.policy.scoring &&
    run.policy.showcaseRoute === null && !run.policy.allowSimulationDiagnostics;
}

export function resultCardDetails(run: RunSettlement, text: PlayerText) {
  const { policy, result, record } = run;
  return {
    archive: `VOL. ${archiveNumbers[policy.volumeId]}`,
    volume: volumeById(policy.volumeId).name,
    outcome: text.outcome(result.title),
    flight: [text.mode(policy.mode), text.difficulty(policy.difficulty), result.route ? text.route(result.route) : '—'].join('  ·  '),
    score: text.score(totalRunScore(record)),
    rank: result.rank ?? '—',
    gradeLabel: text.locale === 'zh-CN' ? '等级' : 'GRADE',
    metrics: [
      [text.t('accuracy'), text.percent(result.accuracy)],
      [text.t('precisionCrossings'), text.number(result.precision + (result.encore?.precision ?? 0))],
      [text.t('nearMissCrossings'), text.number(result.nearMiss + (result.encore?.nearMiss ?? 0))],
    ] as const,
  };
}

const width = 720;
const height = 540;
const scale = 2;
const archiveNumbers = { elsewhere: 'I', daybreak: 'II', descent: 'III', orbit: 'IV' } as const;
const palettes = {
  elsewhere: { glass: '#112832', shadow: '#080f17', light: '#347987', accent: '#9ce9df',
    foil: ['#528cba', '#66c2c6', '#c3dbe8'] },
  daybreak: { glass: '#332b3b', shadow: '#151321', light: '#996c75', accent: '#ffe0b9',
    foil: ['#82c8e2', '#e8adb8', '#f6d39b'] },
  descent: { glass: '#282235', shadow: '#100d17', light: '#784268', accent: '#e3bfd0',
    foil: ['#8574a2', '#d77f9a', '#e2ae78'] },
  orbit: { glass: '#1c2745', shadow: '#0c1020', light: '#4d5b9b', accent: '#bfceff',
    foil: ['#6696c7', '#a695e5', '#c9dcff'] },
} as const satisfies Record<VolumeId, CardPalette>;

const pearl = '#f1faff';
const muted = '#bbcbd6';
const plateEdge = [[32, 12], [684, 12], [708, 36], [708, 498], [679, 528], [36, 528], [12, 504], [12, 32]] as const;
const innerEdge = [[35, 19], [680, 19], [701, 40], [701, 495], [675, 521], [39, 521], [19, 500], [19, 35]] as const;

function drawGrain(ctx: CanvasRenderingContext2D) {
  const tile = ctx.canvas.ownerDocument.createElement('canvas');
  tile.width = tile.height = 96;
  const grit = tile.getContext('2d');
  if (!grit) return;
  let seed = 17437;
  const next = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  for (let grain = 0; grain < 270; grain++) {
    grit.fillStyle = grain % 3 === 0 ? '#c4ebf217' : '#01050c2c';
    grit.fillRect(Math.floor(next() * tile.width), Math.floor(next() * tile.height), grain % 11 === 0 ? 2 : 1, 1);
  }
  const pattern = ctx.createPattern(tile, 'repeat');
  if (pattern) {
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, width, height);
  }
}

function drawSubstrate(ctx: CanvasRenderingContext2D, palette: CardPalette) {
  ctx.fillStyle = '#05080e';
  ctx.fillRect(0, 0, width, height);
  const glass = ctx.createLinearGradient(166, 528, 612, 20);
  glass.addColorStop(0, '#080d15');
  glass.addColorStop(.45, palette.shadow);
  glass.addColorStop(.74, palette.glass);
  glass.addColorStop(1, palette.shadow);
  trace(ctx, plateEdge);
  ctx.fillStyle = glass;
  ctx.fill();
  ctx.clip();

  const transmission = ctx.createRadialGradient(567, 229, 15, 543, 229, 311);
  transmission.addColorStop(0, palette.light + '96');
  transmission.addColorStop(.49, palette.light + '5b');
  transmission.addColorStop(1, palette.light + '00');
  ctx.fillStyle = transmission;
  ctx.fillRect(0, 0, width, height);

  const reflection = ctx.createLinearGradient(368, 88, 605, 361);
  reflection.addColorStop(0, palette.accent + '00');
  reflection.addColorStop(.42, palette.accent + '00');
  reflection.addColorStop(.53, palette.accent + '15');
  reflection.addColorStop(.58, palette.foil[0] + '08');
  reflection.addColorStop(.75, palette.foil[0] + '00');
  ctx.fillStyle = reflection;
  ctx.fillRect(0, 0, width, height);
  drawGrain(ctx);
}

function drawEngraving(ctx: CanvasRenderingContext2D, palette: CardPalette) {
  const bevel = ctx.createLinearGradient(115, 22, 594, 530);
  bevel.addColorStop(0, palette.foil[0] + '70');
  bevel.addColorStop(.22, '#f1fbff92');
  bevel.addColorStop(.44, palette.light + '24');
  bevel.addColorStop(.72, palette.foil[2] + '54');
  bevel.addColorStop(1, palette.accent + '80');
  trace(ctx, plateEdge);
  ctx.strokeStyle = bevel;
  ctx.lineWidth = 3;
  ctx.stroke();
  trace(ctx, innerEdge);
  ctx.lineWidth = .9;
  ctx.stroke();
  ctx.fillStyle = '#01040a80';
  trace(ctx, [[684, 12], [708, 36], [701, 40], [680, 19]]);
  ctx.fill();
  ctx.fillStyle = palette.accent + '25';
  trace(ctx, [[12, 504], [36, 528], [679, 528], [675, 523], [40, 523], [18, 501]]);
  ctx.fill();
  ctx.strokeStyle = palette.foil[1] + '69';
  trace(ctx, [[19, 76], [19, 35], [35, 19], [97, 19]], false);
  ctx.stroke();
  trace(ctx, [[621, 521], [675, 521], [701, 495], [701, 461]], false);
  ctx.stroke();
  const edgeReflection = ctx.createLinearGradient(403, 19, 701, 343);
  edgeReflection.addColorStop(0, '#effaff00');
  edgeReflection.addColorStop(.37, palette.accent + '72');
  edgeReflection.addColorStop(.56, palette.foil[0] + '18');
  edgeReflection.addColorStop(.78, '#effaff5b');
  edgeReflection.addColorStop(1, '#effaff00');
  ctx.strokeStyle = edgeReflection;
  ctx.lineWidth = 1.1;
  trace(ctx, [[403, 19], [680, 19], [701, 40], [701, 343]], false);
  ctx.stroke();

  const rule = ctx.createLinearGradient(47, 0, 674, 0);
  rule.addColorStop(0, palette.accent + 'a0');
  rule.addColorStop(.28, palette.accent + '4c');
  rule.addColorStop(.74, palette.foil[1] + '36');
  rule.addColorStop(1, palette.foil[2] + '8c');
  ctx.fillStyle = rule;
  ctx.fillRect(47, 124, 626, .75);
  ctx.fillRect(47, 427, 626, 1);
  for (let tick = 0; tick < 57; tick++) {
    const long = tick % 7 === 0;
    ctx.fillRect(47 + tick * 11.16, 428, long ? 1 : .55, long ? 6 : 2.5);
  }
  ctx.fillStyle = palette.accent + '3d';
  ctx.fillRect(237, 449, .75, 51);
  ctx.fillRect(448, 449, .75, 51);
}

function textFont(size: number, display = false) {
  return `700 ${size}px "${display ? 'Chakra Petch' : 'Rajdhani'}", "Microsoft YaHei", "PingFang SC", system-ui, sans-serif`;
}

function label(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size: number,
  color: string | CanvasGradient, display = false) {
  ctx.fillStyle = color;
  ctx.font = textFont(size, display);
  ctx.fillText(value, x, y);
}

function fitOwner(ctx: CanvasRenderingContext2D, nickname: string) {
  const singleLine = nickname.replace(/\s+/gu, ' ').trim();
  ctx.font = textFont(19);
  if (ctx.measureText(singleLine).width <= 340) return singleLine;
  const graphemes = typeof Intl.Segmenter === 'function'
    ? Array.from(new Intl.Segmenter().segment(singleLine), part => part.segment)
    : Array.from(singleLine);
  let fitted = '';
  for (const grapheme of graphemes) {
    if (ctx.measureText(fitted + grapheme + '…').width > 340) break;
    fitted += grapheme;
  }
  return fitted + '…';
}

function drawBrand(ctx: CanvasRenderingContext2D, logo: HTMLImageElement | null) {
  const right = 673;
  ctx.save();
  ctx.textAlign = 'right';
  label(ctx, 'LibreCosta', right, 49, 17, '#aab6c0');
  ctx.restore();
  if (!logo || logo.naturalHeight === 0) return;

  const mark = ctx.canvas.ownerDocument.createElement('canvas');
  mark.height = 32 * scale;
  mark.width = Math.round(mark.height * logo.naturalWidth / logo.naturalHeight);
  const ink = mark.getContext('2d');
  if (!ink) return;
  ink.drawImage(logo, 0, 0, mark.width, mark.height);
  const pixels = ink.getImageData(0, 0, mark.width, mark.height);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const detail = pixels.data[i] / 255;
    pixels.data[i] = 121 + detail * 47;
    pixels.data[i + 1] = 134 + detail * 45;
    pixels.data[i + 2] = 145 + detail * 44;
  }
  ink.putImageData(pixels, 0, 0);
  const markWidth = mark.width / scale;
  ctx.drawImage(mark, right - markWidth, 59, markWidth, mark.height / scale);
}

function drawGrade(ctx: CanvasRenderingContext2D, rank: string, caption: string, palette: CardPalette) {
  const x = 612, y = 345;
  ctx.save();
  ctx.translate(x, y);
  const mount = ctx.createRadialGradient(-12, -19, 3, 0, 2, 62);
  mount.addColorStop(0, palette.glass);
  mount.addColorStop(.73, palette.shadow);
  mount.addColorStop(.86, '#070b13');
  mount.addColorStop(1, palette.light);
  const foil = ctx.createLinearGradient(-51, 44, 49, -45);
  foil.addColorStop(0, palette.foil[0] + '64');
  foil.addColorStop(.29, palette.foil[1]);
  foil.addColorStop(.42, palette.light);
  foil.addColorStop(.63, palette.accent);
  foil.addColorStop(.73, '#e7f4ff');
  foil.addColorStop(1, palette.foil[2] + '9a');
  ctx.beginPath();
  ctx.arc(0, 0, 62, 0, 2 * Math.PI);
  ctx.fillStyle = mount;
  ctx.fill();
  ctx.strokeStyle = '#03070de0';
  ctx.lineWidth = 3.2;
  ctx.stroke();
  ctx.strokeStyle = foil;
  for (const [radius, weight, opacity] of [[60, 1.1, .88], [54, .65, .56], [43, .8, .47]]) {
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.globalAlpha = opacity;
    ctx.lineWidth = weight;
    ctx.stroke();
  }
  for (let tick = 0; tick < 48; tick++) {
    const angle = tick / 48 * Math.PI * 2;
    const major = tick % 6 === 0;
    const inner = major ? 46 : 49;
    trace(ctx, [
      [Math.cos(angle) * inner, Math.sin(angle) * inner],
      [Math.cos(angle) * 52, Math.sin(angle) * 52],
    ], false);
    ctx.globalAlpha = major ? .81 : .48;
    ctx.lineWidth = major ? 1 : .65;
    ctx.stroke();
  }
  ctx.globalAlpha = .72;
  ctx.beginPath();
  ctx.arc(0, 0, 57.5, -1.39, -.27);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 56.5, 1.94, 2.77);
  ctx.lineWidth = 1.35;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  label(ctx, rank, 0, 15, 53, '#050810', true);
  label(ctx, rank, 0, 13, 53, pearl, true);
  label(ctx, caption, 0, 32, 11, palette.accent);
  ctx.restore();
}

function drawInformation(ctx: CanvasRenderingContext2D, details: ReturnType<typeof resultCardDetails>, text: PlayerText,
  nickname: string, palette: CardPalette) {
  const archive = 'FLIGHT ARCHIVE';
  ctx.font = textFont(13);
  ctx.fillStyle = palette.accent;
  let letterX = 47;
  for (const letter of archive) {
    ctx.fillText(letter, letterX, 43);
    letterX += ctx.measureText(letter).width + 2;
  }
  label(ctx, 'SoFarAway', 45, 80, 37, pearl, true);
  label(ctx, fitOwner(ctx, nickname), 47, 105, 19, muted);
  label(ctx, details.archive, 47, 155, 15, palette.accent, true);
  label(ctx, details.volume, 45, 200, 43, pearl, true);
  label(ctx, details.flight, 47, 232, 19, muted);
  label(ctx, details.outcome, 47, 263, 19, palette.accent);
  label(ctx, text.t('totalScore'), 47, 306, 14, muted);
  ctx.font = textFont(103, true);
  const scoreSize = Math.min(103, Math.floor(457 * 103 / ctx.measureText(details.score).width));
  const whiteGlass = ctx.createLinearGradient(0, 319, 0, 397);
  whiteGlass.addColorStop(0, '#ffffff');
  whiteGlass.addColorStop(.58, '#edf9ff');
  whiteGlass.addColorStop(1, '#bad1e6');
  label(ctx, details.score, 42, 394, scoreSize, '#020508', true);
  label(ctx, details.score, 42, 390, scoreSize, whiteGlass, true);

  const colors = [pearl, '#8ce4ce', '#ffc983'];
  for (const [i, [name, value]] of details.metrics.entries()) {
    const x = [47, 258, 469][i];
    label(ctx, name, x, 457, 17, muted);
    label(ctx, value, x, 501, 34, colors[i], true);
    ctx.fillStyle = colors[i] + '95';
    ctx.fillRect(x, 510, 13, 1);
  }
}

export function drawResultCard(canvas: HTMLCanvasElement, run: RunSettlement, text: PlayerText,
  nickname: string, brandLogo: HTMLImageElement | null) {
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  const volume = run.policy.volumeId;
  const palette = palettes[volume];
  const details = resultCardDetails(run, text);
  ctx.scale(scale, scale);
  ctx.save();
  drawSubstrate(ctx, palette);
  drawHologram(ctx, volume, palette);
  drawEngraving(ctx, palette);
  drawBrand(ctx, brandLogo);
  drawGrade(ctx, details.rank, details.gradeLabel, palette);
  drawInformation(ctx, details, text, nickname, palette);
  ctx.restore();
  return true;
}
