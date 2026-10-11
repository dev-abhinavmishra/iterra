import type { Band } from '../lib/bands';
import { BAND_LABEL } from '../lib/bands';
import { cx } from '../lib/utils';

/** Status lamp — the consistency band as a lit indicator on the faceplate. */
export function Lamp({ band }: { band: Band }) {
  return <span className={cx('lamp', `lamp--${band}`)}>{BAND_LABEL[band]}</span>;
}
