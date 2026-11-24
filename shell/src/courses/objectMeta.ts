import { PLACE_MAP, formatEntityType } from '../places';

/* Compact "course · item type · source" descriptor shared by search hits
   and library rows, so three objects sharing a title stay distinguishable
   before opening them. Every part is optional — missing fields drop out
   rather than rendering "undefined". */
export function objectMetaLine(parts: {
  course?: string | null;
  type?: string | null;
  app?: string | null;
  detail?: string | null;
  topic?: string | null;
}): string {
  return [
    parts.course,
    parts.type ? formatEntityType(parts.type) : null,
    parts.app ? PLACE_MAP[parts.app]?.label || parts.app : null,
    parts.detail,
    parts.topic,
  ]
    .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    .join(' · ');
}
