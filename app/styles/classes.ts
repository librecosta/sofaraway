import styles from './game.module.css';

export function classes(...names: (string | false)[]) {
  return names.filter((name): name is string => !!name).map(name => styles[name]).join(' ');
}
