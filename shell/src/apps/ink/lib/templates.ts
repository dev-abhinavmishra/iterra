import type { Note } from '../store';

export interface NoteTemplate {
  id: string;
  name: string;
  hint: string;
  build: () => Partial<Omit<Note, 'id' | 'lastModified' | 'createdAt'>>;
}

const para = (text: string) => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : undefined });
const h2 = (text: string) => ({ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text }] });
const bullet = (items: string[]) => ({
  type: 'bulletList',
  content: items.map(text => ({ type: 'listItem', content: [para(text)] })),
});
const doc = (content: unknown[]) => JSON.stringify({ type: 'doc', content });

export const NOTE_TEMPLATES: NoteTemplate[] = [
  {
    id: 'blank',
    name: 'Blank page',
    hint: 'A clean sheet',
    build: () => ({ title: '', content: doc([para('')]), tags: [] }),
  },
  {
    id: 'journal',
    name: 'Journal entry',
    hint: 'What happened, what it meant',
    build: () => ({
      title: '',
      tags: ['JOURNAL'],
      ink: 'fountain',
      content: doc([
        h2('Today'),
        para(''),
        h2('On my mind'),
        para(''),
      ]),
    }),
  },
  {
    id: 'meeting',
    name: 'Meeting notes',
    hint: 'Attendees, agenda, action items',
    build: () => ({
      title: 'Meeting — ',
      tags: ['MEETING'],
      content: doc([
        para('Attendees: '),
        h2('Agenda'),
        bullet(['']),
        h2('Notes'),
        para(''),
        h2('Action items'),
        bullet(['']),
      ]),
    }),
  },
  {
    id: 'reading',
    name: 'Reading notes',
    hint: 'Source, quotes, takeaways',
    build: () => ({
      title: '',
      tags: ['READING'],
      content: doc([
        para('Source: '),
        h2('Quotes'),
        { type: 'blockquote', content: [para('')] },
        h2('Takeaways'),
        bullet(['']),
      ]),
    }),
  },
  {
    id: 'idea',
    name: 'Idea sketch',
    hint: 'The thought, why it matters, next step',
    build: () => ({
      title: '',
      tags: ['IDEA'],
      content: doc([
        h2('The idea'),
        para(''),
        h2('Why it matters'),
        para(''),
        h2('Next step'),
        para(''),
      ]),
    }),
  },
];
