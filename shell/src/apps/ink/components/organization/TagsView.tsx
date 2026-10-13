import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../store';
import { downloadFile } from '../../lib/notes';
import { useNow } from '../../lib/useNow';
import { Folder, Pencil, Trash2, Download, Plus, Inbox, Tag } from 'lucide-react';

export const TagsView: React.FC = () => {
  const { notes, folders, addFolder, renameFolder, deleteFolder, renameTag, removeTag, addNote, setNoteTags, setActiveFolder, activeNoteId, setNotice } = useStore();
  const [dialog, setDialog] = useState<{ type: 'folder' | 'tag' | 'rename' | 'renameFolder'; tag?: string; folder?: string } | null>(null);
  const [dialogValue, setDialogValue] = useState('');
  const now = useNow();
  const navigate = useNavigate();

  const live = notes.filter(n => !n.trashedAt);
  const tags = Array.from(new Set(live.flatMap(note => note.tags))).sort((left, right) =>
    live.reduce((count, note) => count + Number(note.tags.includes(right)), 0) -
    live.reduce((count, note) => count + Number(note.tags.includes(left)), 0)
  );
  const untagged = live.filter(n => n.tags.length === 0).length;
  const unfiled = live.filter(n => n.folder === 'Unfiled').length;

  const openDialog = (type: 'folder' | 'tag' | 'rename' | 'renameFolder', value?: string) => {
    setDialog({ type, tag: type === 'rename' ? value : undefined, folder: type === 'renameFolder' ? value : undefined });
    setDialogValue(value ?? '');
  };

  const submitDialog = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = dialogValue.trim();
    if (!dialog || !value) return;
    const folderTaken = folders.some(folder => folder.name.toLowerCase() === value.toLowerCase());
    if (dialog.type === 'folder') {
      if (folderTaken) setNotice({ message: `A folder named “${value}” is already on the shelf` });
      else addFolder(value);
    } else if (dialog.type === 'renameFolder' && dialog.folder) {
      if (folderTaken && value.toLowerCase() !== dialog.folder.toLowerCase()) {
        setNotice({ message: `A folder named “${value}” is already on the shelf` });
      } else {
        renameFolder(dialog.folder, value);
      }
    } else {
      const tag = value.replace(/^#/, '').toUpperCase();
      if (!tag) return;
      if (tags.includes(tag)) {
        setNotice({ message: `#${tag.toLowerCase()} is already in the catalog` });
      } else if (dialog.type === 'rename' && dialog.tag) {
        renameTag(dialog.tag, tag);
      } else {
        // Tags live on notes — a fresh tag starts on the page you're working on.
        const target = live.find(n => n.id === activeNoteId);
        if (target) {
          setNoteTags(target.id, [...target.tags, tag]);
          setNotice({ message: `#${tag.toLowerCase()} added to “${target.title || 'Untitled'}”` });
        } else {
          addNote({ title: '', tags: [tag] });
          setNotice({ message: `#${tag.toLowerCase()} started on a new page` });
        }
      }
    }
    setDialog(null);
  };

  const exportNotes = () => {
    downloadFile('ink-library.json', JSON.stringify(live, null, 2), 'application/json');
  };

  const dialogTitle = {
    folder: 'New folder',
    renameFolder: `Rename “${dialog?.folder}”`,
    tag: 'New tag',
    rename: `Rename #${(dialog?.tag ?? '').toLowerCase()}`,
  }[dialog?.type ?? 'folder'];

  return (
    <div className="flex-1 overflow-y-auto bg-desk custom-scrollbar">
      <div className="max-w-5xl mx-auto px-6 md:px-10 py-10 md:py-14 pb-28">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
          <div>
            <h1 className="font-serif text-3xl font-semibold text-ink tracking-tight">The card catalog</h1>
            <p className="text-sm text-ink-faint mt-1.5 max-w-md">
              Tags and folders — the indexing system of the library. Rename carefully; books remember.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportNotes}
              className="flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium text-ink border border-line rounded bg-paper hover:bg-paper-dim transition-colors"
            >
              <Download className="w-3.5 h-3.5" strokeWidth={1.75} />
              Export library
            </button>
            <button
              onClick={() => openDialog('folder')}
              className="flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium text-paper bg-ink rounded hover:bg-ink-soft transition-colors"
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={2} />
              New folder
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          {/* Tags */}
          <section className="lg:col-span-7">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-serif text-lg font-semibold text-ink">Tags</h2>
              <button
                onClick={() => openDialog('tag')}
                className="text-[13px] font-medium text-pencil hover:text-pencil-deep transition-colors"
              >
                New tag
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-6">
              <Stat label="In use" value={String(tags.length)} />
              <Stat label="Most used" value={tags[0] ? `#${tags[0].toLowerCase()}` : '—'} small />
              <Stat label="Untagged" value={String(untagged)} />
              <Stat label="Written this week" value={String(live.filter(n => now - n.createdAt < 7 * 24 * 60 * 60 * 1000).length)} />
            </div>

            <div className="bg-paper border border-line rounded overflow-hidden">
              {tags.length === 0 && (
                <p className="p-6 text-sm text-ink-faint font-serif">No tags yet. Mark a note with one and it will be catalogued here.</p>
              )}
              <div className="divide-y divide-line">
                {tags.map(tag => {
                  const count = live.filter(note => note.tags.includes(tag)).length;
                  return (
                    <div key={tag} className="group flex items-center justify-between px-4 py-3 hover:bg-paper-dim/60 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <Tag className="w-3.5 h-3.5 text-fountain flex-shrink-0" strokeWidth={1.75} />
                        <span className="font-mono text-sm text-ink truncate">#{tag.toLowerCase()}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="font-mono text-2xs text-ink-ghost tabular-nums">{count} {count === 1 ? 'note' : 'notes'}</span>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 max-md:opacity-100 transition-opacity">
                          <button
                            aria-label={`Rename ${tag}`}
                            onClick={() => openDialog('rename', tag)}
                            className="w-7 h-7 flex items-center justify-center rounded text-ink-ghost hover:text-ink hover:bg-paper-edge transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" strokeWidth={1.75} />
                          </button>
                          <button
                            aria-label={`Delete ${tag}`}
                            onClick={() => { if (window.confirm(`Remove #${tag.toLowerCase()} from every note?`)) removeTag(tag); }}
                            className="w-7 h-7 flex items-center justify-center rounded text-ink-ghost hover:text-pencil hover:bg-pencil-wash transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Folders + collections */}
          <section className="lg:col-span-5 space-y-8">
            <div>
              <h2 className="font-serif text-lg font-semibold text-ink mb-3">Folders</h2>
              <div className="bg-paper border border-line rounded divide-y divide-line overflow-hidden">
                {folders.length === 0 && (
                  <p className="p-6 text-sm text-ink-faint font-serif">No folders. Notes pile up in the drawer until you make one.</p>
                )}
                {folders.map(folder => {
                  const count = live.filter(note => note.folder === folder.name).length;
                  return (
                    <div key={folder.id} className="group flex items-center justify-between px-4 py-3 hover:bg-paper-dim/60 transition-colors">
                      <button
                        onClick={() => { setActiveFolder(folder.name); navigate('/'); }}
                        className="flex items-center gap-3 min-w-0 text-left"
                      >
                        <Folder className="w-4 h-4 text-manila flex-shrink-0" strokeWidth={1.75} />
                        <span className="text-sm font-medium text-ink truncate">{folder.name}</span>
                      </button>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="font-mono text-2xs text-ink-ghost tabular-nums">{count}</span>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 max-md:opacity-100 transition-opacity">
                          <button
                            aria-label={`Rename ${folder.name}`}
                            onClick={() => openDialog('renameFolder', folder.name)}
                            className="w-7 h-7 flex items-center justify-center rounded text-ink-ghost hover:text-ink hover:bg-paper-edge transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" strokeWidth={1.75} />
                          </button>
                          <button
                            aria-label={`Delete ${folder.name}`}
                            onClick={() => { if (window.confirm(`Delete the “${folder.name}” folder? Its ${count} ${count === 1 ? 'note' : 'notes'} move to Unfiled.`)) deleteFolder(folder.name); }}
                            className="w-7 h-7 flex items-center justify-center rounded text-ink-ghost hover:text-pencil hover:bg-pencil-wash transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <h2 className="font-serif text-lg font-semibold text-ink mb-3">Collections</h2>
              <div className="space-y-2">
                <Collection
                  icon={<Inbox className="w-4 h-4 text-ink-faint" strokeWidth={1.75} />}
                  name="Unfiled"
                  count={unfiled}
                  onClick={() => { setActiveFolder('Unfiled'); navigate('/'); }}
                />
                <Collection
                  icon={<Tag className="w-4 h-4 text-ink-faint" strokeWidth={1.75} />}
                  name="Untagged"
                  count={untagged}
                  onClick={() => { setActiveFolder('Untagged'); navigate('/'); }}
                />
              </div>
              <p className="text-2xs text-ink-ghost mt-3 leading-relaxed">
                Collections are live queries, not folders — they update themselves as notes change.
              </p>
            </div>
          </section>
        </div>
      </div>

      {dialog && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/25 p-4"
          onMouseDown={event => { if (event.target === event.currentTarget) setDialog(null); }}
        >
          <form
            onSubmit={submitDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="catalog-dialog-title"
            className="w-full max-w-sm bg-paper border border-line rounded-md p-5 shadow-pop"
          >
            <h3 id="catalog-dialog-title" className="font-serif text-lg font-semibold text-ink mb-3">{dialogTitle}</h3>
            <input
              autoFocus
              required
              value={dialogValue}
              onChange={event => setDialogValue(event.target.value)}
              placeholder={dialog.type === 'folder' || dialog.type === 'renameFolder' ? 'Folder name' : 'tag-name'}
              aria-label="Name"
              className="w-full rounded-sm border-line bg-paper px-3 py-2 text-sm text-ink focus:border-fountain focus:ring-0"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDialog(null)}
                className="rounded-sm px-3.5 py-1.5 text-[13px] font-medium text-ink-faint hover:bg-paper-dim transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-sm bg-ink px-3.5 py-1.5 text-[13px] font-medium text-paper hover:bg-ink-soft transition-colors"
              >
                Save
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

const Stat = ({ label, value, small }: { label: string; value: string; small?: boolean }) => (
  <div className="bg-paper border border-line rounded px-3.5 py-3">
    <p className="text-2xs font-medium text-ink-ghost mb-1">{label}</p>
    <p className={`font-serif font-semibold text-ink truncate ${small ? 'text-base' : 'text-2xl'}`}>{value}</p>
  </div>
);

const Collection = ({ icon, name, count, onClick }: { icon: React.ReactNode; name: string; count: number; onClick: () => void }) => (
  <button
    onClick={onClick}
    className="w-full flex items-center justify-between gap-4 bg-paper border border-line rounded px-4 py-3 hover:border-line-strong transition-colors"
  >
    <span className="flex items-center gap-3 min-w-0">
      {icon}
      <span className="text-sm font-medium text-ink truncate">{name}</span>
    </span>
    <span className="font-mono text-2xs text-ink-ghost tabular-nums flex-shrink-0">{count} notes</span>
  </button>
);
