export function downloadWav(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  let active = true;
  const release = () => {
    if (!active) return;
    active = false;
    window.clearTimeout(timer);
    URL.revokeObjectURL(url);
  };
  // Give the browser time to start reading the URL before releasing the PCM blob.
  const timer = window.setTimeout(release, 1000);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
  } catch (error) {
    release();
    throw error;
  }
  return release;
}
