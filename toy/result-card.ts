import type { VolumeId } from '../app/game/contracts';
import { SCORING_RULES_VERSION } from '../app/game/core/scoring';
import { volumeById } from '../app/game/core/volumes';
import { totalRunScore } from '../app/game/runtime/records.client';
import type { RunSettlement } from '../app/game/runtime/run-settlement';
import type { createPlayerText } from '../app/i18n/player-text';

type PlayerText = ReturnType<typeof createPlayerText>;
export function canShareResult(run: RunSettlement) {
  return run.scoringVersion === SCORING_RULES_VERSION && run.policy.interactiveRandomRun && run.policy.scoring &&
    run.policy.showcaseRoute === null && !run.policy.allowSimulationDiagnostics;
}

export function resultCardDetails(run: RunSettlement, text: PlayerText) {
  const { policy, result, record } = run;
  return {
    volume: volumeById(policy.volumeId).name,
    outcome: text.outcome(result.title),
    flight: [text.mode(policy.mode), text.difficulty(policy.difficulty), result.route ? text.route(result.route) : '—'].join('  ·  '),
    score: text.score(totalRunScore(record)),
    rank: result.rank ?? '—',
    metrics: [
      [text.t('accuracy'), text.percent(result.accuracy)],
      [text.t('precisionCrossings'), text.number(result.precision + (result.encore?.precision ?? 0))],
      [text.t('nearMissCrossings'), text.number(result.nearMiss + (result.encore?.nearMiss ?? 0))],
    ] as const,
  };
}

const palettes = {
  elsewhere: ['#09141d', '#1b313a', '#8ce4ce'],
  daybreak: ['#1b1520', '#392938', '#ffc19f'],
  descent: ['#141222', '#342535', '#ff9fd5'],
  orbit: ['#101425', '#272d48', '#aebff1'],
} as const satisfies Record<VolumeId, readonly [string, string, string]>;

function drawCardSurface(ctx: CanvasRenderingContext2D, ink: string, metal: string, accent: string) {
  const surface = ctx.createRadialGradient(644, 102, 0, 590, 120, 690);
  surface.addColorStop(0, metal);
  surface.addColorStop(1, ink);
  ctx.fillStyle = surface;
  ctx.fillRect(0, 0, 720, 520);

  const engraving = ctx.createLinearGradient(312, 310, 720, 222);
  engraving.addColorStop(0, accent + '00');
  engraving.addColorStop(.42, accent + '09');
  engraving.addColorStop(1, accent + '23');
  ctx.strokeStyle = engraving;
  ctx.lineWidth = 1;
  for (let line = 0; line < 19; line++) {
    const step = line * 10;
    ctx.beginPath();
    ctx.moveTo(758, 105 + step);
    ctx.bezierCurveTo(463, 119 + step, 708, 364 + step, 299 + step * .43, 526 + step * .37);
    ctx.stroke();
  }
}

function drawEngravedMark(ctx: CanvasRenderingContext2D, logo: HTMLImageElement, accent: string) {
  const mask = ctx.canvas.ownerDocument.createElement('canvas');
  mask.height = 92;
  mask.width = Math.round(mask.height * logo.naturalWidth / logo.naturalHeight);
  const plate = mask.getContext('2d');
  if (!plate) return;
  plate.drawImage(logo, 0, 0, mask.width, mask.height);
  const relief = plate.getImageData(0, 0, mask.width, mask.height);

  // A pale rim from the original silhouette sits one pixel below the recessed face.
  plate.globalCompositeOperation = 'source-in';
  plate.fillStyle = accent + '64';
  plate.fillRect(0, 0, mask.width, mask.height);
  const x = 522, y = 37, width = mask.width / 2, height = mask.height / 2;
  ctx.drawImage(mask, x, y + 1.25, width, height);

  const tint = [1, 3, 5].map(channel => Number.parseInt(accent.slice(channel, channel + 2), 16));
  for (let i = 0; i < relief.data.length; i += 4) {
    const depth = relief.data[i] / 255;
    for (let channel = 0; channel < tint.length; channel++) {
      relief.data[i + channel] = tint[channel] * (.075 + .26 * depth);
    }
  }
  plate.putImageData(relief, 0, 0);
  ctx.drawImage(mask, x, y, width, height);
}

export function drawResultCard(canvas: HTMLCanvasElement, run: RunSettlement, text: PlayerText,
  nickname: string, brandLogo: HTMLImageElement | null) {
  canvas.width = 720;
  canvas.height = 520;
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  const volume = run.policy.volumeId;
  const [ink, metal, accent] = palettes[volume];
  const details = resultCardDetails(run, text);
  drawCardSurface(ctx, ink, metal, accent);

  const label = (value: string, x: number, y: number, size: number, color: string, display = false, maxWidth = 620) => {
    ctx.fillStyle = color;
    ctx.font = `700 ${size}px "${display ? 'Chakra Petch' : 'Rajdhani'}", "Microsoft YaHei", "PingFang SC", system-ui, sans-serif`;
    ctx.fillText(value, x, y, maxWidth);
  };
  label('SoFarAway', 46, 70, 43, '#ebf8ff', true);
  label(nickname, 48, 102, 23, '#c0d5e3', false, 410);
  if (brandLogo) drawEngravedMark(ctx, brandLogo, accent);
  ctx.textAlign = 'right';
  label('LibreCosta', 671, 67.4, 21, accent + '83');
  label('LibreCosta', 671, 66, 21, '#14232a');
  ctx.textAlign = 'left';
  label(details.volume, 48, 172, 27, accent, true);
  label(details.flight, 48, 211, 22, '#d8e9f2');
  label(details.outcome, 48, 261, 22, accent);
  label(details.score, 43, 350, 86, '#ebf8ff', true, 475);
  ctx.textAlign = 'right';
  label(details.rank, 670, 346, 66, accent, true);
  ctx.textAlign = 'left';
  const rule = ctx.createLinearGradient(48, 0, 672, 0);
  rule.addColorStop(0, accent + '80');
  rule.addColorStop(1, accent + '25');
  ctx.fillStyle = rule;
  ctx.fillRect(48, 382, 624, 1.5);
  for (const [i, [name, value]] of details.metrics.entries()) {
    label(name, 48 + 210 * i, 427, 20, '#d8e9f2', false, 196);
    label(value, 48 + 210 * i, 475, 37, i === 2 ? '#ffcb85' : accent, true, 196);
  }
  return true;
}
