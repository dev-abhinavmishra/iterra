import type { Band } from '../lib/bands';
import { BAND_LABEL } from '../lib/bands';
import { cx } from '../lib/utils';

/** Word stamp — the consistency band as a registrar's annotation. */
export function WStamp({ band }: { band: Band }) {
  return <span className={cx('wstamp', `wstamp--${band}`)}>{BAND_LABEL[band]}</span>;
}
