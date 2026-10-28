import { describe, expect, it } from 'vitest';
import {
  getSpotifyEmbedUrl, getYouTubeEmbedUrl, getYouTubeThumbnail, isSafeHttpsUrl, mediaUrlProblem, spotifyResource,
  youTubeVideoId,
} from './mediaUtils';
import { randomId } from './ids';

describe('youTubeVideoId (same rules as the backend)', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
    ['https://youtube.com/watch?feature=share&v=dQw4w9WgXcQ&t=42'],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ'],
    ['https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=RD'],
    ['https://youtu.be/dQw4w9WgXcQ?si=abc'],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ'],
    ['https://www.youtube.com/live/dQw4w9WgXcQ?feature=share'],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ'],
    ['https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'],
  ])('extracts the id from %s', (url) => {
    expect(youTubeVideoId(url)).toBe('dQw4w9WgXcQ');
  });

  it.each([
    'https://www.youtube.com/watch?v=tooShort',
    'https://evil.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/playlist?list=PL123',
    'not a url',
  ])('rejects %s', (url) => {
    expect(youTubeVideoId(url)).toBeNull();
  });
});

describe('Spotify links', () => {
  it('skips the intl-xx segment when building the embed URL', () => {
    expect(getSpotifyEmbedUrl('https://open.spotify.com/intl-de/track/4uLU6hMCjMI75M1A2tKUQC?si=x'))
      .toBe('https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC?utm_source=generator');
    expect(spotifyResource('https://open.spotify.com/album/abc')).toEqual({ kind: 'album', id: 'abc' });
    expect(spotifyResource('https://open.spotify.com/user/someone')).toBeNull();
  });
});

describe('mediaUrlProblem', () => {
  it('accepts good links per type', () => {
    expect(mediaUrlProblem('https://youtu.be/dQw4w9WgXcQ', 'video')).toBeNull();
    expect(mediaUrlProblem('https://open.spotify.com/track/abc', 'song')).toBeNull();
    expect(mediaUrlProblem('https://cdn.example.com/song.mp3', 'song')).toBeNull();
    expect(mediaUrlProblem('https://images.example.com/cat.png', 'image')).toBeNull();
  });

  it('rejects what the server rejects', () => {
    expect(mediaUrlProblem('http://images.example.com/cat.png', 'image')).toMatch(/https/);
    expect(mediaUrlProblem('https://vimeo.com/123', 'video')).toMatch(/YouTube/);
    expect(mediaUrlProblem('https://spotify.link/abc', 'song')).toMatch(/spotify\.link/);
    expect(mediaUrlProblem('https://localhost/x.png', 'image')).toMatch(/public/);
    expect(mediaUrlProblem('https://192.168.1.1/x.png', 'image')).toMatch(/public/);
    expect(mediaUrlProblem('https://[::1]/x.png', 'image')).toMatch(/public/);
    expect(mediaUrlProblem('https://2130706433/x.png', 'image')).toMatch(/public/);
    expect(mediaUrlProblem('https://user:pw@example.com/x.png', 'image')).toMatch(/user name/);
    expect(mediaUrlProblem('https://example.com/a b.png', 'image')).toMatch(/spaces/);
    expect(mediaUrlProblem(`https://example.com/${'a'.repeat(2000)}`, 'image')).toMatch(/2000/);
  });
});

describe('mediaUrlProblem parity with the server', () => {
  it.each([
    // The server normalises a trailing dot away before blocking
    'https://localhost./x.png',
    'https://printer.local./x.png',
    // Browsers read leading-zero parts as octal: 012.0.0.1 is 10.0.0.1
    'https://012.0.0.1/x.png',
    'https://0177.0.0.1/x.png',
    'https://0x7f000001/x.png',
    'https://[fe80::1]/x.png',
    'https://[fd00::1]/x.png',
    'https://[ff02::1]/x.png',
    'https://[::ffff:10.0.0.1]/x.png',
    'https://169.254.169.254/latest',
    'https://100.64.0.1/x.png',
    'https://metadata.google.internal/x',
  ])('blocks the local or private host in %s', (url) => {
    expect(mediaUrlProblem(url, 'image')).toMatch(/public/);
  });

  it('rejects a YouTube id the server would not accept', () => {
    // The server reads the raw query, so a percent-encoded id is not an id there.
    expect(youTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXc%51')).toBeNull();
    expect(mediaUrlProblem('https://www.youtube.com/watch?v=dQw4w9WgXc%51', 'video')).toMatch(/YouTube/);
  });

  it('accepts what the server accepts', () => {
    expect(mediaUrlProblem('  https://youtu.be/dQw4w9WgXcQ  ', 'video')).toBeNull();
    expect(mediaUrlProblem('https://WWW.YOUTUBE.COM/watch?v=dQw4w9WgXcQ', 'video')).toBeNull();
    expect(mediaUrlProblem('https://images.example.com:8443/cat.png?x=1#y', 'image')).toBeNull();
    expect(mediaUrlProblem('https://93.184.216.34/x.png', 'image')).toBeNull();
    expect(mediaUrlProblem('https://open.spotify.com/intl-de/track/abc', 'song')).toBeNull();
  });

  it('rejects broken links', () => {
    expect(mediaUrlProblem('', 'image')).toBe('Add a link');
    expect(mediaUrlProblem('   ', 'image')).toBe('Add a link');
    expect(mediaUrlProblem('example.com/x.png', 'image')).toMatch(/valid link/);
    expect(mediaUrlProblem('javascript:alert(1)', 'image')).toMatch(/https/);
    expect(mediaUrlProblem('https://open.spotify.com/user/x', 'song')).toMatch(/Spotify/);
  });
});

describe('embed URLs', () => {
  it('builds embeds only for recognised links', () => {
    expect(getSpotifyEmbedUrl('https://example.com/track/abc')).toBeNull();
    expect(getYouTubeEmbedUrl('https://vimeo.com/1')).toBeNull();
    expect(getYouTubeEmbedUrl('https://youtu.be/dQw4w9WgXcQ', false)).toMatch(/^https:\/\/www\.youtube\.com\/embed\/dQw4w9WgXcQ\?.*autoplay=0/);
    expect(getYouTubeThumbnail('https://youtu.be/dQw4w9WgXcQ')).toBe('https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
  });

  it('only treats https as safe', () => {
    expect(isSafeHttpsUrl('https://x.test/a.png')).toBe(true);
    expect(isSafeHttpsUrl('http://x.test/a.png')).toBe(false);
    expect(isSafeHttpsUrl('data:image/png;base64,AAAA')).toBe(false);
    expect(isSafeHttpsUrl(null)).toBe(false);
  });
});

describe('randomId', () => {
  it('returns distinct 32-character hex ids', () => {
    const a = randomId();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(randomId()).not.toBe(a);
  });
});
