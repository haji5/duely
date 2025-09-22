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

  if (!currentUser) {
    return null;
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors"
      >
        {currentUser.photoURL ? (
          <img
            src={currentUser.photoURL}
            alt={firstName || 'User'}
            className="w-8 h-8 rounded-full"
          />
        ) : (
          <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
            <span className="text-sm font-medium text-gray-700">
              {firstName?.charAt(0) || currentUser.email?.charAt(0) || 'U'}
            </span>
          </div>
        )}
        <svg
          className={`w-4 h-4 transition-transform ${showDropdown ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {showDropdown && (
        <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-50 border border-gray-200">
          <div className="px-4 py-2 border-b border-gray-100">
            <p className="text-sm font-medium text-gray-900">
              {firstName || 'User'}
            </p>
            <p className="text-sm text-gray-500">{currentUser.email}</p>
          </div>
          <Link
            to={`/browse?creator=${encodeURIComponent(currentUser.uid)}`}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors flex items-center space-x-2"
            onClick={() => setShowDropdown(false)}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <span>My Brackets</span>
          </Link>
          <button
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoggingOut ? 'Signing out...' : 'Sign out'}
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
