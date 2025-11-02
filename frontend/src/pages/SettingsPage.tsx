import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useNavigate } from 'react-router-dom';
import SettingsIcon from '../components/SettingsIcon';

const SettingsPage: React.FC = () => {
  const { currentUser, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'profile' | 'appearance' | 'account'>('profile');
  const [displayName, setDisplayName] = useState(currentUser?.displayName || '');
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    setDisplayName(currentUser?.displayName || '');
  }, [currentUser]);

  useEffect(() => {
    const originalDisplayName = currentUser?.displayName || '';
    setHasChanges(displayName !== originalDisplayName);
  }, [displayName, currentUser]);

  const handleSave = async () => {
    if (!displayName.trim()) {
      setSaveMessage('Display name cannot be empty');
      setTimeout(() => setSaveMessage(''), 3000);
      return;
    }

    if (displayName.length < 2) {
      setSaveMessage('Display name must be at least 2 characters');
      setTimeout(() => setSaveMessage(''), 3000);
      return;
    }

    if (displayName.length > 50) {
      setSaveMessage('Display name must be 50 characters or less');
      setTimeout(() => setSaveMessage(''), 3000);
      return;
    }

    setIsSaving(true);
    try {
      // Update in localStorage for persistence
      if (currentUser) {
        const updatedUser = {
          ...currentUser,
          displayName: displayName.trim()
        };
        localStorage.setItem('user', JSON.stringify(updatedUser));
        setHasChanges(false);
        setSaveMessage('Settings saved successfully!');
        setTimeout(() => setSaveMessage(''), 3000);
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      setSaveMessage('Error saving settings');
      setTimeout(() => setSaveMessage(''), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleThemeChange = (newTheme: 'light' | 'dark' | 'system') => {
    if (newTheme === 'system') {
      // For now, default to dark theme when system is selected
      // Could be enhanced later to detect system preference
      if (theme !== 'dark') {
        toggleTheme();
      }
    } else if (newTheme !== theme) {
      toggleTheme();
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/');
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-themed-primary flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-themed-primary mb-4">Please Sign In</h1>
          <p className="text-themed-secondary mb-6">You need to be signed in to access settings.</p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-3 rounded-lg font-semibold transition-all duration-200"
            style={{
              backgroundColor: 'var(--accent-primary)',
              color: 'var(--accent-primary-text)'
            }}
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'profile', label: 'Profile', icon: '👤' },
    { id: 'appearance', label: 'Appearance', icon: '🎨' },
    { id: 'account', label: 'Account', icon: '⚙️' }
  ] as const;

  return (
    <div className="min-h-screen bg-themed-primary">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-themed-secondary">
              <SettingsIcon />
            </div>
            <h1 className="text-3xl font-bold text-themed-primary">Settings</h1>
          </div>
          {hasChanges && (
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-6 py-2.5 rounded-lg font-semibold transition-all duration-200 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
              style={{
                backgroundColor: 'var(--accent-primary)',
                color: 'var(--accent-primary-text)'
              }}
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          )}
        </div>

        {/* Save Message */}
        {saveMessage && (
          <div className={`mb-6 p-4 rounded-lg border ${
            saveMessage.includes('successfully')
              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300'
              : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
          }`}>
            {saveMessage}
          </div>
        )}

        {/* Tabs */}
        <div className="bg-themed-secondary rounded-2xl border-2 border-themed-primary overflow-hidden">
          {/* Tab Navigation */}
          <div className="border-b border-themed-primary">
            <div className="flex flex-col sm:flex-row">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 flex items-center justify-center gap-2 px-6 py-4 font-semibold transition-all duration-200 ${
                    activeTab === tab.id
                      ? 'border-b-2'
                      : 'hover:bg-themed-tertiary'
                  }`}
                  style={{
                    borderBottomColor: activeTab === tab.id ? 'var(--accent-primary)' : 'transparent',
                    color: activeTab === tab.id ? 'var(--accent-primary)' : 'var(--text-secondary)'
                  }}
                >
                  <span className="text-xl">{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Tab Content */}
          <div className="p-6 sm:p-8">
            {/* Profile Tab */}
            {activeTab === 'profile' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold text-themed-primary mb-6">Profile Information</h2>

                  {/* Profile Picture */}
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-themed-secondary mb-3">
                      Profile Picture
                    </label>
                    <div className="flex items-center gap-4">
                      {currentUser.photoURL ? (
                        <img
                          src={currentUser.photoURL}
                          alt="Profile"
                          className="w-16 h-16 rounded-full"
                        />
                      ) : (
                        <div className="w-16 h-16 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center">
                          <span className="text-xl font-bold text-white">
                            {displayName?.charAt(0) || currentUser.email?.charAt(0) || 'U'}
                          </span>
                        </div>
                      )}
                      <button
                        className="px-4 py-2 rounded-lg border-2 transition-all duration-200 bg-themed-secondary text-themed-primary"
                        style={{
                          borderColor: 'var(--border-primary)'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = 'var(--accent-primary)';
                          e.currentTarget.style.color = 'var(--accent-primary-text)';
                          e.currentTarget.style.borderColor = 'var(--accent-primary)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
                          e.currentTarget.style.color = 'var(--text-primary)';
                          e.currentTarget.style.borderColor = 'var(--border-primary)';
                        }}
                      >
                        Change Photo
                      </button>
                    </div>
                  </div>

                  {/* Display Name */}
                  <div className="mb-6">
                    <label htmlFor="displayName" className="block text-sm font-medium text-themed-secondary mb-2">
                      Display Name
                    </label>
                    <input
                      id="displayName"
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full px-4 py-3 rounded-lg border-2 bg-themed-primary text-themed-primary transition-all duration-200 focus:outline-none focus:ring-2"
                      style={{
                        borderColor: 'var(--border-primary)',
                        '--tw-ring-color': 'rgba(147, 51, 234, 0.3)'
                      } as React.CSSProperties}
                      placeholder="Enter your display name"
                      maxLength={50}
                    />
                    <p className="mt-1 text-sm text-themed-tertiary">
                      {displayName.length}/50 characters
                    </p>
                  </div>

                  {/* Email (Read-only) */}
                  <div>
                    <label className="block text-sm font-medium text-themed-secondary mb-2">
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={currentUser.email || ''}
                      readOnly
                      className="w-full px-4 py-3 rounded-lg border-2 bg-themed-tertiary text-themed-secondary cursor-not-allowed"
                      style={{
                        borderColor: 'var(--border-primary)'
                      }}
                    />
                    <p className="mt-1 text-sm text-themed-tertiary">
                      Email address cannot be changed here
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Appearance Tab */}
            {activeTab === 'appearance' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold text-themed-primary mb-6">Appearance Settings</h2>

                  {/* Theme Selector */}
                  <div>
                    <label className="block text-sm font-medium text-themed-secondary mb-3">
                      Theme
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {[
                        { value: 'light', label: 'Light', icon: '☀️' },
                        { value: 'dark', label: 'Dark', icon: '🌙' },
                        { value: 'system', label: 'System', icon: '💻' }
                      ].map((themeOption) => (
                        <button
                          key={themeOption.value}
                          onClick={() => handleThemeChange(themeOption.value as any)}
                          className={`p-4 rounded-lg border-2 transition-all duration-200 ${
                            (themeOption.value === 'system' && theme === 'dark') || theme === themeOption.value
                              ? 'border-2'
                              : 'border-themed-primary hover:border-themed-secondary'
                          }`}
                          style={{
                            borderColor: ((themeOption.value === 'system' && theme === 'dark') || theme === themeOption.value)
                              ? 'var(--accent-primary)'
                              : 'var(--border-primary)',
                            backgroundColor: ((themeOption.value === 'system' && theme === 'dark') || theme === themeOption.value)
                              ? 'var(--accent-primary)'
                              : 'var(--bg-secondary)'
                          }}
                        >
                          <div className="text-2xl mb-2">{themeOption.icon}</div>
                          <div className="font-medium" style={{
                            color: ((themeOption.value === 'system' && theme === 'dark') || theme === themeOption.value)
                              ? 'var(--accent-primary-text)'
                              : 'var(--text-primary)'
                          }}>
                            {themeOption.label}
                          </div>
                        </button>
                      ))}
                    </div>
                    <p className="mt-3 text-sm text-themed-tertiary">
                      Current theme: <strong>{theme === 'light' ? 'Light' : 'Dark'}</strong>
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Account Tab */}
            {activeTab === 'account' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold text-themed-primary mb-6">Account Information</h2>

                  {/* User ID */}
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-themed-secondary mb-2">
                      User ID
                    </label>
                    <input
                      type="text"
                      value={currentUser.uid}
                      readOnly
                      className="w-full px-4 py-3 rounded-lg border-2 bg-themed-tertiary text-themed-secondary cursor-not-allowed font-mono text-sm"
                      style={{
                        borderColor: 'var(--border-primary)'
                      }}
                    />
                  </div>

                  {/* Email */}
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-themed-secondary mb-2">
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={currentUser.email || ''}
                      readOnly
                      className="w-full px-4 py-3 rounded-lg border-2 bg-themed-tertiary text-themed-secondary cursor-not-allowed"
                      style={{
                        borderColor: 'var(--border-primary)'
                      }}
                    />
                  </div>

                  {/* Actions */}
                  <div className="space-y-4">
                    <div className="border-t border-themed-primary pt-6">
                      <h3 className="text-lg font-medium text-themed-primary mb-4">Account Actions</h3>

                      {/* Privacy Policy Link */}
                      <div className="mb-4">
                        <button
                          className="px-4 py-2 rounded-lg border-2 transition-all duration-200 bg-themed-secondary text-themed-primary"
                          style={{
                            borderColor: 'var(--border-primary)'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'var(--accent-primary)';
                            e.currentTarget.style.color = 'var(--accent-primary-text)';
                            e.currentTarget.style.borderColor = 'var(--accent-primary)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
                            e.currentTarget.style.color = 'var(--text-primary)';
                            e.currentTarget.style.borderColor = 'var(--border-primary)';
                          }}
                        >
                          View Privacy Policy
                        </button>
                      </div>

                      {/* Sign Out Button */}
                      <div>
                        <button
                          onClick={handleLogout}
                          className="px-4 py-2.5 rounded-lg font-semibold transition-all duration-200 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 border-2 border-red-200 dark:border-red-800"
                        >
                          Sign Out
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;