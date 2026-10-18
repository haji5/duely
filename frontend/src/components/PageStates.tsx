import React from 'react';

/** A failed load, with the reason and a retry. Never shown as "empty" or "not found". */
export const ErrorState: React.FC<{ title?: string; message: string; onRetry?: () => void }> = ({
  title = 'Something went wrong', message, onRetry,
}) => (
  <div className="card flex flex-col items-start px-6 py-10" role="alert">
    <h2 className="font-display text-2xl font-extrabold">{title}</h2>
    <p className="mt-1 text-themed-secondary">{message}</p>
    {onRetry && (
      <button type="button" onClick={onRetry} className="btn btn-primary mt-6">
        Try again
      </button>
    )}
  </div>
);
