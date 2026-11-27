import { expect, test } from 'vitest';
import type { Diagnostics } from '../../app/game/contracts';
import { resolveRunPolicy } from '../../app/game/core/run-policy';
import { CAPTURE_RUN_SEED } from '../../app/game/core/run-seed';
import { VOLUMES } from '../../app/game/core/volumes';

const diagnostics: Diagnostics = { fixedTime: null, autoplay: false, align: false, god: false, boost: false,
  debug: false, mobileQuality: false, post: true, record: false };

test.each(VOLUMES)('$id resolves the same mode and difficulty for its run and reference', ({ id: volumeId }) => {
  const settings = { diagnostics, saveRecords: true };
  for (const difficulty of ['easy', 'normal', 'hard', 'impossible']) {
    const selection = { volumeId, mode: 'standard', difficulty };
    expect(resolveRunPolicy(selection, settings, 'run')).toMatchObject({ volumeId, mode: 'standard', difficulty,
      referenceDifficulty: difficulty, scoring: true, recordsEligible: true, seed: undefined, showcaseRoute: null });
    expect(resolveRunPolicy(selection, settings, 'menu')).toMatchObject({ referenceDifficulty: 'normal', recordsEligible: false });
  }
  expect(resolveRunPolicy({ volumeId, mode: 'sightseeing', difficulty: 'impossible' }, settings, 'run')).toMatchObject({
    mode: 'sightseeing', difficulty: 'normal', referenceDifficulty: 'normal', scoring: true, recordsEligible: true, showcaseRoute: null,
  });
  for (const showcaseRoute of ['main', 'challenge', 'score']) {
    const selection = { volumeId, mode: 'showcase', difficulty: 'easy', showcaseRoute };
    for (const purpose of ['menu', 'run', 'capture'] as const) {
      expect(resolveRunPolicy(selection, settings, purpose)).toMatchObject({ mode: 'standard', difficulty: 'impossible',
        referenceDifficulty: 'impossible', scoring: false, recordsEligible: false, showcaseRoute, seed: CAPTURE_RUN_SEED,
        allowSimulationDiagnostics: false,
      });
    }
  }
});

test('explicit seeds and effective diagnostic eligibility follow the launch purpose', () => {
  const selection = { volumeId: 'orbit', difficulty: 'hard', mode: 'standard' } as const;
  const flags = { ...diagnostics };
  const settings = { diagnostics: flags, saveRecords: true };
  expect(resolveRunPolicy(selection, { ...settings, runSeed: 0 }, 'run').seed).toBe(0);
  const showcase = { ...selection, mode: 'showcase', showcaseRoute: 'score' };
  expect(resolveRunPolicy(showcase, { ...settings, showcaseSeed: 18 }, 'run').seed).toBe(18);
  expect(resolveRunPolicy(showcase, { ...settings, showcaseSeed: 18, runSeed: 7 }, 'capture').seed).toBe(7);
  for (const flag of ['autoplay', 'god', 'align', 'debug', 'record'] as const) {
    expect(resolveRunPolicy(selection, { ...settings, diagnostics: { ...diagnostics, [flag]: true } }, 'run').recordsEligible).toBe(false);
  }
  expect(resolveRunPolicy(selection, { ...settings, saveRecords: false }, 'run').recordsEligible).toBe(false);
  flags.fixedTime = 0;
  expect(resolveRunPolicy(selection, settings, 'run').recordsEligible).toBe(false);
  flags.boost = flags.god = flags.align = true;
  const capture = resolveRunPolicy(selection, settings, 'capture');
  expect(capture).toMatchObject({ difficulty: 'hard', referenceDifficulty: 'hard', seed: CAPTURE_RUN_SEED,
    allowSimulationDiagnostics: true, captureBoost: true, recordsEligible: false });
  expect(resolveRunPolicy(showcase, settings, 'capture').allowSimulationDiagnostics).toBe(false);
  flags.fixedTime = null;
  flags.god = flags.align = false;
  expect(capture.recordsEligible).toBe(false);
  expect(resolveRunPolicy(selection, settings, 'run')).toMatchObject({ captureBoost: false, recordsEligible: true });
});

test('invalid input resolves to a playable mode, difficulty, route and seed', () => {
  const settings = { diagnostics, runSeed: NaN, showcaseSeed: -1 };
  expect(resolveRunPolicy({ volumeId: 'orbit', mode: 'invalid', difficulty: 'invalid' }, settings, 'run'))
    .toMatchObject({ mode: 'standard', difficulty: 'normal', seed: undefined, showcaseRoute: null });
  expect(resolveRunPolicy({ volumeId: 'orbit', mode: 'showcase', difficulty: 'invalid', showcaseRoute: 'invalid' }, settings, 'run'))
    .toMatchObject({ difficulty: 'impossible', seed: CAPTURE_RUN_SEED, showcaseRoute: 'main' });
});

test('Auto Boost is a Standard run preference and has no effect on record eligibility or capture overrides', () => {
  const selection = { volumeId: 'elsewhere', mode: 'standard', difficulty: 'normal' } as const;
  const settings = { diagnostics, saveRecords: true };
  expect(resolveRunPolicy(selection, settings, 'run').autoBoost).toBe(false);
  const enabled = { ...selection, autoBoost: true };
  expect(resolveRunPolicy(enabled, settings, 'run')).toMatchObject({
    autoBoost: true, captureBoost: false, recordsEligible: true,
  });
  for (const mode of ['sightseeing', 'showcase']) {
    expect(resolveRunPolicy({ ...enabled, mode }, settings, 'run').autoBoost).toBe(false);
  }
  expect(resolveRunPolicy(enabled, settings, 'menu').autoBoost).toBe(false);
  expect(resolveRunPolicy(enabled, { diagnostics: { ...diagnostics, autoplay: true } }, 'run').autoBoost).toBe(false);
  const capture = { diagnostics: { ...diagnostics, fixedTime: 4 } };
  expect(resolveRunPolicy(enabled, capture, 'capture')).toMatchObject({ autoBoost: false, captureBoost: false });
  expect(resolveRunPolicy(selection, { diagnostics: { ...capture.diagnostics, boost: true } }, 'capture'))
    .toMatchObject({ autoBoost: false, captureBoost: true });
});
