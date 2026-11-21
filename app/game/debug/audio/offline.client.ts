/** Share one offline slot across waveform blocks and explicit exports. */
let pending: Promise<unknown> = Promise.resolve();
export function inspectorOffline<T>(signal: AbortSignal | undefined, render: () => Promise<T>) {
  const job = pending.then(() => { signal?.throwIfAborted(); return render(); });
  // The queue slot must not retain a completed full-song AudioBuffer or Blob.
  pending = job.then(() => {}, () => {});
  return job;
}
