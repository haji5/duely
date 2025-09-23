import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { bracketApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

interface BracketItem {
  title: string;
  mediaUrl: string;
  mediaType: string;
}

const CustomBracketPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, signInWithGoogle } = useAuth();
  const [bracketName, setBracketName] = useState('');
  const [bracketType, setBracketType] = useState<'song' | 'video' | 'image'>('song');
  const [items, setItems] = useState<BracketItem[]>([
    { title: '', mediaUrl: '', mediaType: 'song' },
    { title: '', mediaUrl: '', mediaType: 'song' }
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addItem = () => {
    setItems([...items, { title: '', mediaUrl: '', mediaType: bracketType }]);
  };

  const removeItem = (index: number) => {
    if (items.length > 2) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const updateItem = (index: number, field: keyof BracketItem, value: string) => {
    const updatedItems = [...items];
    updatedItems[index] = { ...updatedItems[index], [field]: value };
    setItems(updatedItems);
  };

  const updateBracketType = (newType: 'song' | 'video' | 'image') => {
    setBracketType(newType);
    // Update all items' mediaType when bracket type changes
    const updatedItems = items.map(item => ({ ...item, mediaType: newType }));
    setItems(updatedItems);
  };

  const validateForm = (): string | null => {
    if (!bracketName.trim()) {
      return 'Bracket name is required';
    }

    const validItems = items.filter(item => item.title.trim() && item.mediaUrl.trim());
    if (validItems.length < 2) {
      return 'At least 2 items are required';
    }

    // Basic URL validation
    for (const item of validItems) {
      try {
        new URL(item.mediaUrl);
      } catch {
        return `Invalid URL for item: ${item.title}`;
      }
    }

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Check if user is authenticated
    if (!currentUser) {
      setError('You must be logged in to create a bracket. Please sign in and try again.');
      return;
    }

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const validItems = items.filter(item => item.title.trim() && item.mediaUrl.trim());

      // Step 1: Create the bracket (createdBy derived from backend auth)
      const bracket = await bracketApi.createBracket(bracketName, '', bracketType);

      // Step 2: Add all items to the bracket
      for (const item of validItems) {
        await bracketApi.addItemToBracket(bracket.id, item.title, item.mediaUrl, item.mediaType);
      }

      navigate(`/bracket/${bracket.id}`);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create bracket. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getMediaPreview = (item: BracketItem, index: number) => {
    if (!item.mediaUrl.trim()) return null;

    switch (bracketType) {
      case 'song':
        return (
          <div className="mt-2">
            <audio controls className="w-full h-8">
              <source src={item.mediaUrl} type="audio/mpeg" />
              Your browser does not support the audio element.
            </audio>
          </div>
        );
      case 'video':
        // Handle YouTube URLs
        let embedUrl = item.mediaUrl;
        let thumbnailUrl = '';

        if (item.mediaUrl.includes('youtube.com/watch?v=')) {
          const videoId = item.mediaUrl.split('v=')[1]?.split('&')[0];
          embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=0&mute=1&controls=1&modestbranding=1&rel=0`;
          thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
        } else if (item.mediaUrl.includes('youtu.be/')) {
          const videoId = item.mediaUrl.split('youtu.be/')[1]?.split('?')[0];
          embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=0&mute=1&controls=1&modestbranding=1&rel=0`;
          thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
        }

        return (
          <div className="mt-2 relative">
            <div className="relative bg-tertiary rounded overflow-hidden">
              <iframe
                width="100%"
                height="120"
                src={embedUrl}
                title={`Video preview ${index + 1}`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="rounded border-0"
                loading="lazy"
              />
              {/* Show thumbnail as fallback behind iframe */}
              {thumbnailUrl && (
                <img
                  src={thumbnailUrl}
                  alt={`Thumbnail ${index + 1}`}
                  className="absolute inset-0 w-full h-full object-cover -z-10"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              )}
            </div>
          </div>
        );
      case 'image':
        return (
          <div className="mt-2">
            <img
              src={item.mediaUrl}
              alt={`Preview ${index + 1}`}
              className="w-full h-32 object-cover rounded"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
        );
      default:
        return null;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'song':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
          </svg>
        );
      case 'video':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        );
      case 'image':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        );
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <h1 className="text-4xl font-bold text-primary text-center mb-8">
          Create Your Own Bracket
        </h1>

        <div className="card max-w-2xl mx-auto">
          <form onSubmit={handleSubmit} className="p-8 space-y-6">
            {/* Bracket Name */}
            <div>
              <label htmlFor="bracketName" className="block text-sm font-medium text-primary mb-2">
                Bracket Name
              </label>
              <input
                type="text"
                id="bracketName"
                value={bracketName}
                onChange={(e) => setBracketName(e.target.value)}
                className="w-full px-3 py-2 border border-primary rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                placeholder="e.g., Best Radiohead Songs"
                required
              />
            </div>

            {/* Bracket Type */}
            <div>
              <label htmlFor="bracketType" className="block text-sm font-medium text-primary mb-2">
                Bracket Type
              </label>
              <select
                id="bracketType"
                value={bracketType}
                onChange={(e) => updateBracketType(e.target.value as 'song' | 'video' | 'image')}
                className="w-full px-3 py-2 border border-primary rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="song">Songs</option>
                <option value="video">Videos</option>
                <option value="image">Images</option>
              </select>
            </div>

            {/* Items Section */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-primary">Items</h3>
                <span className="text-sm text-tertiary">
                  {items.filter(item => item.title.trim() && item.mediaUrl.trim()).length} items added
                </span>
              </div>

              <div className="space-y-4">
                {items.map((item, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="border border-primary rounded-lg p-4 bg-tertiary"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center space-x-2 text-primary-600">
                        {getTypeIcon(bracketType)}
                        <span className="text-sm font-medium">Item {index + 1}</span>
                      </div>
                      {items.length > 2 && (
                        <button
                          type="button"
                          onClick={() => removeItem(index)}
                          className="text-error hover:text-red-700 p-1"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-secondary mb-1">Title</label>
                        <input
                          type="text"
                          value={item.title}
                          onChange={(e) => updateItem(index, 'title', e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-primary rounded focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                          placeholder={`${bracketType === 'song' ? 'Song' : bracketType === 'video' ? 'Video' : 'Image'} title`}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-secondary mb-1">
                          {bracketType === 'song' ? 'Spotify/Audio URL' :
                           bracketType === 'video' ? 'YouTube/Video URL' : 'Image URL'}
                        </label>
                        <input
                          type="url"
                          value={item.mediaUrl}
                          onChange={(e) => updateItem(index, 'mediaUrl', e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-primary rounded focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                          placeholder={`Paste ${bracketType} URL here`}
                        />
                      </div>
                    </div>

                    {getMediaPreview(item, index)}
                  </motion.div>
                ))}
              </div>

              <button
                type="button"
                onClick={addItem}
                className="w-full mt-4 py-3 border-2 border-dashed border-primary rounded-lg text-secondary hover:text-primary hover:bg-tertiary transition-colors duration-200 flex items-center justify-center space-x-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                <span>Add Another Item</span>
              </button>
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-4 bg-error/10 border border-error/20 rounded-lg">
                <p className="text-error text-sm">{error}</p>
              </div>
            )}

            {/* Authentication Warning */}
            {!currentUser && (
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-start space-x-3">
                  <svg className="w-5 h-5 text-yellow-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.232 15.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  <div>
                    <h3 className="text-sm font-medium text-yellow-800">Sign in required</h3>
                    <p className="text-sm text-yellow-700 mt-1">
                      You need to be logged in to create a bracket. You can fill out all the details, but you'll need to sign in before creating the bracket.
                    </p>
                    <button
                      type="button"
                      onClick={signInWithGoogle}
                      className="mt-2 text-sm font-medium text-yellow-800 hover:text-yellow-900 underline"
                    >
                      Sign in with Google
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Submit Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 pt-6">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="btn btn-secondary flex-1"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={`btn flex-1 ${!currentUser ? 'btn-disabled cursor-not-allowed opacity-50' : 'btn-primary'}`}
                disabled={loading || !currentUser}
                title={!currentUser ? 'You must be logged in to create a bracket' : ''}
              >
                {loading ? (
                  <div className="flex items-center justify-center space-x-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    <span>Creating...</span>
                  </div>
                ) : !currentUser ? (
                  'Sign in to Create Bracket'
                ) : (
                  'Create Bracket'
                )}
              </button>
            </div>
          </form>
        </div>
      </motion.div>
    </div>
  );
};

export default CustomBracketPage;
