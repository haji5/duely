import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSessionBattles } from '../contexts/SessionBattleContext';

const UserProfile: React.FC = () => {
  const { currentUser, logout } = useAuth();
  const { clearSessionBattles } = useSessionBattles();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  // Extract first name only
  const getFirstName = (displayName: string | null | undefined): string => {
    if (!displayName) return '';
    return displayName.split(' ')[0];
  };

  const firstName = getFirstName(currentUser?.displayName);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      // Clear session battles when user logs out
      clearSessionBattles();
      setShowDropdown(false);
    } catch (error) {
      console.error('Failed to log out:', error);
    } finally {
      setIsLoggingOut(false);
    }
  };

  React.useEffect(() => {
    if (!showDropdown) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowDropdown(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [showDropdown]);

  if (!currentUser) {
    return null;
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="flex items-center gap-1.5 rounded-full p-0.5 text-themed-secondary transition-colors hover:text-themed-primary"
        aria-haspopup="menu"
        aria-expanded={showDropdown}
        aria-label="Account menu"
      >
        {currentUser.photoURL ? (
          <img
            src={currentUser.photoURL}
            alt=""
            className="h-8 w-8 rounded-full border border-themed-secondary"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span
            className="flex h-8 w-8 items-center justify-center rounded-full font-display text-lg font-extrabold"
            style={{ backgroundColor: 'var(--accent-primary)', color: 'var(--accent-primary-text)' }}
          >
            {(firstName?.charAt(0) || currentUser.email?.charAt(0) || 'U').toUpperCase()}
          </span>
        )}
        <svg
          className={`h-4 w-4 transition-transform ${showDropdown ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {showDropdown && (
        <div
          role="menu"
          className="card absolute right-0 z-50 mt-2 w-64 py-1.5 shadow-themed-xl"
        >
          <div className="border-b border-themed-primary px-4 pb-3 pt-2">
            <p className="font-semibold text-themed-primary">{firstName || 'Signed in'}</p>
            <p className="truncate text-sm text-themed-tertiary" title={currentUser.email || ''}>
              {currentUser.email}
            </p>
          </div>
          <Link
            to={`/browse?creator=${encodeURIComponent(currentUser.uid)}`}
            role="menuitem"
            className="flex items-center gap-3 px-4 py-2.5 text-[0.95rem] text-themed-secondary transition-colors hover:bg-themed-tertiary hover:text-themed-primary"
            onClick={() => setShowDropdown(false)}
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5h5v6h6M4 19h5v-6M15 11v2h5" />
            </svg>
            <span>My brackets</span>
          </Link>
          <button
            onClick={handleLogout}
            disabled={isLoggingOut}
            role="menuitem"
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[0.95rem] text-themed-secondary transition-colors hover:bg-themed-tertiary hover:text-themed-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span>{isLoggingOut ? 'Signing out…' : 'Sign out'}</span>
          </button>
        </div>
      )}

      {showDropdown && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowDropdown(false)}
        />
      )}
    </div>
  );
};

export default UserProfile;
