import * as React from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import LoginButton from './LoginButton';
import UserProfile from './UserProfile';
import ThemeToggle from './ThemeToggle';

export const Logo: React.FC<{ className?: string }> = ({ className = 'w-7 h-7' }) => (
  <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
    <rect width="32" height="32" rx="7" fill="var(--accent-primary)" />
    <path
      d="M7 9h6v7h6M7 23h6v-7M19 16h6"
      fill="none"
      stroke="var(--accent-primary-text)"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `hidden sm:inline-flex px-3 py-2 rounded-md text-[0.95rem] font-semibold transition-colors ${
    isActive ? 'text-themed-primary' : 'text-themed-secondary hover:text-themed-primary'
  }`;

const Navbar: React.FC = () => {
  const { currentUser } = useAuth();

  return (
    <header
      className="sticky top-0 z-40 border-b border-themed-primary backdrop-blur"
      style={{ backgroundColor: 'color-mix(in srgb, var(--bg-primary) 90%, transparent)' }}
    >
      <nav className="page flex h-16 items-center justify-between gap-3" aria-label="Main">
        <Link to="/" className="flex items-center gap-2.5 rounded-md">
          <Logo />
          <span className="font-display text-[1.7rem] font-extrabold leading-none tracking-tight text-themed-primary">
            Duely
          </span>
        </Link>

        <div className="flex items-center gap-1 sm:gap-2">
          <NavLink to="/browse" className={navLinkClass}>
            Browse
          </NavLink>
          <Link to="/create" className="btn btn-primary px-3 sm:px-4 py-2" aria-label="Create bracket">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 5v14m7-7H5" />
            </svg>
            <span className="hidden sm:inline">Create bracket</span>
          </Link>
          <ThemeToggle />
          <div className="ml-1">{currentUser ? <UserProfile /> : <LoginButton />}</div>
        </div>
      </nav>
    </header>
  );
};

export default Navbar;
