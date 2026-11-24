import React from 'react';
import { Btn, Chip, Icon, Segmented, Select, TextInput } from '../ui/primitives';
import { CardLayout } from './NoteCard';

export type TypeFilter = 'ALL' | 'AUDIO' | 'PDF' | 'IMAGE' | 'TEXT';
export type SortKey = 'recent' | 'title' | 'oldest';

const TYPE_CHIPS: { value: TypeFilter; label: string }[] = [
    { value: 'ALL', label: 'All' },
    { value: 'AUDIO', label: 'Audio' },
    { value: 'PDF', label: 'PDF' },
    { value: 'IMAGE', label: 'Image' },
    { value: 'TEXT', label: 'Text' },
];

interface LibraryToolbarProps {
    query: string;
    onQueryChange: (v: string) => void;
    typeFilter: TypeFilter;
    onTypeFilter: (v: TypeFilter) => void;
    tagFilter: string;
    onTagFilter: (v: string) => void;
    allTags: string[];
    /* Course organization — the shelf's primary axis. `allCourses` lists the
       course codes actually present so the filter never offers a dead end. */
    allCourses: string[];
    courseFilter: string;
    onCourseFilter: (v: string) => void;
    groupByCourse: boolean;
    onGroupByCourse: (v: boolean) => void;
    sort: SortKey;
    onSort: (v: SortKey) => void;
    layout: CardLayout;
    onLayout: (v: CardLayout) => void;
    canImport: boolean;
    onImportClick: () => void;
    onNewNote: () => void;
    onRecord: () => void;
}

const LibraryToolbar: React.FC<LibraryToolbarProps> = ({
    query, onQueryChange, typeFilter, onTypeFilter, tagFilter, onTagFilter, allTags,
    allCourses, courseFilter, onCourseFilter, groupByCourse, onGroupByCourse,
    sort, onSort, layout, onLayout, canImport, onImportClick, onNewNote, onRecord,
}) => (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <div className="relative w-full sm:w-56">
            <Icon name="search" size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none" />
            <TextInput
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                placeholder="Search materials"
                className="pl-8"
                aria-label="Search materials"
            />
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
            {TYPE_CHIPS.map(c => (
                <Chip key={c.value} active={typeFilter === c.value} onClick={() => onTypeFilter(c.value)}>
                    {c.label}
                </Chip>
            ))}
        </div>

        {allCourses.length > 0 && (
            <Select
                value={courseFilter}
                onChange={(e) => onCourseFilter(e.target.value)}
                aria-label="Filter by course"
                className="max-w-36"
            >
                <option value="">All courses</option>
                {allCourses.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
        )}

        <Chip active={groupByCourse} onClick={() => onGroupByCourse(!groupByCourse)}>
            By course
        </Chip>

        {allTags.length > 0 && (
            <Select
                value={tagFilter}
                onChange={(e) => onTagFilter(e.target.value)}
                aria-label="Filter by tag"
                className="max-w-36"
            >
                <option value="">All tags</option>
                {allTags.map(t => <option key={t} value={t}>{t}</option>)}
            </Select>
        )}

        <Select value={sort} onChange={(e) => onSort(e.target.value as SortKey)} aria-label="Sort materials">
            <option value="recent">Recent</option>
            <option value="title">Title</option>
            <option value="oldest">Oldest</option>
        </Select>

        <Segmented
            value={layout}
            onChange={(v) => onLayout(v as CardLayout)}
            options={[
                { value: 'grid', label: '', icon: 'grid_view' },
                { value: 'list', label: '', icon: 'list' },
            ]}
            className="hidden sm:inline-flex"
        />

        <div className="flex items-center gap-2 ml-auto">
            {canImport && (
                <>
                    <Btn variant="quiet" size="md" icon="upload_file" onClick={onImportClick}>Import</Btn>
                    {/* Authoring starts in the Notes app — this hands off
                        through inkHandoff rather than opening a local editor. */}
                    <Btn variant="quiet" size="md" icon="edit_note" onClick={onNewNote}>New in Notes</Btn>
                </>
            )}
            <Btn variant="primary" size="md" icon="mic" onClick={onRecord}>Record</Btn>
        </div>
    </div>
);

export default LibraryToolbar;
