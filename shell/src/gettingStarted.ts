/* Getting Started — one short guide per place. Rendered inside the
   "Getting Started" workspace (#/c/unfiled): items that don't belong to a
   course land here alongside the guides, so a fresh workspace explains
   itself instead of opening on an empty list. */

export interface GettingStartedGuide {
  place: string;
  /** first moves, shown as a numbered list */
  steps: string[];
}

export const GETTING_STARTED: GettingStartedGuide[] = [
  {
    place: 'syllabus',
    steps: [
      'File a course — give it a code and a name.',
      'Add a commitment in the form "title @course #type due:day ~Nm".',
      'Let the registrar propose blocks on the Today tab, then accept them.',
    ],
  },
  {
    place: 'timer',
    steps: [
      'Press Space or pick a preset to start a 25-minute focus block.',
      'Link a block from Planning to credit the session to real work.',
      'End of day, check Stats for streaks and total focus time.',
    ],
  },
  {
    place: 'ink',
    steps: [
      'Press N or hit New page — start writing immediately.',
      'Tag a note with a course code to file it under that course.',
      'Select text and send it to Flashcards or Calculations to work on it.',
    ],
  },
  {
    place: 'margin',
    steps: [
      'Drop a PDF, doc, image, or audio file onto Notes to import it.',
      'Open a document and select text — ask about it or send it onward.',
      'Save generated cards to the Flashcards place from any selection.',
    ],
  },
  {
    place: 'flashcards',
    steps: [
      'Create a deck — paste "term : answer" lines, one per line.',
      'Review in Flip mode, grade yourself in Learn, or run a Quiz.',
      'Tag a deck with a course code so it files under that course.',
    ],
  },
  {
    place: 'proof',
    steps: [
      'File a problem — markdown prompt plus a worked answer.',
      'Attempt it step by step; reveal hints only when stuck.',
      'Compare against the worked answer — misses schedule a retry.',
    ],
  },
  {
    place: 'rhythm',
    steps: [
      'Add a routine — a habit you want to keep, like "read 20m".',
      'Each day, mark the steps you showed up for — the playhead sweeps the week.',
      'Watch the heatmap for cadence; missed days file to the ledger.',
    ],
  },
  {
    place: 'gradestack',
    steps: [
      'Design an answer sheet — question count and format, then print the PDF.',
      'Mark the key by tapping answers on the sheet itself.',
      'Scan completed sheets and review scores in Analytics.',
    ],
  },
];
