import { beforeEach, expect, test, vi } from 'vitest';
import { starwakeEvents, starwakeSteps, starwakeTrack, step } from '../../app/game/core/orbit-score';
import { OrbitSynthesizer } from '../../app/game/audio/orbit.client';

const voices = vi.hoisted(() => ({ play: vi.fn(), duckAt: vi.fn(), finish: vi.fn(), dispose: vi.fn() }));
vi.mock('../../app/game/audio/orbit-voices.client', () => ({ OrbitVoices: class {
  play = voices.play; duckAt = voices.duckAt; finish = voices.finish; dispose = voices.dispose;
} }));

beforeEach(() => vi.clearAllMocks());

test('shared step scheduling retains fractional attacks and suppresses elapsed events on resume', () => {
  const event = starwakeEvents.find(event => event.voice === 'bass' && event.beat * 4 % 1 !== 0)!;
  const index = Math.floor(event.beat * 4);
  const synth = new OrbitSynthesizer({} as BaseAudioContext, {} as AudioNode);
  const anchor = 4;
  synth.playStep(index, anchor + index * step, event.at - .001);
  expect(voices.play.mock.calls).toContainEqual([event, anchor + event.at]);
  voices.play.mockClear();
  synth.playStep(index, anchor + index * step, event.at);
  expect(voices.play.mock.calls.every(([played]) => played.at > event.at)).toBe(true);
  voices.play.mockClear();
  synth.scheduleStep(index, anchor, event.at - .001, event.at);
  expect(voices.play).not.toHaveBeenCalled();
});

test('ducking follows scheduled kicks, finish retains the four-second release and disposal stops scheduling', () => {
  const index = starwakeSteps.findIndex(events => events.some(i => starwakeEvents[i].voice === 'kick'));
  const synth = new OrbitSynthesizer({} as BaseAudioContext, {} as AudioNode);
  synth.scheduleStep(index, 2);
  const kicks = voices.play.mock.calls.filter(([event]) => event.voice === 'kick');
  expect(voices.duckAt.mock.calls).toEqual(kicks.map(([, at]) => [at]));
  synth.finishAt(12 + starwakeTrack.duration);
  expect(voices.finish).toHaveBeenCalledWith(12);
  synth.dispose();
  voices.play.mockClear();
  synth.scheduleStep(index, 2);
  expect(voices.dispose).toHaveBeenCalled();
  expect(voices.play).not.toHaveBeenCalled();
});
