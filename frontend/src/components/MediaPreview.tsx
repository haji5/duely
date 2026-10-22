import * as React from 'react';
import type { Item } from '@/types';
import {
  getSpotifyEmbedUrl, getYouTubeEmbedUrl, getYouTubeThumbnail, isSafeHttpsUrl, isSpotifyUrl,
} from '../utils/mediaUtils';

interface MediaPreviewProps {
  item: Item;
  className?: string;
  /** 'thumbnail' is a static preview for lists; 'full' is the interactive battle preview. */
  size?: 'thumbnail' | 'full';
}

// Only one preview plays sound at a time: unmuting one tells the others to mute.
const AUDIO_EVENT = 'duely:preview-audio';

function announceAudio(owner: symbol) {
  window.dispatchEvent(new CustomEvent(AUDIO_EVENT, { detail: owner }));
}

function useExclusiveAudio(onOtherStarted: () => void): symbol {
  const owner = React.useRef(Symbol('preview')).current;
  const callback = React.useRef(onOtherStarted);
  callback.current = onOtherStarted;
  React.useEffect(() => {
    const listener = (e: Event) => {
      if ((e as CustomEvent<symbol>).detail !== owner) callback.current();
    };
    window.addEventListener(AUDIO_EVENT, listener);
    return () => window.removeEventListener(AUDIO_EVENT, listener);
  }, [owner]);
  return owner;
}

/** Stops clicks on preview controls from also picking the battle card they sit in. */
const stop = (e: React.SyntheticEvent) => e.stopPropagation();

