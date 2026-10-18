import { isSpotifyUrl, isYouTubeUrl } from '@/utils/mediaUtils';

/** Looks up a title via the provider's public oEmbed endpoint; null if there isn't one. */
async function oembedTitle(endpoint: string, url: string, signal?: AbortSignal): Promise<string | null> {
  const response = await fetch(`${endpoint}?url=${encodeURIComponent(url)}&format=json`, { signal });
  if (!response.ok) return null;
  const data: unknown = await response.json();
  const title = (data as { title?: unknown })?.title;
  return typeof title === 'string' && title.trim() ? title.trim() : null;
}

/** Title of a YouTube video or Spotify track/album/playlist, or null if unknown. */
export async function fetchMediaTitle(url: string, signal?: AbortSignal): Promise<string | null> {
  if (isYouTubeUrl(url)) return oembedTitle('https://www.youtube.com/oembed', url, signal);
  if (isSpotifyUrl(url)) return oembedTitle('https://open.spotify.com/oembed', url, signal);
  return null;
}
