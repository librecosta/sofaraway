import { createRoot } from 'react-dom/client';

const root = createRoot(document.getElementById('root')!);
if (__TOY_DEVELOPMENT__) {
  if (window === window.top) {
    document.documentElement.lang = 'en';
    void import('./dev/DevConsole').then(({ DevConsole }) => root.render(<DevConsole />));
  } else {
    void Promise.all([import('./ToyPlayer'), import('./dev/bridge')])
      .then(([{ ToyPlayer }, { readDevPlatform }]) => root.render(<ToyPlayer platform={readDevPlatform()} />));
  }
} else {
  void import('./NativePlayer').then(({ NativePlayer }) => root.render(<NativePlayer />));
}
