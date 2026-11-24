import { describe, it, expect } from 'vitest';
import { buildLinkedWorkGroups, linkedWorkLabel, type LinkEdge } from './linkedWork';
import type { WorkspaceObject } from '../ui/ObjectRow';
import type { StoreEntity } from '../hub';

/* Linked-work grouping contract: quiz/commitment/assessment anchors gather
   the blocks, notes, decks, and sessions the existing link graph (or a
   quiz's sourceNoteId provenance) connects them to — the Biology-quiz
   case — while non-anchor rows and unlinked objects produce nothing. */

const obj = (over: Partial<WorkspaceObject>): WorkspaceObject => ({
  key: over.key || `${over.app || 'app'}:${over.type || 'item'}:${over.id || 'x'}`,
  app: 'margin',
  type: 'note',
  id: 'x',
  title: 'Untitled',
  url: '/apps/margin/',
  ...over,
});

const ent = (over: Partial<StoreEntity>): StoreEntity => ({
  key: over.key || `${over.app || 'margin'}:${over.type || 'note'}:${over.id || 'x'}`,
  app: 'margin',
  type: 'note',
  id: 'x',
  title: 'Untitled',
  ...over,
});

const link = (from: string, to: string, kind = 'related'): LinkEdge => ({ from, to, kind });

describe('buildLinkedWorkGroups', () => {
  it('groups a quiz with its study block, lecture note, and review deck', () => {
    const quiz = obj({
      key: 'margin:quiz:q1',
      type: 'quiz',
      id: 'q1',
      title: 'Cell division quiz',
      data: { sourceNoteId: 'n1' },
    });
    const note = ent({ key: 'margin:note:n1', type: 'note', id: 'n1', title: 'Lecture: Cell division' });
    const block = ent({
      key: 'syllabus:block:b1',
      app: 'syllabus',
      type: 'block',
      id: 'b1',
      title: 'Biology review block',
      url: '/apps/syllabus/',
    });
    const deck = ent({
      key: 'flashcards:deck:d1',
      app: 'flashcards',
      type: 'deck',
      id: 'd1',
      title: 'Cell division deck',
      url: '/apps/flashcards/',
      data: { sourceNoteId: 'n1' },
    });
    const links: LinkEdge[] = [
      link('syllabus:block:b1', 'margin:quiz:q1', 'scheduledFor'),
      link('flashcards:deck:d1', 'margin:note:n1', 'derivedFrom'),
    ];

    const groups = buildLinkedWorkGroups({
      anchors: [quiz],
      entities: [note, block, deck],
      indexes: {},
      links,
    });

    const kids = groups.get('margin:quiz:q1')!;
    expect(kids.map((k) => k.key).sort()).toEqual([
      'flashcards:deck:d1',
      'margin:note:n1',
      'syllabus:block:b1',
    ]);
    /* block surfaces via the scheduledFor edge; the deck via the shared
       source note (both the derivedFrom edge and sourceNoteId match) */
    expect(kids.find((k) => k.key === 'syllabus:block:b1')?.via).toBe('scheduled');
    expect(kids.find((k) => k.key === 'margin:note:n1')?.via).toBe('source');
  });

  it('reaches a deck scheduled on the same block (one hop through it)', () => {
    const quiz = obj({ key: 'margin:quiz:q1', type: 'quiz', id: 'q1', title: 'Quiz' });
    const block = ent({ key: 'syllabus:block:b1', app: 'syllabus', type: 'block', id: 'b1', title: 'Block' });
    const deck = ent({ key: 'flashcards:deck:d1', app: 'flashcards', type: 'deck', id: 'd1', title: 'Deck' });
    const links: LinkEdge[] = [
      link('syllabus:block:b1', 'margin:quiz:q1', 'scheduledFor'),
      link('syllabus:block:b1', 'flashcards:deck:d1', 'scheduledFor'),
    ];
    const groups = buildLinkedWorkGroups({
      anchors: [quiz],
      entities: [block, deck],
      indexes: {},
      links,
    });
    expect(groups.get('margin:quiz:q1')!.map((k) => k.key).sort()).toEqual([
      'flashcards:deck:d1',
      'syllabus:block:b1',
    ]);
  });

  it('ignores non-anchor types and produces nothing without links', () => {
    const note = obj({ key: 'ink:note:n1', app: 'ink', type: 'note', id: 'n1', title: 'Note' });
    const groups = buildLinkedWorkGroups({
      anchors: [note],
      entities: [],
      indexes: {},
      links: [link('ink:note:n1', 'margin:note:m1', 'derivedFrom')],
    });
    expect(groups.size).toBe(0);

    const lonely = obj({ key: 'margin:quiz:q9', type: 'quiz', id: 'q9', title: 'Lonely quiz' });
    const g2 = buildLinkedWorkGroups({ anchors: [lonely], entities: [], indexes: {}, links: [] });
    expect(g2.size).toBe(0);
  });

  it('resolves link endpoints from the index mirror and skips card/course noise', () => {
    const quiz = obj({ key: 'margin:quiz:q1', type: 'quiz', id: 'q1', title: 'Quiz' });
    const groups = buildLinkedWorkGroups({
      anchors: [quiz],
      entities: [],
      indexes: {
        syllabus: [
          { t: 'block', id: 'b1', title: 'Indexed block', url: '/apps/syllabus/?block=b1' },
          { t: 'card', id: 'c1', title: 'Noise card' },
        ],
      },
      links: [
        link('syllabus:block:b1', 'margin:quiz:q1', 'scheduledFor'),
        link('syllabus:card:c1', 'margin:quiz:q1', 'related'),
      ],
    });
    const kids = groups.get('margin:quiz:q1')!;
    expect(kids).toHaveLength(1);
    expect(kids[0].title).toBe('Indexed block');
    expect(kids[0].url).toBe('/apps/syllabus/?block=b1');
  });
});

describe('linkedWorkLabel', () => {
  it('labels relation, item type, and source app', () => {
    expect(
      linkedWorkLabel({
        ...obj({ key: 'syllabus:block:b1', app: 'syllabus', type: 'block', id: 'b1', title: 'Block' }),
        via: 'scheduled',
      }),
    ).toBe('scheduled · Work Block · Planning');
    expect(linkedWorkLabel(obj({ app: 'unknownapp', type: 'mystery', id: 'z' }))).toBe('Mystery · unknownapp');
  });
});
