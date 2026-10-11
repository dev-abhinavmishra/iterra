import React, { useEffect, useRef, useState } from 'react';
import { Note } from '../../types';
import { IconBtn } from '../ui/primitives';

interface AudioPlayerProps {
    note: Note;
}

const SPEEDS = [1, 1.25, 1.5, 2];

const fmtTime = (s: number) => {
    if (!isFinite(s) || s < 0) s = 0;
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    return h > 0
        ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
        : `${m}:${String(sec).padStart(2, '0')}`;
};

const AudioPlayer: React.FC<AudioPlayerProps> = ({ note }) => {
    const audioRef = useRef<HTMLAudioElement>(null);
    const trackRef = useRef<HTMLDivElement>(null);
    const [url, setUrl] = useState<string | null>(null);
    const [playing, setPlaying] = useState(false);
    const [current, setCurrent] = useState(0);
    const [duration, setDuration] = useState(0);
    const [speedIdx, setSpeedIdx] = useState(0);

    // Build a blob URL from the stored base64 source.
    useEffect(() => {
        if (!note.sourceData?.mimeType.startsWith('audio/')) return;
        let objectUrl: string | null = null;
        try {
            const bin = atob(note.sourceData.data);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            objectUrl = URL.createObjectURL(new Blob([bytes], { type: note.sourceData.mimeType }));
            setUrl(objectUrl);
        } catch (e) {
            console.error('Failed to build audio blob URL', e);
        }
        return () => {
            if (objectUrl) URL.revokeObjectURL(objectUrl);
            setUrl(null);
            setPlaying(false);
        };
    }, [note.id, note.sourceData]);

    const seekTo = (seconds: number) => {
        const el = audioRef.current;
        if (!el) return;
        el.currentTime = seconds;
        setCurrent(seconds);
    };

    const onTrackClick = (e: React.MouseEvent) => {
        const track = trackRef.current;
        const el = audioRef.current;
        if (!track || !el || !duration) return;
        const rect = track.getBoundingClientRect();
        const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
        seekTo(ratio * duration);
    };

    const cycleSpeed = () => {
        const next = (speedIdx + 1) % SPEEDS.length;
        setSpeedIdx(next);
        if (audioRef.current) audioRef.current.playbackRate = SPEEDS[next];
    };

    if (!note.sourceData?.mimeType.startsWith('audio/')) return null;

    const progress = duration ? (current / duration) * 100 : 0;
    const pins = (note.pinnedMoments || []).filter(p => p.seconds >= 0 && (!duration || p.seconds <= duration));

    return (
        <div className="mb-5 bg-card border border-line rounded-[var(--r-lg)] shadow-card px-3.5 py-2.5 flex items-center gap-3">
            <audio
                ref={audioRef}
                src={url || undefined}
                preload="metadata"
                onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
                onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
                onEnded={() => setPlaying(false)}
                onPause={() => setPlaying(false)}
                onPlay={() => setPlaying(true)}
            />
            <IconBtn
                icon={playing ? 'pause' : 'play_arrow'}
                size={20}
                active={playing}
                title={playing ? 'Pause' : 'Play'}
                onClick={() => {
                    const el = audioRef.current;
                    if (!el) return;
                    if (playing) el.pause(); else el.play().catch(() => {});
                }}
            />
            <span className="font-mono text-[11px] text-ink-3 tabular-nums shrink-0 select-none">
                {fmtTime(current)} <span className="text-ink-3/60">/ {duration ? fmtTime(duration) : '--:--'}</span>
            </span>
            <div
                ref={trackRef}
                className="relative flex-1 h-6 cursor-pointer group"
                onClick={onTrackClick}
                role="slider"
                aria-label="Seek"
                aria-valuenow={Math.round(current)}
                aria-valuemax={Math.round(duration)}
            >
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[5px] rounded-full bg-card-2 border border-line overflow-hidden">
                    <div className="h-full bg-[var(--mark)]" style={{ width: `${progress}%` }} />
                </div>
                {pins.map((p, i) => (
                    <button
                        key={i}
                        type="button"
                        title={`Pinned — ${p.time}`}
                        onClick={(e) => { e.stopPropagation(); seekTo(p.seconds); }}
                        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-[3px] h-[11px] rounded-full bg-[var(--mark)] hover:h-[14px] transition-all"
                        style={{ left: `${duration ? (p.seconds / duration) * 100 : 0}%` }}
                    />
                ))}
            </div>
            <button
                type="button"
                onClick={cycleSpeed}
                title="Playback speed"
                className="h-7 px-2 rounded-[var(--r)] font-mono text-[11px] text-ink-2 hover:bg-[var(--card-2)] transition-colors shrink-0"
            >
                {SPEEDS[speedIdx]}×
            </button>
        </div>
    );
};

export default AudioPlayer;
