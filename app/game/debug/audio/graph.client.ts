/** Debug ownership follows scheduling steps so finished voices can be collected. */
export function inspectorGraph(context: BaseAudioContext) {
  type Group = { nodes: Set<AudioNode>; sources: Set<AudioScheduledSourceNode>; retire?: number };
  const fixed = new Set<AudioNode>(), groups = new Set<Group>(), methods = new Map<PropertyKey, unknown>();
  let current: Group | undefined;
  function release(group: Group) {
    for (const node of group.nodes) node.disconnect();
    groups.delete(group);
    group.nodes.clear();
  }
  const ctx = new Proxy(context, { get(target, key) {
    const value = Reflect.get(target, key, target);
    if (typeof value !== 'function') return value;
    if (!methods.has(key)) methods.set(key, (...args: unknown[]) => {
      const result = Reflect.apply(value, target, args), group = current;
      if (result instanceof AudioNode) (group?.nodes ?? fixed).add(result);
      if (result instanceof AudioScheduledSourceNode && group) {
        group.sources.add(result);
        // Biquads keep ringing after their final oscillator/noise source ends.
        // Retire on a later scheduling tick, never truncate that audible response.
        result.addEventListener('ended', () => {
          group.sources.delete(result);
          if (!group.sources.size) group.retire = context.currentTime + .5;
        }, { once: true });
      }
      return result;
    });
    return methods.get(key);
  } });
  return {
    ctx,
    schedule(action: () => void) {
      for (const group of groups) if (group.retire !== undefined && context.currentTime >= group.retire) release(group);
      const group: Group = { nodes: new Set(), sources: new Set() };
      groups.add(group);
      current = group;
      try { action(); }
      finally { current = undefined; if (!group.sources.size) release(group); }
    },
    dispose() {
      for (const group of groups) {
        for (const source of group.sources) try { source.stop(); } catch { /* Already retired. */ }
        release(group);
      }
      for (const node of fixed) node.disconnect();
      fixed.clear();
    },
  };
}
