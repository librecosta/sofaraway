import { GameViewport } from '../components/GameViewport';
import { ChinaRegistration } from '../components/ChinaRegistration';

const title = 'SoFarAway — A Procedural Rhythm Runner';
const description = 'Four worlds. Four soundtracks. Thread the gates and ride the beat in a browser rhythm runner with entirely runtime-generated graphics and music. By LibreCosta.';
const canonical = 'https://sofaraway.librecosta.com/';
const image = new URL('social/orbit-aurora.jpg', canonical).href;
const imageAlt = 'Purple gates and asteroids suspended in the blue and magenta AURORA nebula in ORBIT.';

export const meta = () => [
  { title },
  { name: 'description', content: description },
  { property: 'og:title', content: title },
  { property: 'og:description', content: description },
  { property: 'og:type', content: 'website' },
  { property: 'og:site_name', content: 'SoFarAway' },
  { property: 'og:url', content: canonical },
  { property: 'og:locale', content: 'en_US' },
  { property: 'og:image', content: image },
  { property: 'og:image:type', content: 'image/jpeg' },
  { property: 'og:image:width', content: '1200' },
  { property: 'og:image:height', content: '630' },
  { property: 'og:image:alt', content: imageAlt },
  { name: 'twitter:card', content: 'summary_large_image' },
  { name: 'twitter:title', content: title },
  { name: 'twitter:description', content: description },
  { name: 'twitter:image', content: image },
  { name: 'twitter:image:alt', content: imageAlt },
];

export const links = () => [{ rel: 'canonical', href: canonical }];

export default function Home() {
  return <GameViewport compliance={import.meta.env.VITE_REGION === 'cn' ? <ChinaRegistration /> : undefined} />;
}
