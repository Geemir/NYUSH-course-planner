export const INSPIRATION_QUOTE_KEY =
  "nyush-planner:inspiration-quote:v1";

export const INSPIRATION_QUOTES = [
  {
    id: "questions",
    text: "Make room in your plan for the questions you cannot stop asking.",
  },
  {
    id: "curiosity",
    text: "Choose the courses that keep your curiosity awake.",
  },
  {
    id: "crossroads",
    text: "The most interesting path may begin where two disciplines meet.",
  },
  {
    id: "wonder",
    text: "A practical plan can still leave a door open for wonder.",
  },
  {
    id: "attention",
    text: "Study what draws your attention back, even after the assignment ends.",
  },
  {
    id: "permission",
    text: "Your interests do not need permission to become serious work.",
  },
  {
    id: "notice",
    text: "A degree maps the journey; curiosity chooses what you notice.",
  },
  {
    id: "surprise",
    text: "Leave one semester brave enough to surprise the person who planned it.",
  },
  {
    id: "languages",
    text: "Breadth gives your questions new languages.",
  },
  {
    id: "explain",
    text: "Build a path you would be eager to explain, not merely one you can defend.",
  },
  {
    id: "detour",
    text: "The course that feels like a detour may teach you what the destination is.",
  },
  {
    id: "discovery",
    text: "Plan with discipline, then protect a little space for discovery.",
  },
] as const;

export type InspirationQuote = (typeof INSPIRATION_QUOTES)[number];
export type InspirationStorage = Pick<Storage, "getItem" | "setItem">;

export function selectSessionQuote(
  storage: InspirationStorage,
  random: () => number = Math.random,
): InspirationQuote {
  const storedId = storage.getItem(INSPIRATION_QUOTE_KEY);
  const storedQuote = INSPIRATION_QUOTES.find(({ id }) => id === storedId);
  if (storedQuote) return storedQuote;

  const randomValue = random();
  const index = Number.isFinite(randomValue)
    ? Math.min(
        INSPIRATION_QUOTES.length - 1,
        Math.max(0, Math.floor(randomValue * INSPIRATION_QUOTES.length)),
      )
    : 0;
  const selected = INSPIRATION_QUOTES[index];
  storage.setItem(INSPIRATION_QUOTE_KEY, selected.id);
  return selected;
}

export function nextQuote(currentId: string): InspirationQuote {
  const currentIndex = INSPIRATION_QUOTES.findIndex(
    ({ id }) => id === currentId,
  );
  if (currentIndex < 0) return INSPIRATION_QUOTES[0];
  return INSPIRATION_QUOTES[(currentIndex + 1) % INSPIRATION_QUOTES.length];
}
