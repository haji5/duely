import * as React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import LoginButton from './LoginButton';
import UserProfile from './UserProfile';
import ThemeToggle from './ThemeToggle';

const Navbar: React.FC = () => {
  const { currentUser } = useAuth();

  return (
    <nav className="bg-themed-secondary shadow-themed-lg border-b border-themed-primary">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center space-x-4">
            <ThemeToggle />
            <Link to="/" className="flex items-center space-x-2">
              <div className="bg-primary-600 text-white p-2 rounded-lg">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <span className="text-xl font-bold text-themed-primary">Duely</span>
            </Link>
          </div>

          <div className="flex items-center space-x-4">
            <Link
              to="/"
              className="text-themed-secondary hover:text-themed-primary px-3 py-2 rounded-md text-sm font-medium transition-colors"
            >
              Home
            </Link>
            <div className="bg-themed-tertiary h-6 w-px"></div>
            <Link to="/create" className="btn btn-primary">
              Create Bracket
            </Link>
            <div className="bg-themed-tertiary h-6 w-px"></div>
            {currentUser ? (
              <UserProfile />
            ) : (
              <LoginButton />
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
