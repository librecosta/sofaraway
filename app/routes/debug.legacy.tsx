import { Link, useOutletContext } from 'react-router';
import type { ExplorerContext } from '../components/explorer/ExplorerLayout';
import { explorerHref } from '../components/explorer/explorer-catalog';

export const meta = () => [
  { title: 'SoFarAway / Moved experiments' },
  { name: 'robots', content: 'noindex' },
];

export default function LegacyExperiments() {
  const { selectedVolume } = useOutletContext<ExplorerContext>();
  return <p>The experiments have moved to <Link to={explorerHref('overview', selectedVolume)}>Technical Explorer</Link>.</p>;
}
