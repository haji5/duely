import { describe, expect, it } from 'vitest';
import { getSpotifyEmbedUrl, mediaUrlProblem, spotifyResource, youTubeVideoId } from './mediaUtils';
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

describe('randomId', () => {
  it('returns distinct 32-character hex ids', () => {
    const a = randomId();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(randomId()).not.toBe(a);
  });
});
