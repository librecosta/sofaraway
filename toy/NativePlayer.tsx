import { useEffect, useState } from 'react';
import { NativeToyPlatform } from './native.client';
import { ToyPlayer } from './ToyPlayer';

export function NativePlayer() {
  const [platform] = useState(() => new NativeToyPlatform());
  useEffect(() => platform.connect(), [platform]);
  return <ToyPlayer platform={platform} />;
}
