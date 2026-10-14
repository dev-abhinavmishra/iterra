import React from 'react';
import { View } from '../types';
import { useUsage } from '../services/usageService';
import { Icon, Kbd, ProgressBar } from './ui/primitives';
import { isIntegrated } from '../../theme';

interface SidebarProps {
    currentView: View;
    onChangeView: (view: View) => void;
    onUpgrade: () => void;
    onOpenPalette: () => void;
}

/* Tiny index-card glyph: paper card, vermilion header rule, ruled lines. */
const CardMark: React.FC = () => (
    <svg width="22" height="22" viewBox="0 0 22 22" className="shrink-0" aria-hidden>
        <rect x="1.5" y="2.5" width="19" height="17" rx="2.5" fill="var(--card)" stroke="var(--line-2)" />
        <line x1="1.5" y1="7" x2="20.5" y2="7" stroke="var(--mark)" strokeWidth="1.4" />
        <line x1="5" y1="11" x2="17" y2="11" stroke="var(--line-2)" strokeWidth="1" />
        <line x1="5" y1="14.5" x2="14" y2="14.5" stroke="var(--line-2)" strokeWidth="1" />
    </svg>
);

const ALL_NAV: { view: View; icon: string; label: string }[] = [
    { view: View.LIBRARY, icon: 'note_stack', label: 'Notes' },
    { view: View.RECORDER, icon: 'mic', label: 'Record' },
    { view: View.ANALYSIS, icon: 'forum', label: 'Ask' },
    { view: View.STUDY, icon: 'style', label: 'Study' },
];

/* Integrated: decks+quizzes belong to the Flashcards place — margin's own
   Study view stays reachable via ?deck=/?quiz= deep links but leaves nav. */
const NAV = (window as any).__iterraIntegrated
    ? ALL_NAV.filter(n => n.view !== View.STUDY)
    : ALL_NAV;

/* Library filters and the note editor all live under "Notes". */
const isActive = (nav: View, current: View): boolean =>
    nav === current ||
    (nav === View.LIBRARY && (current === View.BOOKMARKS || current === View.HISTORY || current === View.EDITOR));

const UsageMeter: React.FC<{ onUpgrade: () => void }> = ({ onUpgrade }) => {
    const usage = useUsage();
    const pct = usage.limit > 0 ? Math.min(100, Math.round((usage.used / usage.limit) * 100)) : 0;
    const low = usage.remaining <= 3;
    const empty = usage.remaining <= 0;

    return (
        <>
            {/* Icon rail: just the remaining count. */}
            <button
                onClick={onUpgrade}
                title={`${usage.remaining} of ${usage.limit} free uses left today`}
                className="lg:hidden mx-auto w-9 h-9 flex items-center justify-center rounded-[var(--r)] border border-line-2 bg-card-2 hover:border-[var(--ink-3)] transition-colors"
            >
                <span className={`font-mono text-[11px] ${empty ? 'text-bad' : low ? 'text-warn' : 'text-ink-2'}`}>
                    {usage.remaining}
                </span>
            </button>

            {/* Full rail: labeled meter, opens the limit explainer. */}
            <button
                onClick={onUpgrade}
                title="About the daily limit"
                className="hidden lg:block w-full text-left rounded-[var(--r)] border border-line bg-card-2 px-3 py-2.5 mb-2 hover:border-[var(--ink-3)] transition-colors"
            >
                <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-[10px] text-ink-3">free uses today</span>
                    <span className={`font-mono text-[11px] ${empty ? 'text-bad' : low ? 'text-warn' : 'text-ink-2'}`}>
                        {usage.remaining}/{usage.limit}
                    </span>
                </div>
                <ProgressBar value={pct} />
                <span className="block mt-1.5 font-mono text-[10px] text-ink-3">resets daily</span>
            </button>
        </>
    );
};

const Sidebar: React.FC<SidebarProps> = ({ currentView, onChangeView, onUpgrade, onOpenPalette }) => {
    const navButton = (item: { view: View; icon: string; label: string }) => {
        const active = isActive(item.view, currentView);
        return (
            <button
                key={item.view}
                onClick={() => onChangeView(item.view)}
                title={item.label}
                className={`w-full flex items-center justify-center lg:justify-start gap-2.5 h-9 px-0 lg:px-2.5 rounded-[var(--r)] border text-sm font-sans font-medium transition-colors duration-150
                    ${active
                        ? 'bg-[var(--mark-soft)] text-[var(--mark)] border-[var(--mark)]/40'
                        : 'text-ink-2 border-transparent hover:bg-[var(--card-2)] hover:text-ink'}`}
            >
                <Icon name={item.icon} size={19} fill={active} />
                <span className="hidden lg:block">{item.label}</span>
            </button>
        );
    };

    return (
        <aside className="w-16 lg:w-60 flex flex-col border-r border-line bg-card z-20 shrink-0">
            {/* Wordmark */}
            <div className="h-14 flex items-center justify-center lg:justify-start lg:px-4 border-b border-line shrink-0">
                <div className="flex items-center gap-2.5">
                    <CardMark />
                    <span className="font-hand text-[22px] font-semibold text-ink hidden lg:block -rotate-1">Margin</span>
                </div>
            </div>

            <nav className="flex-1 overflow-y-auto custom-scrollbar px-2 lg:px-3 py-3 flex flex-col gap-0.5">
                {/* Search / command palette */}
                <button
                    onClick={onOpenPalette}
                    title="Search and commands"
                    className="w-full flex items-center justify-center lg:justify-start gap-2.5 h-9 px-0 lg:px-2.5 mb-3 rounded-[var(--r)] border border-line-2 bg-card-2 text-ink-3 hover:border-[var(--ink-3)] hover:text-ink-2 transition-colors duration-150"
                >
                    <Icon name="search" size={18} />
                    <span className="hidden lg:block text-sm font-sans">Search</span>
                    <span className="hidden lg:flex ml-auto items-center gap-0.5"><Kbd>⌘K</Kbd></span>
                </button>

                {NAV.map(navButton)}

                {/* Integrated: review lives in the Flashcards place — the
                    sidebar hands off instead of duplicating decks here. */}
                {isIntegrated() && (
                    <button
                        onClick={() => {
                            try { (window as any).iterra?.open?.('#/p/flashcards'); }
                            catch { window.location.hash = '#/p/flashcards'; }
                        }}
                        title="Flashcards — decks and review live in the Cardfile"
                        className="w-full flex items-center justify-center lg:justify-start gap-2.5 h-9 px-0 lg:px-2.5 rounded-[var(--r)] border border-transparent text-sm font-sans font-medium text-ink-2 hover:bg-[var(--card-2)] hover:text-ink transition-colors duration-150"
                    >
                        <Icon name="style" size={19} />
                        <span className="hidden lg:block">Flashcards</span>
                        <Icon name="arrow_outward" size={14} className="hidden lg:block ml-auto opacity-50" />
                    </button>
                )}
            </nav>

            <div className="border-t border-line p-2 lg:p-3">
                <UsageMeter onUpgrade={onUpgrade} />
                {/* settings live in the terrain's central surface when
                    integrated — still reachable via #/p/margin?settings */}
                {!isIntegrated() && navButton({ view: View.SETTINGS, icon: 'settings', label: 'Settings' })}
            </div>
        </aside>
    );
};

export default Sidebar;
