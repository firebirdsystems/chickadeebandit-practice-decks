// Pure, testable logic extracted from index.html.
// No DOM, no network — safe to import from Node for unit tests.

import { isAdult } from "./shared.js";
export { isAdult };

export const RUN_LENGTHS = [10, 20, 40];
export const DEFAULT_RUN_LENGTH = 20;
export const MAX_CARDS = 200;
export const MAX_PROMPT = 120;
export const MAX_ANSWER = 80;

// ── Built-in maths facts ─────────────────────────────────────────────────────

export const OPS = {
  mul: { symbol: "×", name: "Times", max: 12 },
  div: { symbol: "÷", name: "Divide", max: 12 },
  add: { symbol: "+", name: "Add", max: 20 },
  sub: { symbol: "−", name: "Take away", max: 20 },
};
export const SCOPES = ["only", "upto"];

/** A validated { op, scope, n }, or null. `only` is one table ("the 7s");
 *  `upto` is every table from 1 to n. */
export function mathSpec(op, scope, n) {
  const def = OPS[op];
  const num = Number(n);
  if (!def || !SCOPES.includes(scope) || !Number.isInteger(num) || num < 1 || num > def.max) return null;
  return { op, scope, n: num };
}

export function mathKey(spec) {
  return `math:${spec.op}:${spec.scope}:${spec.n}`;
}

export function parseMathKey(key) {
  const m = /^math:([a-z]+):([a-z]+):(\d+)$/.exec(String(key ?? ""));
  return m ? mathSpec(m[1], m[2], Number(m[3])) : null;
}

export function mathLabel(spec) {
  const { op, scope, n } = spec;
  if (op === "mul") return scope === "only" ? `${n} times table` : `Times tables up to ${n}`;
  if (op === "div") return scope === "only" ? `Dividing by ${n}` : `Dividing by 1 to ${n}`;
  if (op === "add") return scope === "only" ? `Adding ${n}` : `Adding up to ${n}`;
  return scope === "only" ? `Taking away ${n}` : `Taking away up to ${n}`;
}

/**
 * Every fact in a set, as { q, a } strings.
 *   mul only 7 → 7 × 1 … 7 × 12        mul upto 7 → every a × b, a from 1 to 7
 *   div only 7 → 7 ÷ 7 … 84 ÷ 7        (the times table, asked backwards)
 *   add only 7 → 7 + 1 … 7 + 10        add upto 7 → every a + b, both up to 7
 *   sub only 7 → 8 − 7 … 17 − 7        (the adding facts, asked backwards)
 * Division and subtraction are built from the facts they undo, so an answer is
 * always a whole number and never negative.
 */
export function mathFacts(spec) {
  if (!spec || !OPS[spec.op]) return [];
  const { op, scope, n } = spec;
  const firsts = scope === "only" ? [n] : Array.from({ length: n }, (_, i) => i + 1);
  const times = op === "mul" || op === "div";
  const secondMax = times ? 12 : scope === "only" ? 10 : n;
  const facts = [];
  for (const a of firsts) {
    for (let b = 1; b <= secondMax; b++) {
      if (op === "mul") facts.push({ q: `${a} × ${b}`, a: String(a * b) });
      else if (op === "div") facts.push({ q: `${a * b} ÷ ${a}`, a: String(b) });
      else if (op === "add") facts.push({ q: `${a} + ${b}`, a: String(a + b) });
      else facts.push({ q: `${a + b} − ${a}`, a: String(b) });
    }
  }
  return facts;
}

// ── Written decks ────────────────────────────────────────────────────────────

export const MODES = { cards: "Flash cards", spelling: "Spelling" };

export function deckKey(deckId) { return `deck:${deckId}`; }

/** The cards stored on a deck row. Anything that is not a well-formed card is
 *  dropped, so a damaged value yields a short deck, never a crash. */
export function readCards(json) {
  let value;
  try { value = typeof json === "string" ? JSON.parse(json) : json; } catch { return []; }
  if (!Array.isArray(value)) return [];
  const cards = [];
  for (const c of value) {
    if (!c || typeof c.a !== "string" || !c.a.trim()) continue;
    cards.push({ q: typeof c.q === "string" ? c.q : "", a: c.a });
    if (cards.length >= MAX_CARDS) break;
  }
  return cards;
}

/**
 * Cards from what a person typed, one per line.
 *   cards:    "capital of France = Paris"   (a line with no "=" is skipped)
 *   spelling: "necessary"  or  "necessary = you need it"   (word, then a hint)
 * Returns the cards and how many non-empty lines could not be used.
 */
export function parseCards(text, mode) {
  const cards = [];
  let skipped = 0;
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const at = line.search(/=|\t/);
    const left = (at === -1 ? line : line.slice(0, at)).trim();
    const right = at === -1 ? "" : line.slice(at + 1).trim();
    let card;
    if (mode === "spelling") card = left ? { q: right.slice(0, MAX_PROMPT), a: left.slice(0, MAX_ANSWER) } : null;
    else card = left && right ? { q: left.slice(0, MAX_PROMPT), a: right.slice(0, MAX_ANSWER) } : null;
    if (!card || cards.length >= MAX_CARDS) { skipped++; continue; }
    cards.push(card);
  }
  return { cards, skipped };
}

