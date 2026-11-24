import { useState, type ReactNode } from 'react';
import { PLACE_MAP } from '../places';
import { MosaicGlobe } from './MosaicGlobe';
import { MosaicObject } from './MosaicObject';
import type { MosaicObjectName } from './mosaicObjects';
import './atlas-masthead.css';

/* Which painted terrain strip each place calls home — the same three
   vignettes the landing catalog uses, reassigned so neighbouring places
   don't share a strip. */
const TERRAIN_FOR_PLACE: Record<string, 0 | 1 | 2> = {
  boxed: 0,
  syllabus: 1,
  rhythm: 2,
  flashcards: 0,
  ink: 1,
  margin: 2,
  gradestack: 0,
  timer: 1,
  proof: 2,
};

export interface AtlasMastheadProps {
  /** PLACE_MAP id — supplies the glyph, literary place name, and a default
      terrain strip. Omit for generic pages (Courses, Library, Settings). */
  place?: string;
  /** Painted terrain strip 0|1|2 — overrides the place default. */
  variant?: 0 | 1 | 2;
  eyebrow?: string;
  title: ReactNode;
  sub?: ReactNode;
  /** Right-aligned action slot (buttons, badges). */
  actions?: ReactNode;
  /** 3D mosaic accent — 'globe' (default), or a procedural object like
      'compass'/'books'; 'none' hides the accent entirely. */
  object?: MosaicObjectName | 'none';
  /** @deprecated use object="none" — kept for existing call sites. */
  globe?: boolean;
  /** Slimmer band for app headers — less padding, smaller type. */
  compact?: boolean;
  className?: string;
}

/* The atlas masthead — the landing's artwork language as a reusable page
   header: dusk-sky gradient, drifting starfield, contour survey, a painted
   terrain vignette along the bottom edge, gold registration frame, and the
   jade-and-limestone mosaic globe. Self-contained dark artwork — it reads
   as a painted cartouche on both paper and graphite terrains. */
export function AtlasMasthead({
  place,
  variant,
  eyebrow,
  title,
  sub,
  actions,
  object,
  globe,
  compact = false,
  className,
}: AtlasMastheadProps) {
  const p = place ? PLACE_MAP[place] : undefined;
  const terrain = variant ?? (place ? TERRAIN_FOR_PLACE[place] ?? 0 : 0);
  const accent: MosaicObjectName | 'none' = object ?? (globe === false ? 'none' : 'globe');
  const [imgFailed, setImgFailed] = useState(false);
  return (
    <header
      className={`atlas-masthead${compact ? ' compact' : ''}${className ? ` ${className}` : ''}`}
      aria-label={typeof title === 'string' ? title : (p?.place ?? eyebrow)}
    >
      <div className="atlas-mh-stars" aria-hidden="true" />
      <div className="atlas-mh-contours" aria-hidden="true" />
      {!imgFailed && (
        <img
          className="atlas-mh-terrain"
          src={`/atlas/terrain-${terrain}.webp`}
          alt=""
          aria-hidden="true"
          loading="lazy"
          onError={() => setImgFailed(true)}
        />
      )}
      {accent === 'globe' && <MosaicGlobe className="atlas-mh-globe" />}
      {accent !== 'globe' && accent !== 'none' && (
        <MosaicObject name={accent} className="atlas-mh-globe mosaic-object" />
      )}
      <div className="atlas-mh-body">
        <div className="atlas-mh-lead">
          {(p || eyebrow) && (
            <div className="atlas-mh-eyebrow">
              {p ? p.place : eyebrow}
            </div>
          )}
          <div className="atlas-mh-title-row">
            {p && (
              <span className="atlas-mh-glyph" aria-hidden="true">
                {p.glyph}
              </span>
            )}
            <h1 className="atlas-mh-title">{title}</h1>
          </div>
          {sub && <p className="atlas-mh-sub">{sub}</p>}
        </div>
        {actions && <div className="atlas-mh-actions">{actions}</div>}
      </div>
    </header>
  );
}
