/** Optional post-effects stem destinations; production constructors omit this. */
export type AudioStem = 'kick' | 'snare' | 'hats' | 'bass' | 'arp' | 'pad' | 'fx'
  | 'keys' | 'lead' | 'atmos' | 'signal' | 'chord' | 'metal' | 'sweep' | 'perc' | 'pluck';
export type StemRouting = (stem: AudioStem, mix: AudioNode) => AudioNode;
