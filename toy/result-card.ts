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
  elsewhere: ['#071522', '#103f55', '#74ffdc'],
  daybreak: ['#23162b', '#5e3453', '#ffc19f'],
  descent: ['#120f21', '#492347', '#ff91d5'],
  orbit: ['#080d24', '#292c64', '#9ebeff'],
} satisfies Record<VolumeId, string[]>;

export function drawResultCard(canvas: HTMLCanvasElement, run: RunSettlement, text: PlayerText,
  nickname: string, brandLogo: HTMLImageElement | null) {
  canvas.width = 720;
  canvas.height = 520;
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  const volume = run.policy.volumeId;
  const [ink, glow, accent] = palettes[volume];
  const details = resultCardDetails(run, text);
  const background = ctx.createRadialGradient(580, 165, 0, 580, 165, 620);
  background.addColorStop(0, glow);
  background.addColorStop(1, ink);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, 720, 520);

  const label = (value: string, x: number, y: number, size: number, color: string, display = false, maxWidth = 620) => {
    ctx.fillStyle = color;
    ctx.font = `700 ${size}px "${display ? 'Chakra Petch' : 'Rajdhani'}", "Microsoft YaHei", "PingFang SC", system-ui, sans-serif`;
    ctx.fillText(value, x, y, maxWidth);
  };
  label('SoFarAway', 46, 70, 43, '#ebf8ff', true);
  label(nickname, 48, 102, 23, '#c0d5e3', false, 410);
  if (brandLogo) {
    const height = 42;
    const width = height * brandLogo.naturalWidth / brandLogo.naturalHeight;
    const centerX = 538, centerY = 60;
    ctx.fillStyle = '#eaf5fa';
    ctx.beginPath();
    ctx.arc(centerX, centerY, 26, 0, 2 * Math.PI);
    ctx.fill();
    ctx.drawImage(brandLogo, centerX - width / 2, centerY - height / 2, width, height);
  }
  ctx.textAlign = 'right';
  label('LibreCosta', 671, 68, 22, '#ebf8ff', true, 99);
  ctx.textAlign = 'left';
  label(details.volume, 48, 172, 27, accent, true);
  label(details.flight, 48, 211, 22, '#d8e9f2');
  label(details.outcome, 48, 261, 22, accent);
  label(details.score, 43, 350, 86, '#ebf8ff', true, 475);
  ctx.textAlign = 'right';
  label(details.rank, 670, 346, 66, accent, true);
  ctx.textAlign = 'left';
  ctx.fillStyle = accent;
  ctx.fillRect(48, 382, 624, 2);
  for (const [i, [name, value]] of details.metrics.entries()) {
    label(name, 48 + 210 * i, 427, 20, '#d8e9f2', false, 196);
    label(value, 48 + 210 * i, 475, 37, i === 2 ? '#ffcb85' : accent, true, 196);
  }
  return true;
}
