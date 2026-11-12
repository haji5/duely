import React from 'react';
import { canonicalUrl } from './PageMeta';

type Status = 'idle' | 'copied' | 'failed';

const ShareIcon: React.FC = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12v7a2 2 0 002 2h12a2 2 0 002-2v-7M16 6l-4-4-4 4M12 2v13" />
  </svg>
);

/**
 * Shares a page's canonical URL with the system share sheet where there is one, and otherwise
 * copies it. When the clipboard isn't available (plain http on a LAN address) the link is shown
 * in a field to copy by hand. No third-party scripts.
 */
const ShareButton: React.FC<{ path: string; title: string; text: string; label?: string; className?: string }> = ({
  path, title, text, label = 'Share', className = 'btn btn-secondary',
}) => {
  const [status, setStatus] = React.useState<Status>('idle');
  const url = canonicalUrl(path);

  React.useEffect(() => {
    if (status !== 'copied') return;
    const timer = setTimeout(() => setStatus('idle'), 2500);
    return () => clearTimeout(timer);
  }, [status]);

  const share = async () => {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (error) {
        // Dismissing the share sheet is not a failure; anything else falls back to copying.
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setStatus('copied');
    } catch {
      setStatus('failed');
    }
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <button type="button" onClick={() => void share()} className={className}>
        <ShareIcon />
        {status === 'copied' ? 'Link copied' : label}
      </button>
      <span role="status" className={status === 'failed' ? 'block w-full' : 'sr-only'}>
        {status === 'copied' && 'Link copied to the clipboard'}
        {status === 'failed' && (
          <label className="block text-sm text-themed-secondary">
            Copy this link
            <input
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="field mt-1"
              // It appears in answer to the user's own click on Share, so focus follows them there.
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
            />
          </label>
        )}
      </span>
    </div>
  );
};

export default ShareButton;