const MusicIcon: React.FC<{ className?: string }> = ({ className = 'h-8 w-8' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
  </svg>
);

const Unavailable: React.FC<{ label: string; tall: boolean }> = ({ label, tall }) => (
  <div className={`flex w-full ${tall ? 'h-72' : 'h-full min-h-14'} items-center justify-center rounded-lg bg-themed-tertiary text-sm text-themed-tertiary`}>
    {label}
  </div>
);

const SpotifyPreview: React.FC<{ item: Item; thumbnail: boolean }> = ({ item, thumbnail }) => {
  const embedUrl = getSpotifyEmbedUrl(item.mediaUrl);
  if (thumbnail || !embedUrl) {
    return (
      <div className="flex h-full w-full items-center justify-center text-themed-tertiary" title={embedUrl ? undefined : 'Unsupported Spotify link'}>
        <MusicIcon />
      </div>
    );
  }
  // The embed has its own play button, which works with keyboard and touch.
  return (
    <iframe
      src={embedUrl}
      className="h-80 w-full rounded-lg border-0"
      loading="lazy"
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      title={item.title}
    />
  );
};

const AudioPreview: React.FC<{ item: Item; thumbnail: boolean }> = ({ item, thumbnail }) => {
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = React.useState(false);
  const owner = useExclusiveAudio(() => audioRef.current?.pause());

  if (thumbnail) {
    return <div className="flex h-full w-full items-center justify-center text-themed-tertiary"><MusicIcon /></div>;
  }
  if (!isSafeHttpsUrl(item.mediaUrl)) return <Unavailable label="Audio unavailable" tall />;

  const play = () => {
    const audio = audioRef.current;
    if (!audio) return;
    announceAudio(owner);
    void audio.play().catch(() => {});
  };
  const toggle = (e: React.MouseEvent) => {
    stop(e);
    if (playing) audioRef.current?.pause();
    else play();
  };

  return (
    <div
      className="flex flex-col items-center gap-4"
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') play(); }}
      onPointerLeave={(e) => { if (e.pointerType === 'mouse') audioRef.current?.pause(); }}
    >
      <div
        className="record-spin flex h-48 w-48 items-center justify-center rounded-full"
        data-playing={playing}
        style={{ backgroundColor: 'var(--accent-primary)', color: 'var(--accent-primary-text)' }}
      >
        <MusicIcon className="h-24 w-24" />
      </div>
      <button type="button" onClick={toggle} onKeyDown={stop} className="btn btn-secondary" aria-pressed={playing}>
        {playing ? 'Pause preview' : 'Play preview'}
      </button>
      <audio
        ref={audioRef}
        src={item.mediaUrl}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
    </div>
  );
};

const VideoPreview: React.FC<{ item: Item; thumbnail: boolean }> = ({ item, thumbnail }) => {
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const [started, setStarted] = React.useState(false);
  // The requested sound state; the badge shows it and it is re-sent once the player is ready,
  // so the badge and the player can't disagree.
  const [soundOn, setSoundOn] = React.useState(false);
  const soundRef = React.useRef(soundOn);
  soundRef.current = soundOn;
  const owner = useExclusiveAudio(() => setSoundOn(false));
  const [thumbFailed, setThumbFailed] = React.useState(false);

  const sendSoundState = React.useCallback(() => {
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: 'command', func: soundRef.current ? 'unMute' : 'mute', args: [] }),
      'https://www.youtube.com',
    );
  }, []);

  React.useEffect(() => {
    if (!started) return;
    if (soundOn) announceAudio(owner);
    sendSoundState();
  }, [soundOn, started, owner, sendSoundState]);

  // Player commands sent before the embed finishes initialising are dropped; resend shortly after load.
  const readyTimer = React.useRef<ReturnType<typeof setTimeout>>(undefined);
  React.useEffect(() => () => clearTimeout(readyTimer.current), []);
  const onLoad = () => {
    sendSoundState();
    clearTimeout(readyTimer.current);
    readyTimer.current = setTimeout(sendSoundState, 800);
  };

  const embedUrl = getYouTubeEmbedUrl(item.mediaUrl, true);
  const thumbnailUrl = getYouTubeThumbnail(item.mediaUrl);
  if (!embedUrl || !thumbnailUrl) return <Unavailable label="Video unavailable" tall={!thumbnail} />;

  if (thumbnail) {
    return thumbFailed
      ? <Unavailable label="" tall={false} />
      : <img src={thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" onError={() => setThumbFailed(true)} />;
  }

  if (!started) {
    return (
      <button
        type="button"
        onClick={(e) => { stop(e); setStarted(true); }}
        onKeyDown={stop}
        className="group/play relative flex h-72 w-full items-center justify-center overflow-hidden rounded-lg bg-themed-tertiary"
        aria-label={`Play a preview of ${item.title}`}
      >
        {!thumbFailed && (
          <img src={thumbnailUrl} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" onError={() => setThumbFailed(true)} />
        )}
        <span className="absolute inset-0 bg-black/30 transition-colors group-hover/play:bg-black/40" />
        <span className="relative rounded-full bg-white/90 p-4 text-gray-800 transition-transform duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] group-active/play:scale-95">
          <svg className="h-12 w-12" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
          </svg>
        </span>
      </button>
    );
  }

  return (
    <div
      className="relative w-full"
      // Mouse users get sound while hovering; touch and keyboard users use the button.
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') setSoundOn(true); }}
      onPointerLeave={(e) => { if (e.pointerType === 'mouse') setSoundOn(false); }}
    >
      <iframe
        ref={iframeRef}
        src={embedUrl}
        onLoad={onLoad}
        className="h-72 w-full rounded-lg border-0"
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen; web-share"
        allowFullScreen
        title={item.title}
      />
      <button
        type="button"
        onClick={(e) => { stop(e); setSoundOn(on => !on); }}
        onKeyDown={stop}
        className="absolute right-3 top-3 rounded bg-black/60 px-3 py-1.5 text-sm font-semibold text-white backdrop-blur-sm"
        aria-pressed={soundOn}
      >
        {soundOn ? 'Sound on' : 'Sound off'}
      </button>
    </div>
  );
};

const ImagePreview: React.FC<{ item: Item; thumbnail: boolean }> = ({ item, thumbnail }) => {
  const [failedUrl, setFailedUrl] = React.useState<string | null>(null);
  if (!isSafeHttpsUrl(item.mediaUrl) || failedUrl === item.mediaUrl) {
    return <Unavailable label={thumbnail ? '' : 'Image unavailable'} tall={!thumbnail} />;
  }
  return (
    <img
      src={item.mediaUrl}
      alt={item.title}
      className={`w-full ${thumbnail ? 'h-full' : 'h-72'} rounded-lg object-cover`}
      loading="lazy"
      onError={() => setFailedUrl(item.mediaUrl)}
    />
  );
};

const MediaPreview: React.FC<MediaPreviewProps> = ({ item, className = '', size = 'full' }) => {
  const thumbnail = size === 'thumbnail';
  let content: React.ReactNode;
  switch (item.mediaType) {
    case 'song':
      content = isSpotifyUrl(item.mediaUrl)
        ? <SpotifyPreview item={item} thumbnail={thumbnail} />
        : <AudioPreview item={item} thumbnail={thumbnail} />;
      break;
    case 'video':
      content = <VideoPreview item={item} thumbnail={thumbnail} />;
      break;
    default:
      content = <ImagePreview item={item} thumbnail={thumbnail} />;
  }
  return <div className={`flex items-center justify-center ${className}`}>{content}</div>;
};

export default MediaPreview;
