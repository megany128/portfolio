/*
 * Czech study dashboard — shared data for /czech and /api/czech/checks.
 * Edit the trip date, daily tasks, or activity library here.
 */

/** Arrival in Prague (local calendar date). */
export const TRIP_DATE = "2026-12-17";
/** First day of the countdown — anchors the progress bar and heatmap. */
export const COUNTDOWN_START = "2026-10-10";

export type CzechTask = {
  id: string;
  cz: string;
  en: string;
  hint: string;
  href?: string;
};

export const CZECH_TASKS: readonly CzechTask[] = [
  {
    id: "anki",
    cz: "Anki",
    en: "Clear today's Anki reviews",
    hint: "All due cards, then a few new ones.",
    href: "https://ankiweb.net/decks",
  },
  {
    id: "podcast",
    cz: "Podcast",
    en: "Listen to a podcast",
    hint: "Any length — Radio Wave, Easy Czech, Český rozhlas.",
    href: "https://www.mujrozhlas.cz/",
  },
  {
    id: "sklonuj",
    cz: "Skloňuj",
    en: "Do Skloňuj drills",
    hint: "One round of declension practice.",
    href: "https://www.sklonuj.cz/",
  },
  {
    id: "video",
    cz: "Video",
    en: "Watch a YouTube video",
    hint: "Czech audio, Czech subtitles if you can.",
    href: "https://www.youtube.com/@EasyCzech",
  },
  {
    id: "journal",
    cz: "Deník",
    en: "Write & correct a journal entry",
    hint: "A few sentences about today, then fix the mistakes.",
    href: "https://prirucka.ujc.cas.cz/",
  },
];

export const CZECH_TASK_IDS: ReadonlySet<string> = new Set(CZECH_TASKS.map((t) => t.id));

