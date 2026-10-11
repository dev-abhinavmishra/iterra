import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Note, PinnedMoment } from '../types';
import AudioVisualizer from '../components/AudioVisualizer';
import { generateNoteFromTranscript, generateTitle, transcribeAudio, blobToBase64 } from '../services/aiService';
import { Btn, Icon, IconBtn, Select, Modal } from '../components/ui/primitives';

interface RecorderViewProps {
    onSaveSession: (note: Note) => void;
    onCancel: () => void;
    autoGenerateTitles: boolean;
    micDeviceId?: string;
    onSelectMic?: (deviceId: string) => void;
}

const formatTime = (totalSeconds: number) => {
    const s = Math.max(0, Math.floor(totalSeconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
};

const RecorderView: React.FC<RecorderViewProps> = ({ onSaveSession, onCancel, autoGenerateTitles, micDeviceId, onSelectMic }) => {
    const [recorderState, setRecorderState] = useState<'idle' | 'recording' | 'paused'>('idle');
    const [isProcessing, setIsProcessing] = useState(false);
    const [processingStage, setProcessingStage] = useState<'transcribing' | 'structuring'>('transcribing');
    const [elapsedMs, setElapsedMs] = useState(0);
    const [pinnedItems, setPinnedItems] = useState<PinnedMoment[]>([]);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [confirmDiscard, setConfirmDiscard] = useState(false);
    // Recording kept when transcription fails — a transient API error must
    // never throw away audio the user already captured.
    const [failedAudio, setFailedAudio] = useState<{ blob: Blob; mimeType: string } | null>(null);

    // Microphone picker
    const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
    const [selectedMic, setSelectedMic] = useState<string>(micDeviceId || '');

    // Audio refs
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const recorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);

    // Elapsed time: accumulated active ms + running stamp (excludes paused time)
    const accMsRef = useRef(0);
    const stampRef = useRef(0);

    /* ---- Microphone enumeration ---- */
    const refreshMics = async () => {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            setMics(devices.filter(d => d.kind === 'audioinput'));
        } catch { /* labels need permission; ignore */ }
    };

    useEffect(() => {
        refreshMics();
        const onChange = () => refreshMics();
        navigator.mediaDevices?.addEventListener?.('devicechange', onChange);
        return () => navigator.mediaDevices?.removeEventListener?.('devicechange', onChange);
    }, []);

    // Honor a changed micDeviceId prop while idle
    useEffect(() => {
        if (recorderState === 'idle') setSelectedMic(micDeviceId || '');
    }, [micDeviceId, recorderState]);

    /* ---- Elapsed ticker (excludes paused time) ---- */
    useEffect(() => {
        if (recorderState === 'idle') return;
        const iv = setInterval(() => {
            const running = recorderState === 'recording' ? Date.now() - stampRef.current : 0;
            setElapsedMs(accMsRef.current + running);
        }, 200);
        return () => clearInterval(iv);
    }, [recorderState]);

    // Cleanup on unmount
    useEffect(() => {
        return () => cleanupAudio();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const cleanupAudio = () => {
        try {
            if (recorderRef.current && recorderRef.current.state !== 'inactive') {
                recorderRef.current.stop();
            }
        } catch { /* ignore */ }
        if (sourceRef.current) { sourceRef.current.disconnect(); sourceRef.current = null; }
        if (audioContextRef.current) { audioContextRef.current.close().catch(() => {}); audioContextRef.current = null; }
        if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
        analyserRef.current = null;
        recorderRef.current = null;
    };

    const startRecording = async () => {
        setErrorMessage(null);
        setElapsedMs(0);
        accMsRef.current = 0;
        setPinnedItems([]);
        chunksRef.current = [];

        try {
            if (!navigator.mediaDevices?.getUserMedia) {
                setErrorMessage('Recording needs a secure context — open the app over HTTPS or localhost.');
                return;
            }
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    ...(selectedMic ? { deviceId: { exact: selectedMic } } : {}),
                }
            });
            streamRef.current = stream;
            refreshMics(); // now that permission is granted, labels resolve

            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
            sourceRef.current = audioContextRef.current.createMediaStreamSource(stream);
            const analyser = audioContextRef.current.createAnalyser();
            analyser.fftSize = 512;
            analyser.smoothingTimeConstant = 0.8;
            sourceRef.current.connect(analyser);
            analyserRef.current = analyser;

            const mimeCandidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
            const mimeType = mimeCandidates.find(m => (window as any).MediaRecorder?.isTypeSupported?.(m)) || '';

            const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
            recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
            recorder.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || 'audio/webm' });
                handleTranscription(blob, recorder.mimeType || mimeType || 'audio/webm');
            };
            recorder.start(1000);
            recorderRef.current = recorder;

            stampRef.current = Date.now();
            setRecorderState('recording');
        } catch (err: any) {
            console.error('Failed to start recording:', err);
            setErrorMessage(err?.name === 'NotAllowedError'
                ? 'Microphone access was denied. Allow microphone permission and try again.'
                : (err.message || 'Could not start recording.'));
            cleanupAudio();
        }
    };

    const pauseRecording = () => {
        if (recorderRef.current?.state === 'recording') {
            try { recorderRef.current.pause(); } catch { /* unsupported */ }
        }
        accMsRef.current += Date.now() - stampRef.current;
        setRecorderState('paused');
    };

    const resumeRecording = () => {
        if (recorderRef.current?.state === 'paused') {
            try { recorderRef.current.resume(); } catch { /* unsupported */ }
        }
        stampRef.current = Date.now();
        setRecorderState('recording');
    };

    const stopRecording = () => {
        // Finalize elapsed before the recorder tears down
        if (recorderState === 'recording') {
            accMsRef.current += Date.now() - stampRef.current;
        }
        setElapsedMs(accMsRef.current);
        setRecorderState('idle');
        if (recorderRef.current && recorderRef.current.state !== 'inactive') {
            recorderRef.current.stop(); // onstop -> handleTranscription
        }
        if (sourceRef.current) { sourceRef.current.disconnect(); sourceRef.current = null; }
        if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    };

    const handleTranscription = async (blob: Blob, mimeType: string) => {
        if (audioContextRef.current) { audioContextRef.current.close().catch(() => {}); audioContextRef.current = null; }
        analyserRef.current = null;

        if (blob.size < 1000) {
            setErrorMessage('No audio was captured. Try recording again.');
            return;
        }

        setIsProcessing(true);
        setProcessingStage('transcribing');

        try {
            const base64 = await blobToBase64(blob);
            const ext = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('ogg') ? 'ogg' : 'webm';
            const transcript = await transcribeAudio(base64, mimeType, `recording.${ext}`);

            if (!transcript || !transcript.trim()) {
                setIsProcessing(false);
                setFailedAudio({ blob, mimeType });
                setErrorMessage('Could not detect any speech in the recording.');
                return;
            }

            setProcessingStage('structuring');

            let title = `Recording ${new Date().toLocaleDateString()}`;
            if (autoGenerateTitles && transcript.length > 20) {
                title = await generateTitle(transcript);
            }

            let finalSource = transcript;
            if (pinnedItems.length > 0) {
                finalSource += '\n\nPinned moments at: ' + pinnedItems.map(p => p.time).join(', ');
            }

            const generatedContent = await generateNoteFromTranscript(finalSource, title);

            const newNote: Note = {
                id: Date.now().toString(),
                title,
                date: new Date().toLocaleString(),
                duration: formatTime(elapsedMs / 1000),
                content: generatedContent,
                transcript,
                type: 'AUDIO',
                tags: ['Recording'],
                pinnedMoments: pinnedItems.length > 0 ? pinnedItems : undefined,
                sourceData: { mimeType, data: base64 },
            };

            setIsProcessing(false);
            setFailedAudio(null);
            onSaveSession(newNote);
        } catch (err: any) {
            console.error('Transcription/synthesis failed:', err);
            setIsProcessing(false);
            setFailedAudio({ blob, mimeType });
            setErrorMessage(err.message || 'Failed to process the recording. Try again.');
        }
    };

    const retryTranscription = () => {
        const audio = failedAudio;
        setFailedAudio(null);
        setErrorMessage(null);
        if (audio) handleTranscription(audio.blob, audio.mimeType);
    };

    /* Save the recording verbatim when transcription is unavailable — the
       audio stays playable from the note instead of being discarded. */
    const saveAudioOnly = async () => {
        const audio = failedAudio;
        if (!audio) return;
        try {
            const base64 = await blobToBase64(audio.blob);
            const newNote: Note = {
                id: Date.now().toString(),
                title: `Recording ${new Date().toLocaleDateString()}`,
                date: new Date().toLocaleString(),
                duration: formatTime(elapsedMs / 1000),
                content: '<p>Audio recording — transcription was unavailable when this was saved.</p>',
                transcript: '',
                type: 'AUDIO',
                tags: ['Recording'],
                pinnedMoments: pinnedItems.length > 0 ? pinnedItems : undefined,
                sourceData: { mimeType: audio.mimeType, data: base64 },
            };
            setFailedAudio(null);
            setErrorMessage(null);
            onSaveSession(newNote);
        } catch (err) {
            console.error('Failed to save audio note:', err);
            setErrorMessage('Could not save the recording. Try again.');
        }
    };

    const handlePin = () => {
        const seconds = elapsedMs / 1000;
        setPinnedItems(prev => [...prev, { time: formatTime(seconds), seconds: Math.floor(seconds) }]);
    };

    const removePin = (idx: number) => {
        setPinnedItems(prev => prev.filter((_, i) => i !== idx));
    };

    const handleCancel = () => {
        if (recorderState !== 'idle' || failedAudio) {
            setConfirmDiscard(true);
        } else {
            onCancel();
        }
    };

    const discardAndExit = () => {
        setConfirmDiscard(false);
        cleanupAudio();
        onCancel();
    };

    const elapsedSeconds = Math.floor(elapsedMs / 1000);
    const micName = (id: string) => {
        const idx = mics.findIndex(m => m.deviceId === id);
        if (idx >= 0) return mics[idx].label || `Microphone ${idx + 1}`;
        return 'System default';
    };

    /* ---- Processing state: staged mono status ---- */
    if (isProcessing) {
        const stages = [
            { key: 'transcribing', label: 'transcribing audio' },
            { key: 'structuring', label: 'structuring note' },
        ];
        const activeIdx = processingStage === 'transcribing' ? 0 : 1;
        return (
            <main className="flex-1 flex flex-col min-w-0 relative bg-paper">
                <div className="flex-1 flex items-center justify-center page-lines">
                    <div className="bg-card border border-line rounded-[var(--r-lg)] shadow-card px-8 py-7 w-72">
                        <p className="font-mono text-[10px] text-ink-3 mb-4">{formatTime(elapsedSeconds)} recorded</p>
                        <div className="space-y-3">
                            {stages.map((s, i) => {
                                const done = i < activeIdx;
                                const active = i === activeIdx;
                                return (
                                    <div key={s.key} className="flex items-center gap-3">
                                        <span className={`font-mono text-[10px] w-4 ${done ? 'text-ok' : active ? 'text-mark' : 'text-ink-3'}`}>
                                            {done ? '✓' : `0${i + 1}`}
                                        </span>
                                        <span className={`font-mono text-xs ${done ? 'text-ink-3' : active ? 'text-ink' : 'text-ink-3'}`}>
                                            {s.label}
                                        </span>
                                        {active && <span className="cursor-blink text-mark font-mono text-xs">▍</span>}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </main>
        );
    }

    return (
        <main className="flex-1 flex flex-col min-w-0 relative bg-paper">
            {/* Header */}
            <header className="shrink-0 h-14 border-b border-line flex items-center justify-between px-4 md:px-6 gap-3">
                <h1 className="font-serif text-xl text-ink ink-write ink-underline">Record</h1>

                <div className="flex items-center gap-2 min-w-0">
                    <Icon name="mic" size={16} className="text-ink-3 hidden sm:block" />
                    <Select
                        value={selectedMic}
                        onChange={e => { setSelectedMic(e.target.value); onSelectMic?.(e.target.value); }}
                        disabled={recorderState !== 'idle'}
                        title={recorderState !== 'idle' ? 'Microphone is locked while recording' : 'Microphone'}
                        className="h-8 max-w-[180px] sm:max-w-[220px] text-xs truncate"
                        aria-label="Microphone"
                    >
                        <option value="">System default</option>
                        {mics.map((m, i) => (
                            <option key={m.deviceId || i} value={m.deviceId}>
                                {m.label || `Microphone ${i + 1}`}
                            </option>
                        ))}
                    </Select>
                    <IconBtn icon="close" title="Close recorder" onClick={handleCancel} />
                </div>
            </header>

            {errorMessage && (
                <div className="shrink-0 border-b border-[var(--bad)]/30 bg-[var(--bad)]/10 px-4 py-2 flex items-center justify-center gap-3 text-sm text-bad">
                    <Icon name="error" size={16} />
                    <span>{errorMessage}</span>
                    {failedAudio && (
                        <span className="flex items-center gap-2">
                            <Btn size="sm" variant="quiet" onClick={retryTranscription}>Retry</Btn>
                            <Btn size="sm" variant="quiet" icon="save" onClick={saveAudioOnly}>Save audio</Btn>
                        </span>
                    )}
                </div>
            )}

            <div className="flex-1 flex min-h-0">
                {/* Recording stage */}
                <section className="flex-1 flex flex-col min-w-0 relative">
                    <div className="flex-1 page-lines flex flex-col items-center justify-center px-6 py-8">
                        {/* Timecode */}
                        <div className="font-mono text-5xl md:text-6xl text-ink tabular-nums tracking-tight">
                            {formatTime(elapsedSeconds)}
                        </div>
                        <div className="font-mono text-[11px] text-ink-3 mt-3">
                            {recorderState === 'recording' && `recording · ${micName(selectedMic)}`}
                            {recorderState === 'paused' && 'paused'}
                            {recorderState === 'idle' && (elapsedMs > 0 ? 'stopped' : micName(selectedMic))}
                        </div>

                        {/* Controls */}
                        <div className="flex items-center gap-5 mt-10">
                            {recorderState !== 'idle' && (
                                <div className="flex flex-col items-center gap-1.5 w-16">
                                    <IconBtn
                                        onClick={recorderState === 'recording' ? pauseRecording : resumeRecording}
                                        icon={recorderState === 'recording' ? 'pause' : 'play_arrow'}
                                        size={20}
                                        className="!w-11 !h-11 rounded-full border border-[var(--line-2)] bg-[var(--card)] shadow-card text-ink-2 hover:text-ink"
                                        title={recorderState === 'recording' ? 'Pause' : 'Resume'}
                                    />
                                    <span className="font-mono text-[10px] text-ink-3">
                                        {recorderState === 'recording' ? 'pause' : 'resume'}
                                    </span>
                                </div>
                            )}

                            {/* Round record / stop button with pulsing mark ring */}
                            <div className="relative flex items-center justify-center">
                                {recorderState === 'recording' && (
                                    <motion.span
                                        className="absolute inset-0 rounded-full border-2 border-[var(--mark)]"
                                        animate={{ scale: [1, 1.35], opacity: [0.6, 0] }}
                                        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
                                    />
                                )}
                                <button
                                    onClick={recorderState === 'idle' ? startRecording : stopRecording}
                                    title={recorderState === 'idle' ? 'Start recording' : 'Stop and finish'}
                                    className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all duration-150 active:scale-95 shadow-lift
                                        ${recorderState === 'idle'
                                            ? 'bg-[var(--mark)] text-[var(--mark-ink)] hover:brightness-110'
                                            : 'bg-card border-2 border-[var(--mark)] text-mark hover:bg-[var(--mark-soft)]'}`}
                                >
                                    <Icon name={recorderState === 'idle' ? 'mic' : 'stop'} size={30} fill={recorderState === 'idle'} />
                                </button>
                            </div>

                            {recorderState !== 'idle' && (
                                <div className="flex flex-col items-center gap-1.5 w-16">
                                    <IconBtn
                                        onClick={handlePin}
                                        icon="push_pin"
                                        size={20}
                                        className="!w-11 !h-11 rounded-full border border-[var(--line-2)] bg-[var(--card)] shadow-card text-ink-2 hover:text-ink"
                                        title="Pin this moment"
                                    />
                                    <span className="font-mono text-[10px] text-ink-3">pin</span>
                                </div>
                            )}
                        </div>

                        <div className="font-mono text-[10px] text-ink-3 mt-8">
                            {recorderState === 'idle'
                                ? 'Start to capture a lecture, meeting, or voice memo.'
                                : 'Stop to transcribe and structure the session.'}
                        </div>
                    </div>

                    {/* Pinned chips on small screens */}
                    {pinnedItems.length > 0 && (
                        <div className="lg:hidden shrink-0 border-t border-line px-4 py-2 flex items-center gap-2 overflow-x-auto custom-scrollbar">
                            <Icon name="push_pin" size={14} className="text-ink-3 shrink-0" />
                            {pinnedItems.map((p, i) => (
                                <span key={i} className="shrink-0 inline-flex items-center gap-1.5 px-2 py-1 rounded-[var(--r)] border border-line-2 bg-card font-mono text-[11px] text-ink-2">
                                    {p.time}
                                    <button onClick={() => removePin(i)} className="text-ink-3 hover:text-bad" title="Remove pin">
                                        <Icon name="close" size={12} />
                                    </button>
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Visualizer strip */}
                    <div className="shrink-0 h-24 border-t border-line bg-card px-4 md:px-6 py-3">
                        <AudioVisualizer isActive={recorderState === 'recording'} analyser={analyserRef.current} />
                    </div>
                </section>

                {/* Pinned moments rail */}
                <aside className="hidden lg:flex w-72 shrink-0 border-l border-line bg-card flex-col">
                    <div className="h-12 flex items-center justify-between px-4 border-b border-line">
                        <span className="text-[13px] font-medium text-ink">Pinned moments</span>
                        <span className="font-mono text-[10px] text-ink-3">{pinnedItems.length}</span>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
                        {pinnedItems.length === 0 ? (
                            <p className="text-xs text-ink-3 px-1 py-6 leading-relaxed">
                                Pin moments while recording to mark timestamps worth revisiting.
                            </p>
                        ) : (
                            <AnimatePresence initial={false}>
                                {pinnedItems.map((item, idx) => (
                                    <motion.div
                                        key={`${item.seconds}-${idx}`}
                                        initial={{ opacity: 0, x: 8 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 8 }}
                                        transition={{ duration: 0.15 }}
                                        className="group flex items-center gap-2.5 px-3 py-2.5 rounded-[var(--r)] border border-line bg-card-2/60"
                                    >
                                        <Icon name="push_pin" size={14} className="text-mark" />
                                        <span className="font-mono text-xs text-ink">{item.time}</span>
                                        <button
                                            onClick={() => removePin(idx)}
                                            className="ml-auto opacity-0 group-hover:opacity-100 text-ink-3 hover:text-bad transition-opacity"
                                            title="Remove pin"
                                        >
                                            <Icon name="close" size={14} />
                                        </button>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        )}
                    </div>
                </aside>
            </div>

            {/* Discard confirmation */}
            <Modal open={confirmDiscard} onClose={() => setConfirmDiscard(false)}>
                <div className="p-5">
                    <h3 className="font-serif text-lg text-ink">Discard this recording?</h3>
                    <p className="text-sm text-ink-2 mt-2 leading-relaxed">
                        The audio captured so far will be thrown away.
                    </p>
                    <div className="flex justify-end gap-2 mt-5">
                        <Btn onClick={() => setConfirmDiscard(false)}>Keep recording</Btn>
                        <Btn variant="danger" onClick={discardAndExit}>Discard</Btn>
                    </div>
                </div>
            </Modal>
        </main>
    );
};

export default RecorderView;
