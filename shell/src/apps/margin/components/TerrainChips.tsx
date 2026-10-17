/* iterra bridges for the open note (docs/ADAPTER.md):
   'in deck · N' — links.for(margin:note:<id>).out to flashcards entities,
   resolved to the deck url; 'open in ink' — a note.create intake carrying
   the page text, then navigate to the returned deep link.
   Guarded — standalone (no window.iterra) renders nothing. */
import React, { useEffect, useState } from 'react';
import type { Note } from '../types';

const iterra = () => (window as unknown as { iterra?: any }).iterra;

const chipCls = `hidden sm:inline-flex items-center gap-1 h-8 px-2 rounded-[var(--r-sm)] font-sans text-[12px] text-ink-3 hover:text-ink hover:bg-[var(--card-2)] transition-colors`;

const TerrainChips: React.FC<{ note: Note; getText: () => string }> = ({ note, getText }) => {
    const [deck, setDeck] = useState<{ n: number; url: string } | null>(null);
    const [sent, setSent] = useState(false);

    /* backlinks: cards/decks that were derived from this note */
    useEffect(() => {
        let live = true;
        setDeck(null);
        setSent(false);
        const it = iterra();
        if (!it?.links?.for || !it?.store?.get) return;
        it.links.for(`margin:note:${note.id}`)
            .then(async (res: any) => {
                const outs = ((res?.out ?? []) as Array<{ to?: string }>).filter((l) =>
                    String(l?.to ?? '').startsWith('flashcards:'),
                );
                if (!live || !outs.length) return;
                let url = '/apps/flashcards/';
                const ent = await it.store.get(outs[0].to).catch(() => null);
                if (ent?.url) url = ent.url;
                if (live) setDeck({ n: outs.length, url });
            })
            .catch(() => {});
        return () => {
            live = false;
        };
    }, [note.id]);

    const openInInk = async () => {
        const it = iterra();
        if (!it?.send) return;
        const res = await it
            .send({
                to: 'ink',
                action: 'note.create',
                entity: { app: 'margin', type: 'note', id: note.id, title: note.title || 'untitled' },
                payload: { text: getText() },
            })
            .catch(() => null);
        if (res && res.ok !== false) {
            setSent(true);
            const url = res.url || '/apps/ink/';
            try {
                it.open ? it.open(url) : window.open(url, '_blank');
            } catch {
                window.open(url, '_blank');
            }
        }
    };

    const it = iterra();
    if (!deck && !it?.send) return null;
    return (
        <>
            {deck && (
                <a
                    href={deck.url}
                    onClick={(e) => {
                        e.preventDefault();
                        try {
                            it?.open ? it.open(deck.url) : window.open(deck.url, '_blank');
                        } catch {
                            window.open(deck.url, '_blank');
                        }
                    }}
                    title={`${deck.n} card${deck.n === 1 ? '' : 's'} from this note live in a deck`}
                    className={chipCls}
                >
                    in deck · {deck.n} →
                </a>
            )}
            {it?.send && (
                <button className={chipCls} onClick={() => void openInInk()} disabled={sent} title="Send this note to a new ink page">
                    {sent ? 'on ink’s desk →' : 'open in ink →'}
                </button>
            )}
        </>
    );
};

export default TerrainChips;
