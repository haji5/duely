// Shared utility functions for media validation and YouTube operations

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const YOUTUBE_HOSTS = new Set(['www.youtube.com', 'youtube.com', 'youtu.be', 'www.youtube-nocookie.com']);
const SPOTIFY_HOSTS = new Set(['open.spotify.com', 'spotify.link']);

export function isSafeHttpUrl(url: string | undefined | null): boolean {
    if (!url) return false;
    try {
        const u = new URL(url);
        return ALLOWED_PROTOCOLS.has(u.protocol);
    } catch {
        return false;
    }
}

export function isYouTubeUrl(url: string): boolean {
    try {
        const u = new URL(url);
        return ALLOWED_PROTOCOLS.has(u.protocol) && !!u.hostname && YOUTUBE_HOSTS.has(u.hostname.toLowerCase());
    } catch {
        return false;
    }
}

export function isSpotifyUrl(url: string): boolean {
    try {
        const u = new URL(url);
        return ALLOWED_PROTOCOLS.has(u.protocol) && !!u.hostname && SPOTIFY_HOSTS.has(u.hostname.toLowerCase());
    } catch {
        return false;
    }
}

export function extractYouTubeId(url: string): string | null {
    if (!isYouTubeUrl(url)) return null;
    const patterns = [
        /youtube\.com\/(?:watch\?v=|embed\/|shorts\/)([a-zA-Z0-9_-]{6,})/,
        /youtu\.be\/([a-zA-Z0-9_-]{6,})/
    ];
    for (const p of patterns) {
        const m = url.match(p);
        if (m && m[1]) return m[1];
    }
    const qs = (() => { try { return new URL(url).searchParams; } catch { return undefined; } })();
    const vParam = qs?.get('v');
    if (vParam) return vParam;
    return null;
}

export function getYouTubeEmbedUrl(url: string, autoplay: boolean = true): string {
    const id = extractYouTubeId(url);
    if (!id) return 'about:blank';
    const origin = typeof window !== 'undefined' ? encodeURIComponent(window.location.origin) : '';
    const autoplayParam = autoplay ? '1' : '0';
    return `https://www.youtube.com/embed/${id}?enablejsapi=1&autoplay=${autoplayParam}&mute=1&controls=1&modestbranding=1&rel=0&playsinline=1&origin=${origin}`;
}

export function getYouTubeThumbnail(url: string): string {
    const id = extractYouTubeId(url);
    return id ? `https://img.youtube.com/vi/${id}/maxresdefault.jpg` : '';
}

export function getSpotifyEmbedUrl(url: string): string {
    if (!isSpotifyUrl(url)) return url;
    try {
        const u = new URL(url);
        // If it's already an embed URL, return it
        if (u.pathname.startsWith('/embed/')) return u.toString();
        // Extract track/album/playlist and ID
        const pathParts = u.pathname.split('/').filter(Boolean);
        if (pathParts.length >= 2) {
            const type = pathParts[0]; // e.g. track, album, playlist
            const id = pathParts[1];
            return `https://open.spotify.com/embed/${type}/${id}`;
        }
        return url;
    } catch {
        return url;
    }
}

// Function to fetch YouTube video title using oEmbed API
export async function fetchYouTubeTitle(url: string): Promise<string | null> {
    if (!isYouTubeUrl(url)) return null;

    try {
        // Use YouTube's oEmbed API to get video information
        const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
        const response = await fetch(oembedUrl);

        if (!response.ok) {
            return null;
        }

        const data = await response.json();
        return data.title || null;
    } catch (error) {
        console.error('Error fetching YouTube title:', error);
        return null;
    }
}

// Function to fetch Spotify track/album title using oEmbed API
export async function fetchSpotifyTitle(url: string): Promise<string | null> {
    if (!isSpotifyUrl(url)) return null;

    try {
        const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}&format=json`;
        const response = await fetch(oembedUrl);

        if (!response.ok) {
            return null;
        }

        const data = await response.json();
        return data.title || null;
    } catch (error) {
        console.error('Error fetching Spotify title:', error);
        return null;
    }
}