export function isIsoDay(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

export type ActivityKind = "listen" | "watch" | "read" | "speak" | "write" | "grammar" | "prague";

export const ACTIVITY_KINDS: { id: ActivityKind; label: string; cz: string }[] = [
  { id: "listen", label: "Listen", cz: "Poslech" },
  { id: "watch", label: "Watch", cz: "Sledování" },
  { id: "read", label: "Read", cz: "Čtení" },
  { id: "speak", label: "Speak", cz: "Mluvení" },
  { id: "write", label: "Write", cz: "Psaní" },
  { id: "grammar", label: "Grammar", cz: "Gramatika" },
  { id: "prague", label: "Trip prep", cz: "Praha" },
];

export type Activity = {
  title: string;
  kind: ActivityKind;
  minutes: number;
  detail: string;
  href?: string;
};

/** Grab-bag for "I don't know what to do today". */
export const CZECH_ACTIVITIES: readonly Activity[] = [
  // — Listen
  {
    title: "Shadow 2 minutes of a podcast",
    kind: "listen",
    minutes: 10,
    detail: "Pause after each sentence and repeat it out loud, copying the melody.",
  },
  {
    title: "Listen to the news",
    kind: "listen",
    minutes: 15,
    detail: "Pick a short Český rozhlas segment and write down 5 words you caught.",
    href: "https://www.mujrozhlas.cz/",
  },
  {
    title: "Czech music hour",
    kind: "listen",
    minutes: 20,
    detail: "Find lyrics for one song (Lenny, Mirai, Karel Gott…) and translate the chorus.",
  },
  {
    title: "Dictation",
    kind: "listen",
    minutes: 15,
    detail: "Transcribe 30 seconds of a video word-for-word, then check against subtitles.",
  },

  // — Watch
  {
    title: "Easy Czech street interview",
    kind: "watch",
    minutes: 15,
    detail: "Watch once with English subs, once with Czech only.",
    href: "https://www.youtube.com/@EasyCzech",
  },
  {
    title: "Krteček episode",
    kind: "watch",
    minutes: 10,
    detail: "The little mole is almost wordless — narrate what happens in Czech.",
    href: "https://www.youtube.com/results?search_query=krte%C4%8Dek",
  },
  {
    title: "Watch something on iVysílání",
    kind: "watch",
    minutes: 30,
    detail: "Czech TV's free streaming — try a fairy tale (pohádka) or Večerníček.",
    href: "https://www.ceskatelevize.cz/ivysilani/",
  },
  {
    title: "Prague vlog",
    kind: "watch",
    minutes: 15,
    detail: "Search a Czech-language Prague vlog and note places you want to visit.",
    href: "https://www.youtube.com/results?search_query=praha+vlog",
  },

  // — Read
  {
    title: "Read one news article",
    kind: "read",
    minutes: 20,
    detail: "Pick a short iROZHLAS piece. Look up at most 10 words.",
    href: "https://www.irozhlas.cz/",
  },
  {
    title: "Wikipedia in Czech",
    kind: "read",
    minutes: 15,
    detail: "Read the Czech article on something you already know well.",
    href: "https://cs.wikipedia.org/",
  },
  {
    title: "Graded reader / kids' book",
    kind: "read",
    minutes: 20,
    detail: "A few pages of something simple, read aloud.",
  },
  {
    title: "Menu reading",
    kind: "read",
    minutes: 10,
    detail: "Open a Prague restaurant's menu and decode every dish without translating the page.",
  },

  // — Speak
  {
    title: "Narrate your day",
    kind: "speak",
    minutes: 5,
    detail: "Talk through what you're doing right now, out loud, in Czech.",
  },
  {
    title: "Record a voice memo",
    kind: "speak",
    minutes: 10,
    detail: "1 minute about your week. Listen back and note what you hesitated on.",
  },
  {
    title: "Tongue twisters",
    kind: "speak",
    minutes: 5,
    detail: "Strč prst skrz krk. Třistatřicettři stříbrných stříkaček…",
  },
  {
    title: "Pronunciation check",
    kind: "speak",
    minutes: 10,
    detail: "Look up ř, ě, and long vowels in words you use a lot and copy native speakers.",
    href: "https://forvo.com/languages/cs/",
  },

  // — Write
  {
    title: "Text a friend in Czech",
    kind: "write",
    minutes: 5,
    detail: "Even if they don't speak it — the effort counts.",
  },
  {
    title: "Rewrite a journal entry",
    kind: "write",
    minutes: 15,
    detail: "Take yesterday's corrected entry and rewrite it from memory.",
  },
  {
    title: "10 sentences, one verb",
    kind: "write",
    minutes: 10,
    detail: "Pick a verb and write it in every person + past + future.",
  },
  {
    title: "Grammar-check a paragraph",
    kind: "write",
    minutes: 10,
    detail: "Write freely, then run it through LanguageTool and fix what it flags.",
    href: "https://languagetool.org/",
  },

  // — Grammar
  {
    title: "Extra Skloňuj round",
    kind: "grammar",
    minutes: 10,
    detail: "Focus on the case you get wrong most.",
    href: "https://www.sklonuj.cz/",
  },
  {
    title: "Look up a declension pattern",
    kind: "grammar",
    minutes: 10,
    detail: "Internetová jazyková příručka — type any word to see all its forms.",
    href: "https://prirucka.ujc.cas.cz/",
  },
  {
    title: "Verbs of motion",
    kind: "grammar",
    minutes: 15,
    detail: "jít / chodit / jet / jezdit — write an example for each.",
  },
  {
    title: "Aspect pairs",
    kind: "grammar",
    minutes: 15,
    detail: "List 10 perfective/imperfective pairs and make a sentence with each.",
  },

  // — Trip prep
  {
    title: "Order coffee & food",
    kind: "prague",
    minutes: 10,
    detail: "Dám si… / Můžu poprosit o… / Zaplatím kartou. Role-play a café visit.",
  },
  {
    title: "Learn the tram announcement",
    kind: "prague",
    minutes: 5,
    detail: "„Ukončete, prosím, výstup a nástup, dveře se zavírají.“ Plan a route on IDOS.",
    href: "https://idos.cz/",
  },
  {
    title: "Christmas market vocab",
    kind: "prague",
    minutes: 10,
    detail: "svařák, trdelník, vánoční trh, kapr, cukroví — you'll arrive right in the season.",
  },
  {
    title: "Directions & small talk",
    kind: "prague",
    minutes: 10,
    detail: "Kde je…? Jak se dostanu na…? Odkud jste? Practice asking and answering.",
  },
  {
    title: "Plan a day in Czech",
    kind: "prague",
    minutes: 20,
    detail: "Write an itinerary for one day in Prague entirely in Czech.",
  },
];