/** The inverse of parseCards, for the editor. */
export function cardsToText(cards, mode) {
  return cards.map(c => (mode === "spelling" ? (c.q ? `${c.a} = ${c.q}` : c.a) : `${c.q} = ${c.a}`)).join("\n");
}

// ── Checking an answer ───────────────────────────────────────────────────────

export function normalizeAnswer(value) {
  return String(value ?? "").normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ").replace(/[.!?]+$/, "");
}

/**
 * Whether a typed answer is right. Maths answers compare as whole numbers, so
 * "056" and " 56 " are 56. Written answers ignore capitals, extra spaces and a
 * closing full stop, and a card may list alternatives with "|"
 * ("color|colour").
 */
export function isCorrect(given, expected, numeric = false) {
  if (numeric) {
    const g = String(given ?? "").replace(/[\s,]/g, "");
    return /^-?\d+$/.test(g) && Number(g) === Number(expected);
  }
  const g = normalizeAnswer(given);
  if (!g) return false;
  return String(expected ?? "").split("|").some(alt => normalizeAnswer(alt) === g);
}

/** What to show as the right answer: the first alternative. */
export function shownAnswer(expected) {
  return String(expected ?? "").split("|")[0].trim();
}

// ── Building a run ───────────────────────────────────────────────────────────

export function shuffle(items, rng = Math.random) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** How many cards a run has. Maths sets repeat to fill the length asked for; a
 *  written deck is never padded past its own cards. */
export function runLength(total, wanted, repeat) {
  if (total < 1) return 0;
  return repeat ? wanted : Math.min(wanted, total);
}

/**
 * `count` cards drawn from `cards`. Every card appears before any repeats, and
 * the same card never comes up twice in a row.
 */
export function buildRun(cards, count, rng = Math.random) {
  if (!cards.length || count < 1) return [];
  const run = [];
  while (run.length < count) {
    const pass = shuffle(cards, rng);
    if (run.length && pass.length > 1 && pass[0] === run[run.length - 1]) {
      [pass[0], pass[1]] = [pass[1], pass[0]];
    }
    for (const card of pass) {
      if (run.length >= count) break;
      run.push(card);
    }
  }
  return run;
}

// ── Times and bests ──────────────────────────────────────────────────────────

/** "42.3s" under a minute, "1:05.2" above. Tenths, because a best is beaten by
 *  less than a second more often than not. */
export function formatTime(ms) {
  const tenths = Math.max(0, Math.round((Number(ms) || 0) / 100));
  const secs = Math.floor(tenths / 10), t = tenths % 10;
  if (secs < 60) return `${secs}.${t}s`;
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}.${t}`;
}

export function findBest(bests, memberId, key, count) {
  return bests.find(b => b.member_id === memberId && b.deck_key === key && Number(b.card_count) === count) ?? null;
}

/** How a finished run compares with the best before it. */
export function compareRun(durationMs, best) {
  if (!best) return { firstTime: true, isBest: true, deltaMs: 0 };
  const deltaMs = durationMs - Number(best.best_ms);
  return { firstTime: false, isBest: deltaMs < 0, deltaMs };
}

/** The best row after a run, given the row before it (or null). `newId` is
 *  the id a first best is stored under; an existing row keeps its own. */
export function nextBest(best, run, newId = "") {
  const beaten = !best || run.duration_ms < Number(best.best_ms);
  return {
    id: best?.id ?? newId,
    member_id: run.member_id,
    deck_key: run.deck_key,
    card_count: run.card_count,
    label: run.label,
    best_ms: beaten ? run.duration_ms : Number(best.best_ms),
    best_date: beaten ? run.run_date : best.best_date,
    run_count: (best ? Number(best.run_count) || 0 : 0) + 1,
    last_date: run.run_date,
  };
}

/** "Today", "Yesterday", or a short date, from household-local yyyy-mm-dd
 *  strings. `today` is passed in, never read from a clock. */
export function dayLabel(dateStr, today) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr ?? ""));
  if (!m) return "";
  if (dateStr === today) return "Today";
  const t = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(today ?? ""));
  if (t) {
    const y = new Date(Date.UTC(Number(t[1]), Number(t[2]) - 1, Number(t[3]) - 1)).toISOString().slice(0, 10);
    if (dateStr === y) return "Yesterday";
  }
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ── Who may do what ──────────────────────────────────────────────────────────
// These mirror the row policies in manifest.json exactly.

/** `decks` is owner_or_visibility: the author edits their own deck, and an
 *  adult edits any deck. */
export function canEditDeck(me, deck) {
  if (!me || !deck) return false;
  return isAdult(me) || deck.created_by === me.id;
}

/** `runs` and `bests` are owner_only with adults_bypass: only an adult reads
 *  another member's times. */
export function canSeeFamily(me) { return isAdult(me); }

/**
 * Fields the in-app search matches against (see hub-sdk `searchMatch`). The
 * cards count as well as the title — a deck is found by a word that is in it.
 */
export function searchableFields(deck) {
  const cards = readCards(deck.cards);
  return [deck.title, ...cards.map(c => c.q), ...cards.map(c => c.a)];
}
