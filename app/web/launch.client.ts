import { volumeById } from '../game/core/volumes';
import type { Diagnostics, GameOptions } from '../game/contracts';
import { readPlayerOptions, webSettings } from '../game/runtime/settings.client';

export type WebGameOptions = GameOptions & { diagnostics: Diagnostics };

export function readWebLaunch(params: URLSearchParams) {
  const time = Number.parseFloat(params.get('t') ?? '');
  const fixedTime = Number.isFinite(time) && time >= 0 ? time : null;
  const requestedMode = params.get('mode');
  const route = params.get('route');
  const seed = params.get('seed');
  const quality = params.get('q') ?? webSettings.read('quality');
  const preferences = readPlayerOptions(webSettings, volumeById(params.get('vol')).id, {
    difficulty: fixedTime !== null ? params.get('diff') : null,
    mode: fixedTime !== null ? requestedMode ?? 'standard' : requestedMode === 'showcase' ? requestedMode : undefined,
    quality,
    lights: fixedTime !== null ? params.get('lights') : null,
  });
  const showcaseSeed = preferences.mode === 'showcase' && seed !== null && /^\d+$/.test(seed) && Number(seed) < 0xffffffff
    ? Number(seed) : undefined;
  const pair = (name: string) => params.get(name)?.split(',').map(Number) ?? [];
  const [x, y] = pair('cur');
  const [aperture, blur] = pair('dof');
  const branchSide = fixedTime !== null ? route : null;
  const diagnostics: Diagnostics = {
    fixedTime, autoplay: params.get('auto') === '1', align: params.get('align') === '1',
    god: params.get('god') === '1' || (fixedTime !== null && !params.has('god')),
    boost: params.get('boost') === '1', mobileQuality: quality === 'mobile',
    post: params.get('post') !== '0', record: params.get('rec') === '1', debug: params.get('dbg') === '1',
    cursor: Number.isFinite(x) && Number.isFinite(y) ? [x, y] : undefined,
    dof: Number.isFinite(aperture) ? [aperture, Number.isFinite(blur) ? blur : undefined] : undefined,
    branchSide: branchSide === 'left' || branchSide === 'right' || branchSide === 'center' ? branchSide : undefined,
  };
  const options: WebGameOptions = {
    ...preferences, diagnostics, showcaseSeed,
    showcaseRoute: route === 'challenge' ? 'challenge' : route === 'bonus' ? 'score' : 'main',
  };
  return { options, hideUi: params.get('ui') === '0', openSettings: params.get('panel') === '1' };
}
