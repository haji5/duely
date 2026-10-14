import React from 'react';
import { Link } from 'react-router-dom';
import type { Bracket } from '@/types';

export const TypeIcon: React.FC<{ type: string; className?: string }> = ({ type, className = 'w-4 h-4' }) => {
  switch (type) {
    case 'song':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
        </svg>
      );
    case 'video':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      );
    case 'image':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    default:
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5h5v6h6M4 19h5v-6M15 11v2h5" />
        </svg>
      );
  }
};

const typeLabels: Record<string, string> = {
  song: 'Songs',
  video: 'Videos',
  image: 'Images',
};

export const typeLabel = (type: string) =>
  typeLabels[type] || (type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Mixed');

export const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

const BracketCard: React.FC<{ bracket: Bracket }> = ({ bracket }) => {
  return (
    <Link
      to={`/bracket/${bracket.id}`}
      className="group card relative flex h-full flex-col p-5 transition-colors duration-150 hover:border-[color:var(--accent-primary)]"
    >
      <div className="mb-3 flex items-center justify-between gap-3 text-sm text-themed-secondary">
        <span className="inline-flex items-center gap-1.5 font-medium">
          <TypeIcon type={bracket.type} />
          {typeLabel(bracket.type)}
        </span>
        <span className="truncate text-themed-tertiary">{bracket.category || 'General'}</span>
      </div>

      <h3 className="font-display text-[1.65rem] font-extrabold leading-[1.05] text-themed-primary line-clamp-2">
        {bracket.name}
      </h3>

      {bracket.description && (
        <p className="mt-2 text-sm text-themed-secondary line-clamp-2">{bracket.description}</p>
      )}

      <div className="mt-auto flex items-center justify-between pt-5 text-sm">
        <span className="text-themed-tertiary">{formatDate(bracket.createdAt)}</span>
        <span className="inline-flex items-center gap-1.5 font-semibold text-accent">
          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M6.3 3.7A1 1 0 004.8 4.6v10.8a1 1 0 001.5.9l8.6-5.4a1 1 0 000-1.8L6.3 3.7z" />
          </svg>
          Play
        </span>
      </div>
    </Link>
  );
};

export const PageLoader: React.FC<{ label?: string }> = ({ label = 'Loading' }) => (
  <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3" role="status" aria-live="polite">
    <span className="spinner" style={{ width: '2rem', height: '2rem', borderWidth: 3 }} />
    <span className="text-sm text-themed-tertiary">{label}</span>
  </div>
);

export default BracketCard;
