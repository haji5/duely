import * as React from 'react';
import { motion } from 'framer-motion';
import { Item } from '../types';

interface MediaPreviewProps {
    item: Item;
    className?: string;
    size?: 'thumbnail' | 'full';
}

const MediaPreview: React.FC<MediaPreviewProps> = ({ item, className = '', size = 'full' }) => {
    const [isHovered, setIsHovered] = React.useState(false);
    const [isPlaying, setIsPlaying] = React.useState(false); // for audio rotation
    const [isVideoStarted, setIsVideoStarted] = React.useState(false);
    const audioRef = React.useRef<HTMLAudioElement>(null);
    const iframeRef = React.useRef<HTMLIFrameElement>(null);

    // --- Global video audio arbitration (only one unmuted at a time) ---
    React.useEffect(() => {
        const handleGlobalVideoMute = (evt: Event) => {
            const event = evt as CustomEvent<{ videoId: Item['id'] }>; // narrow
            if (event.detail && event.detail.videoId !== item.id && isVideoStarted) {
                muteVideo();
            }
        };
        window.addEventListener('requestVideoAudio', handleGlobalVideoMute as EventListener);
        return () => window.removeEventListener('requestVideoAudio', handleGlobalVideoMute as EventListener);
    }, [item.id, isVideoStarted]);

    // --- YouTube helper functions ---
    const extractYouTubeId = (url: string): string | null => {
        // Support formats: https://www.youtube.com/watch?v=ID, youtu.be/ID, embed/ID, short URLs with params
        const patterns = [
            /youtube\.com\/(?:watch\?v=|embed\/|shorts\/)([a-zA-Z0-9_-]{6,})/,
            /youtu\.be\/([a-zA-Z0-9_-]{6,})/
        ];
        for (const p of patterns) {
            const m = url.match(p);
            if (m && m[1]) return m[1];
        }
        // Fallback: try v= param
        const vParam = new URLSearchParams(url.split('?')[1] || '').get('v');
        if (vParam) return vParam;
        return null;
    };

    const getYouTubeEmbedUrl = (url: string): string => {
        const id = extractYouTubeId(url);
        if (!id) return url; // Not a recognized YouTube URL; return as-is
        const origin = typeof window !== 'undefined' ? encodeURIComponent(window.location.origin) : '';
        // Autoplay muted; enable JS API for mute/unmute postMessage; playsinline to avoid fullscreen on mobile
        return `https://www.youtube.com/embed/${id}?enablejsapi=1&autoplay=1&mute=1&controls=1&modestbranding=1&rel=0&playsinline=1&origin=${origin}`;
    };

    const getYouTubeThumbnail = (url: string): string => {
        const id = extractYouTubeId(url);
        return id ? `https://img.youtube.com/vi/${id}/maxresdefault.jpg` : '';
    };

    // --- Video mute/unmute via postMessage API ---
    const postPlayerCommand = (func: string) => {
        if (iframeRef.current && iframeRef.current.contentWindow) {
            iframeRef.current.contentWindow.postMessage(
                JSON.stringify({ event: 'command', func, args: [] }),
                '*'
            );
        }
    };
    const muteVideo = () => postPlayerCommand('mute');
    const unmuteVideo = () => {
        postPlayerCommand('unMute');
        const event = new CustomEvent('requestVideoAudio', { detail: { videoId: item.id } });
        window.dispatchEvent(event);
    };

    // --- Hover handlers ---
    const handleMouseEnter = () => {
        setIsHovered(true);
        if (item.mediaType === 'song' && audioRef.current) {
            audioRef.current.currentTime = 0;
            audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
        } else if (item.mediaType === 'video' && isVideoStarted) {
            // Slight delay to ensure iframe ready before unmute
            setTimeout(() => unmuteVideo(), 150);
        }
    };

    const handleMouseLeave = () => {
        setIsHovered(false);
        if (item.mediaType === 'song' && audioRef.current) {
            audioRef.current.pause();
            setIsPlaying(false);
        } else if (item.mediaType === 'video' && isVideoStarted) {
            muteVideo();
        }
    };

    // --- First click to initialize video ---
    const handleVideoPlay = (event: React.MouseEvent) => {
        event.stopPropagation(); // Prevent parent click handlers from firing
        if (!isVideoStarted) {
            setIsVideoStarted(true);
            // If already hovered when starting, attempt early unmute once playback begins (after a short delay)
            setTimeout(() => {
                if (isHovered) unmuteVideo();
            }, 800); // Allow iframe to load and start playback
        }
    };

    const renderMediaContent = () => {
        const sizeClasses = size === 'thumbnail' ? 'w-32 h-32' : 'w-48 h-48';
        switch (item.mediaType) {
            case 'song':
                return (
                    <div className="relative">
                        <motion.div
                            className={`bg-gradient-to-br from-primary-400 to-purple-500 rounded-full flex items-center justify-center shadow-lg ${sizeClasses}`}
                            animate={{ scale: isHovered ? 1.1 : 1, rotate: isPlaying ? 360 : 0 }}
                            transition={{ scale: { duration: 0.3 }, rotate: { duration: 3, repeat: isPlaying ? Infinity : 0, ease: 'linear' } }}
                        >
                            <svg className={`${size === 'thumbnail' ? 'w-12 h-12' : 'w-24 h-24'} text-white`} fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                                <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM15.657 6.343a1 1 0 011.414 0A9.972 9.972 0 0119 12a9.972 9.972 0 01-1.929 5.657 1 1 0 11-1.414-1.414A7.971 7.971 0 0017 12a7.971 7.971 0 00-1.343-4.243 1 1 0 010-1.414z" clipRule="evenodd" />
                                <path fillRule="evenodd" d="M13.828 8.172a1 1 0 011.414 0A5.983 5.983 0 0117 12a5.983 5.983 0 01-1.758 3.828 1 1 0 11-1.414-1.414A3.987 3.987 0 0015 12a3.987 3.987 0 00-1.172-2.828 1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                        </motion.div>
                        <audio ref={audioRef} src={item.mediaUrl} preload="metadata" onEnded={() => setIsPlaying(false)} />
                        {isHovered && size === 'full' && (
                            <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="absolute -bottom-4 left-1/2 -translate-x-1/2 bg-black bg-opacity-75 text-white px-3 py-2 rounded text-sm">
                                {isPlaying ? 'Playing...' : 'Hover to play'}
                            </motion.div>
                        )}
                    </div>
                );

            case 'video': {
                const embedUrl = getYouTubeEmbedUrl(item.mediaUrl);
                const thumbnailUrl = getYouTubeThumbnail(item.mediaUrl);
                const isThumbnail = size === 'thumbnail';
                const playButtonSize = isThumbnail ? 'w-6 h-6' : 'w-12 h-12';
                const playButtonPadding = isThumbnail ? 'p-2' : 'p-4';
                const videoHeight = isThumbnail ? 'h-16' : 'h-72';

                return (
                    <div className="relative w-full max-w-lg select-none">
                        <motion.div animate={{ scale: isHovered ? 1.05 : 1 }} transition={{ duration: 0.3 }}>
                            {isVideoStarted ? (
                                <iframe
                                    ref={iframeRef}
                                    src={embedUrl}
                                    className={`w-full ${videoHeight} border-0 rounded-lg`}
                                    loading="lazy"
                                    style={{ border: 0 }}
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                    allowFullScreen
                                    title={item.title}
                                />
                            ) : (
                                <div className={`relative w-full ${videoHeight} bg-gray-200 flex items-center justify-center cursor-pointer overflow-hidden rounded-lg`} onClick={handleVideoPlay}>
                                    {thumbnailUrl ? (
                                        <img
                                            src={thumbnailUrl}
                                            alt={item.title}
                                            className="w-full h-full object-cover"
                                            onError={(e: React.SyntheticEvent<HTMLImageElement, Event>) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                            loading="lazy"
                                        />
                                    ) : (
                                        <div className="flex flex-col items-center text-gray-500">
                                            <svg className={`${isThumbnail ? 'w-8 h-8 mb-1' : 'w-16 h-16 mb-3'}`} fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                                            </svg>
                                            {!isThumbnail && <span className="text-lg">Video Preview</span>}
                                        </div>
                                    )}
                                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center hover:bg-black/40 transition-colors duration-300">
                                        <motion.div className={`bg-white/90 rounded-full ${playButtonPadding} hover:bg-white transition-colors duration-200`} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
                                            <svg className={`${playButtonSize} text-gray-800`} fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                                            </svg>
                                        </motion.div>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                        {isVideoStarted && (
                            <div className="pointer-events-none absolute inset-0 flex items-start justify-end p-3">
                                <div className={`bg-black/50 text-white rounded px-3 py-2 ${isThumbnail ? 'text-xs' : 'text-sm'} backdrop-blur-sm`}>
                                    {isHovered ? 'Audio On' : 'Audio Off'}
                                </div>
                            </div>
                        )}
                        </div>
                );
            }

            case 'image':
                return (
                    <div className="relative">
                        <motion.div animate={{ scale: isHovered ? 1.1 : 1, rotateY: isHovered ? 5 : 0 }} transition={{ duration: 0.3 }} className="relative rounded-lg overflow-hidden shadow-lg">
                            <img src={item.mediaUrl} alt={item.title} className={`w-full ${size === 'thumbnail' ? 'h-16' : 'h-72'} object-cover`} loading="lazy" />
                            {isHovered && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />}
                        </motion.div>
                        {isHovered && size === 'full' && (
                            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="absolute bottom-3 left-3 right-3 text-white">
                                <div className="bg-black/50 rounded px-3 py-2">
                                    <p className="text-base font-medium truncate">{item.title}</p>
                                </div>
                            </motion.div>
                        )}
                    </div>
                );

            default:
                return (
                    <div className="w-48 h-48 bg-gray-200 rounded-lg flex items-center justify-center">
                        <svg className="w-24 h-24 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4V2a1 1 0 011-1h8a1 1 0 011 1v2m0 0V1a1 1 0 011-1h2a1 1 0 011 1v18a1 1 0 01-1 1h-2a1 1 0 01-1-1V3M7 4H5a1 1 0 00-1 1v18a1 1 0 001 1h2a1 1 0 001-1V5a1 1 0 00-1-1z" />
                        </svg>
                    </div>
                );
        }
    };

    return (
        <div className={`flex items-center justify-center ${className}`} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
            {renderMediaContent()}
        </div>
    );
};

export default MediaPreview;
