import React from 'react';
import { useLocation } from 'react-router-dom';

const MAX_TITLE = 60;
const MAX_DESCRIPTION = 155;
const SUFFIX = ' | Duely';

export const truncate = (text: string, max: number) =>
  text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;

/**
 * "{main}{detail} | Duely", within about 60 characters. When that's too long the detail becomes
 * shortDetail, then the main text (usually a bracket name) is shortened.
 */
export const pageTitle = (main: string, detail = '', shortDetail = '') => {
  const full = `${main}${detail}${SUFFIX}`;
  if (full.length <= MAX_TITLE) return full;
  return `${truncate(main, MAX_TITLE - SUFFIX.length - shortDetail.length)}${shortDetail}${SUFFIX}`;
};

/** "song" for video brackets in Music (music videos), else the bracket type. Same rule as PageHeads.kind. */
export const bracketKind = (type: string, category?: string | null) =>
  type === 'video' && category === 'Music' ? 'song' : type;

/** The canonical URL of a path: what PageMeta links as canonical, and what Share hands out. */
export const canonicalUrl = (path: string) => `${window.location.origin}${path}`;

/**
 * Per-route <title>, description, canonical and robots. React 19 hoists these into <head>.
 * The canonical is the clean path, so query strings (?fromBattle, ?sort, ?category…) never count
 * as separate pages. Pages that shouldn't be indexed (not found) get noindex and no canonical.
 */
const PageMeta: React.FC<{ title: string; description?: string; path?: string; noindex?: boolean }> = ({
  title, description, path, noindex = false,
}) => {
  const { pathname } = useLocation();
  return (
    <>
      <title>{title}</title>
      {description && <meta name="description" content={truncate(description, MAX_DESCRIPTION)} />}
      {noindex
        ? <meta name="robots" content="noindex" />
        : <link rel="canonical" href={canonicalUrl(path ?? pathname)} />}
    </>
  );
};

export default PageMeta;
