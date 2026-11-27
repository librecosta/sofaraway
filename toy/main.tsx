import { createRoot } from 'react-dom/client';

const root = createRoot(document.getElementById('root')!);
if (__TOY_DEVELOPMENT__ && window === window.top) {
  document.documentElement.lang = 'en';
  void import('./dev/DevConsole').then(({ DevConsole }) => root.render(<DevConsole />));
} else {
  void import('./ToyPlayer').then(({ ToyPlayer }) => root.render(<ToyPlayer />));
}
