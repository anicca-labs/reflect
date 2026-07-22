// HARDCODED PREVIEW DATA — stg-only demo of the AI Weekly Reflection feature.
// Not wired to any backend yet; this exists purely to feel the flow on-device
// (card → full-screen read → dismiss, and the "3 free then Pro" lock).
// Remove once the real generate-reflection edge function + cron land.

export type WeeklyReflection = {
  id: string;
  relativeLabel: string; // "This week", "Last week", …
  rangeLabel: string; // "Oct 20 – 26"
  entryCount: number;
  preview: string; // one-line teaser shown on the card
  body: string; // full reflection, paragraphs separated by \n\n
  locked: boolean; // true = past the 3 free, needs Pro
};

// Three unlocked (the 3 free), two locked (Pro) — mirrors the real gating.
export const MOCK_WEEKLY_REFLECTIONS: WeeklyReflection[] = [
  {
    id: 'w-1',
    relativeLabel: 'This week',
    rangeLabel: 'Oct 20 – 26',
    entryCount: 6,
    preview: 'Sleep and the people you love kept circling each other.',
    body: `This week, sleep and the people you love kept circling each other. It started “wired at midnight” over Thursday's deadline, and for three days the tiredness leaked into everything — the skipped gym, snapping at a coworker “over nothing,” the call you didn't make.

Then Thursday came and went “better than you feared,” and something loosened. You slept eight hours, wrote that “everything felt lighter,” and by Sunday you finally called your mom.

The thread I notice: the thing you dreaded and the thing you kept avoiding both turned out lighter than the dread of them. You even asked it yourself — “why do I always put it off?”

A question to sit with: what would this week have felt like if Sunday's call had happened on Monday?`,
    locked: false,
  },
  {
    id: 'w-2',
    relativeLabel: 'Last week',
    rangeLabel: 'Oct 13 – 19',
    entryCount: 5,
    preview: 'Two words kept showing up: “later” and “enough.”',
    body: `Two words kept showing up this week: “later” and “enough.” You put things off — “I'll deal with it later” — and then measured the day by whether you'd done enough. On Wednesday you wrote “never enough,” and on Saturday, after the long run, “that was enough. finally.”

The lightest entry was the one where you stopped keeping score — “didn't do much today and it was fine.”

A question to sit with: who taught you that a day has to be earned?`,
    locked: false,
  },
  {
    id: 'w-3',
    relativeLabel: 'Oct 6 – 12',
    rangeLabel: 'Oct 6 – 12',
    entryCount: 4,
    preview: 'A week of small kindnesses you almost didn’t notice.',
    body: `This was a week of small kindnesses you almost didn't notice. A stranger held the door “and it weirdly made my morning.” A friend texted “just checking in.” You wrote them down like they surprised you.

But when it came to yourself, the tone changed — “should've done better,” “so behind.” You're generous with everyone except the person writing these entries.

A question to sit with: what would it take to speak to yourself the way that friend spoke to you?`,
    locked: false,
  },
  {
    id: 'w-4',
    relativeLabel: 'Sep 29 – Oct 5',
    rangeLabel: 'Sep 29 – Oct 5',
    entryCount: 7,
    preview: 'A quieter week, and a pattern in when you write.',
    body: `Locked preview — this reflection is available with Reflect Pro.`,
    locked: true,
  },
  {
    id: 'w-5',
    relativeLabel: 'Sep 22 – 28',
    rangeLabel: 'Sep 22 – 28',
    entryCount: 5,
    preview: 'The week work and rest finally stopped fighting.',
    body: `Locked preview — this reflection is available with Reflect Pro.`,
    locked: true,
  },
];
