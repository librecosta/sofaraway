import { wav } from './voices.mjs';
import { renderDaybreak } from '../../../app/game/audio/daybreak-export.client.ts';

export async function render() {
  const buffer = await renderDaybreak();
  return { ...wav(buffer, 1), duration: buffer.duration };
}
