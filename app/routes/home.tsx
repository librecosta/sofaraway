import { GameViewport } from '../components/GameViewport';

const title = 'SoFaraway — a rhythm runner';
const description = 'Thread the gates, ride the beat. Four procedural worlds with synthesized music, by LibreCosta.';
const canonical = 'https://sofaraway.librecosta.com/';

export const meta = () => [
  { title },
  { name: 'description', content: description },
  { property: 'og:title', content: title },
  { property: 'og:description', content: description },
  { property: 'og:type', content: 'website' },
  { property: 'og:site_name', content: 'LibreCosta' },
  { property: 'og:url', content: canonical },
  { name: 'twitter:card', content: 'summary' },
  { name: 'twitter:title', content: title },
  { name: 'twitter:description', content: description },
];

export const links = () => [{ rel: 'canonical', href: canonical }];

export default function Home() {
  return <GameViewport />;
}
