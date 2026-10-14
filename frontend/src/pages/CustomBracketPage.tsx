import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { bracketApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../config/firebase';
import { isSafeHttpUrl, isYouTubeUrl, getYouTubeEmbedUrl, getYouTubeThumbnail, fetchYouTubeTitle, isSpotifyUrl, getSpotifyEmbedUrl, fetchSpotifyTitle } from '../utils/mediaUtils';

interface BracketItem {
  title: string;
  mediaUrl: string;
  mediaType: string;
  isFetchingTitle?: boolean;
}

const CustomBracketPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, signInWithGoogle } = useAuth();
  const [bracketName, setBracketName] = useState('');
  const [bracketType, setBracketType] = useState<'song' | 'video' | 'image'>('video');
  const [bracketCategory, setBracketCategory] = useState('General');
  const [items, setItems] = useState<BracketItem[]>([
    { title: '', mediaUrl: '', mediaType: 'video' },
    { title: '', mediaUrl: '', mediaType: 'video' }
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categories = [
    'General',
    'Music',
    'TV',
    'Movies',
    'Sports',
    'Gaming',
    'Food',
    'Travel',
    'Art',
    'Technology',
    'Entertainment'
  ];

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

  // New function to handle URL updates with automatic title fetching for YouTube videos
  const updateItemUrl = async (index: number, url: string) => {
    const updatedItems = [...items];
    updatedItems[index] = { ...updatedItems[index], mediaUrl: url };

    // If it's a video type and YouTube URL, automatically fetch the title
    if (bracketType === 'video' && isYouTubeUrl(url) && url.trim()) {
      updatedItems[index].isFetchingTitle = true;
      setItems(updatedItems);

      try {
        const title = await fetchYouTubeTitle(url);
        if (title) {
          updatedItems[index].title = title;
          updatedItems[index].isFetchingTitle = false;
          setItems([...updatedItems]);
        } else {
          updatedItems[index].isFetchingTitle = false;
          setItems([...updatedItems]);
        }
      } catch (error) {
        console.error('Failed to fetch YouTube title:', error);
        updatedItems[index].isFetchingTitle = false;
        setItems([...updatedItems]);
      }
    } else if (bracketType === 'song' && isSpotifyUrl(url) && url.trim()) {
      // Auto fetch title for Spotify links as well
      updatedItems[index].isFetchingTitle = true;
      setItems(updatedItems);

      try {
        const title = await fetchSpotifyTitle(url);
        if (title) {
          updatedItems[index].title = title;
          updatedItems[index].isFetchingTitle = false;
          setItems([...updatedItems]);
        } else {
          updatedItems[index].isFetchingTitle = false;
          setItems([...updatedItems]);
        }
      } catch (error) {
        console.error('Failed to fetch Spotify title:', error);
        updatedItems[index].isFetchingTitle = false;
        setItems([...updatedItems]);
      }
    } else {
      setItems(updatedItems);
    }
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

    // Enhanced URL validation using shared utilities
    for (const item of validItems) {
      if (!isSafeHttpUrl(item.mediaUrl)) {
        return `Invalid URL for item: ${item.title}`;
      }
    }

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    console.log('[CustomBracket] Submit started, currentUser:', currentUser);

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
      // Ensure Firebase auth is ready
      const user = auth.currentUser;
      console.log('[CustomBracket] Firebase auth.currentUser:', user ? user.uid : 'null');

      if (!user) {
        setError('Authentication session expired. Please sign in again.');
        setLoading(false);
        return;
      }

      const validItems = items.filter(item => item.title.trim() && item.mediaUrl.trim());
      console.log('[CustomBracket] Creating bracket with', validItems.length, 'items');

      // Step 1: Create the bracket (createdBy derived from backend auth)
      const bracket = await bracketApi.createBracket(bracketName, '', bracketType, bracketCategory);
      console.log('[CustomBracket] Bracket created successfully:', bracket.id);

      // Step 2: Add all items to the bracket using bulk endpoint (MUCH more efficient!)
      if (validItems.length > 0) {
        await bracketApi.bulkAddItemsToBracket(bracket.id, validItems);
      }

      console.log('[CustomBracket] All items added, navigating to bracket page');

      navigate(`/bracket/${bracket.id}`);
    } catch (err: any) {
      console.error('[CustomBracket] Error creating bracket:', err);
      console.error('[CustomBracket] Error response:', err.response);

      // Handle specific error cases
      if (err.response?.status === 401) {
        setError('Authentication failed. Please sign out and sign in again, then try creating your bracket.');
      } else if (err.message?.includes('Authentication')) {
        setError(err.message);
      } else {
        setError(err.response?.data?.message || 'Failed to create bracket. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const getMediaPreview = (item: BracketItem, index: number) => {
    if (!item.mediaUrl.trim()) return null;

    switch (bracketType) {
      case 'song':
        if (isSpotifyUrl(item.mediaUrl)) {
          const embedUrl = getSpotifyEmbedUrl(item.mediaUrl);
          return (
            <div className="mt-2 relative bg-tertiary rounded overflow-hidden">
              <iframe
                src={embedUrl}
                width="100%"
                height="80"
                frameBorder="0"
                allow="encrypted-media"
                className="rounded"
                title={`Spotify preview ${index + 1}`}
              />
            </div>
          );
        }
        return (
          <div className="mt-2">
            <audio controls className="w-full h-8">
              <source src={item.mediaUrl} type="audio/mpeg" />
              Your browser does not support the audio element.
            </audio>
          </div>
        );
      case 'video':
        // Use shared utility functions for YouTube handling
        const embedUrl = getYouTubeEmbedUrl(item.mediaUrl, false); // Disable autoplay in create bracket page
        const thumbnailUrl = getYouTubeThumbnail(item.mediaUrl);

        return (
          <div className="mt-2 relative">
            <div className="relative bg-tertiary rounded overflow-hidden">
              <iframe
                width="100%"
                height="120"
                src={embedUrl}
                title={`Video preview ${index + 1}`}
                allow="autoplay; encrypted-media; picture-in-picture; web-share"
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
    <div className="page max-w-3xl pb-24 pt-10 sm:pt-14">
        <header className="mb-10">
          <h1 className="font-display text-[3rem] font-black leading-none text-themed-primary sm:text-[3.5rem]">
            Make a bracket
          </h1>
          <p className="mt-3 max-w-xl text-lg text-themed-secondary">
            Add at least two entries. Players see them two at a time and pick a winner until one is left.
          </p>
        </header>

          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Bracket Name */}
            <div>
              <label htmlFor="bracketName" className="field-label">
                Name
              </label>
              <input
                type="text"
                id="bracketName"
                value={bracketName}
                onChange={(e) => setBracketName(e.target.value)}
                className="field text-base"
                placeholder={bracketType === 'video' ? 'e.g. Best music videos of the 90s' : bracketType === 'song' ? 'e.g. Best Radiohead songs' : 'e.g. Best album covers'}
                required
              />
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-[1fr_14rem]">
              {/* Bracket Type */}
              <fieldset>
                <legend className="field-label">What are people choosing between?</legend>
                <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Bracket type">
                  {(['video', 'song', 'image'] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      role="radio"
                      aria-checked={bracketType === type}
                      onClick={() => updateBracketType(type)}
                      className="choice flex items-center justify-center gap-2 py-2.5"
                    >
                      {getTypeIcon(type)}
                      {type === 'video' ? 'Videos' : type === 'song' ? 'Songs' : 'Images'}
                    </button>
                  ))}
                </div>
              </fieldset>

              {/* Bracket Category */}
              <div>
                <label htmlFor="bracketCategory" className="field-label">
                  Category
                </label>
                <select
                  id="bracketCategory"
                  value={bracketCategory}
                  onChange={(e) => setBracketCategory(e.target.value)}
                  className="field"
                >
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Playlist Autofill (For Song and Video Types) */}
            {(bracketType === 'song' || bracketType === 'video') && (
              <div className="card p-4 sm:p-5">
                <div className="flex items-center gap-2 mb-1">
                  <svg className="w-5 h-5 text-[#1DB954]" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.54.659.301 1.02zm1.44-3.3c-.301.42-.84.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.6.18-1.2.72-1.38 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.54-1.02.72-1.56.3z" />
                    </svg>
                    <label htmlFor="playlistUrl" className="font-semibold text-themed-primary">Fill from a Spotify playlist</label>
                  </div>
                  <p className="field-hint mb-3">
                    {bracketType === 'video'
                      ? 'Each track is added as an entry, and we look up a YouTube video for it.'
                      : 'Each track in the playlist is added as an entry.'}
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      id="playlistUrl"
                      className="field flex-1"
                      placeholder="https://open.spotify.com/playlist/…"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        const urlInput = document.getElementById('playlistUrl') as HTMLInputElement;
                        const url = urlInput?.value;
                        if (!url || (!url.includes('spotify.com') && !url.includes('playlist'))) return;

                        // Set specific item to show loading
                        setItems([...items, { title: 'Loading playlist...', mediaUrl: url, mediaType: bracketType, isFetchingTitle: true }]);

                        try {
                          // Call our new backend metadata API endpoint
                          const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/metadata/spotify/playlist?url=${encodeURIComponent(url)}`);
                          if (response.ok) {
                            const tracks = await response.json();
                            if (tracks && tracks.length > 0) {
                              const newItems = tracks.map((t: any) => ({
                                title: t.title,
                                mediaUrl: t.mediaUrl,
                                mediaType: bracketType,
                                isFetchingTitle: bracketType === 'video'
                              }));

                              // Remove empty initial items if there are any
                              const filteredItems = items.filter(item =>
                                !(item.title === '' && item.mediaUrl === '' && !item.isFetchingTitle) &&
                                !(item.title === 'Loading playlist...' && item.mediaUrl === url)
                              );

                              setItems([...filteredItems, ...newItems]);
                              urlInput.value = ''; // clear input

                              if (bracketType === 'video') {
                                // sequentially fetch YouTube URLs for each track
                                for (let i = 0; i < newItems.length; i++) {
                                  try {
                                    const ytRes = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/metadata/youtube/search?query=${encodeURIComponent(newItems[i].title)}`);
                                    if (ytRes.ok) {
                                      const ytData = await ytRes.json();
                                      newItems[i].mediaUrl = ytData.mediaUrl;
                                    }
                                  } catch (err) {
                                    console.error('Failed to fetch YouTube URL for', newItems[i].title, err);
                                  }
                                  newItems[i].isFetchingTitle = false;

                                  setItems(prev => {
                                    const copy = [...prev];
                                    const matchIndex = filteredItems.length + i;
                                    if (copy[matchIndex]) {
                                      copy[matchIndex] = { ...newItems[i] };
                                    }
                                    return copy;
                                  });
                                }
                              }
                            }
                          } else {
                             // Remove loading item
                             setItems(items.filter(i => !(i.title === 'Loading playlist...' && i.mediaUrl === url)));
                          }
                        } catch (error) {
                          console.error("Failed to parse Spotify playlist", error);
                          setItems(items.filter(i => !(i.title === 'Loading playlist...' && i.mediaUrl === url)));
                        }
                      }}
                      className="btn shrink-0 border border-[#1DB954] bg-[#1DB954] text-[#0b1f12] hover:bg-[#1ed760]"
                    >
                      Import
                    </button>
                  </div>
                </div>
              )}

              {/* Bracket Items */}
              <div>
                <div className="mb-1 flex items-baseline justify-between gap-4">
                  <h2 className="font-display text-[2rem] font-extrabold leading-none text-themed-primary">Entries</h2>
                  <span className="text-sm text-themed-tertiary tabular">
                    {items.filter(item => item.title.trim() && item.mediaUrl.trim()).length} ready
                  </span>
                </div>
                <p className="field-hint mb-5">
                  {bracketType === 'image'
                    ? 'Paste a direct link to each image.'
                    : `Paste a ${bracketType === 'song' ? 'Spotify' : 'YouTube'} link and the title fills itself in.`}
                </p>

                <ol className="space-y-3">
                  {items.map((item, index) => (
                    <li
                      key={index}
                      className="card flex gap-3 p-4 sm:gap-4"
                    >
                      <span className="w-7 shrink-0 pt-6 text-right font-display text-2xl font-extrabold leading-none text-themed-tertiary tabular" aria-hidden="true">
                        {index + 1}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <div>
                            <label htmlFor={`item-url-${index}`} className="field-label text-sm">
                              {bracketType === 'song' ? 'Spotify or audio link' :
                               bracketType === 'video' ? 'YouTube or video link' : 'Image link'}
                            </label>
                            <input
                              id={`item-url-${index}`}
                              type="url"
                              value={item.mediaUrl}
                              onChange={(e) => updateItemUrl(index, e.target.value)}
                              className="field"
                              placeholder="https://"
                            />
                          </div>
                          <div>
                            <label htmlFor={`item-title-${index}`} className="field-label flex items-center gap-2 text-sm">
                              Title
                              {item.isFetchingTitle && (
                                <span className="inline-flex items-center gap-1.5 font-normal text-themed-tertiary">
                                  <span className="spinner" style={{ width: '0.75rem', height: '0.75rem' }} />
                                  Looking it up…
                                </span>
                              )}
                            </label>
                            <input
                              id={`item-title-${index}`}
                              type="text"
                              value={item.title}
                              onChange={(e) => updateItem(index, 'title', e.target.value)}
                              className="field"
                              placeholder={`${bracketType === 'song' ? 'Song' : bracketType === 'video' ? 'Video' : 'Image'} title`}
                              disabled={item.isFetchingTitle}
                            />
                          </div>
                        </div>

                        {getMediaPreview(item, index)}
                      </div>

                      {items.length > 2 && (
                        <button
                          type="button"
                          onClick={() => removeItem(index)}
                          className="btn btn-ghost -mr-1 -mt-1 h-9 w-9 shrink-0 self-start p-0"
                          aria-label={`Remove entry ${index + 1}`}
                          title="Remove entry"
                        >
                          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </li>
                  ))}
                </ol>

                <button
                  type="button"
                  onClick={addItem}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-themed-secondary py-3 font-semibold text-themed-secondary transition-colors duration-150 hover:bg-themed-tertiary hover:text-themed-primary"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  <span>Add entry</span>
                </button>
              </div>

              {/* Error Message */}
              {error && (
                <div className="notice notice-error" role="alert">
                  <p className="text-themed-primary">{error}</p>
                </div>
              )}

              {/* Authentication Warning */}
              {!currentUser && (
                <div className="notice notice-warning">
                  <p className="font-semibold text-themed-primary">Sign in to publish</p>
                  <p className="mt-0.5">
                    You can fill everything in now. You’ll need to be signed in before the bracket can be created.
                  </p>
                  <button
                    type="button"
                    onClick={signInWithGoogle}
                    className="mt-2 font-semibold text-themed-primary underline underline-offset-4"
                  >
                    Sign in with Google
                  </button>
                </div>
              )}

              {/* Submit Buttons */}
              <div className="flex flex-col-reverse gap-3 border-t border-themed-primary pt-6 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => navigate('/')}
                  className="btn btn-secondary btn-lg"
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-lg sm:min-w-[14rem]"
                  disabled={loading || !currentUser}
                  title={!currentUser ? 'Sign in to create a bracket' : ''}
                >
                  {loading ? (
                    <>
                      <span className="spinner" />
                      <span>Creating…</span>
                    </>
                  ) : !currentUser ? (
                    'Sign in to create'
                  ) : (
                    'Create bracket'
                  )}
                </button>
              </div>

            </form>
    </div>
  );
};

export default CustomBracketPage;
