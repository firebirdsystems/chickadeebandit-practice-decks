import { describe, it, expect } from "vitest";
import {
  OPS, mathSpec, mathKey, parseMathKey, mathLabel, mathFacts,
  deckKey, readCards, parseCards, cardsToText, MAX_CARDS,
  normalizeAnswer, isCorrect, shownAnswer,
  shuffle, runLength, buildRun,
  formatTime, findBest, compareRun, nextBest, dayLabel,
  canEditDeck, canSeeFamily, searchableFields,
} from "../src/logic.js";

/** A small deterministic generator, so shuffles are repeatable. */
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe("maths sets", () => {
  it("validates a set", () => {
    expect(mathSpec("mul", "only", 7)).toEqual({ op: "mul", scope: "only", n: 7 });
    expect(mathSpec("mul", "only", 13)).toBeNull();
    expect(mathSpec("add", "upto", 20)).not.toBeNull();
    expect(mathSpec("mul", "only", 0)).toBeNull();
    expect(mathSpec("mul", "only", 2.5)).toBeNull();
    expect(mathSpec("pow", "only", 2)).toBeNull();
    expect(mathSpec("mul", "some", 2)).toBeNull();
  });

  it("round-trips a key", () => {
    for (const op of Object.keys(OPS)) {
      for (const scope of ["only", "upto"]) {
        const spec = mathSpec(op, scope, 7);
        expect(parseMathKey(mathKey(spec))).toEqual(spec);
      }
    }
    expect(mathKey(mathSpec("mul", "only", 7))).toBe("math:mul:only:7");
    expect(parseMathKey("deck:abc")).toBeNull();
    expect(parseMathKey("math:mul:only:99")).toBeNull();
    expect(parseMathKey(null)).toBeNull();
  });

  it("names each set", () => {
    expect(mathLabel(mathSpec("mul", "only", 7))).toBe("7 times table");
    expect(mathLabel(mathSpec("mul", "upto", 7))).toBe("Times tables up to 7");
    expect(mathLabel(mathSpec("div", "only", 7))).toBe("Dividing by 7");
    expect(mathLabel(mathSpec("add", "upto", 10))).toBe("Adding up to 10");
    expect(mathLabel(mathSpec("sub", "only", 3))).toBe("Taking away 3");
  });

  it("the 7s are 7 times 1 to 12", () => {
    const facts = mathFacts(mathSpec("mul", "only", 7));
    expect(facts).toHaveLength(12);
    expect(facts[0]).toEqual({ q: "7 × 1", a: "7" });
    expect(facts[11]).toEqual({ q: "7 × 12", a: "84" });
  });

  it("'up to 7' is every table from 1 to 7", () => {
    const facts = mathFacts(mathSpec("mul", "upto", 7));
    expect(facts).toHaveLength(7 * 12);
    expect(facts.some(f => f.q === "1 × 1")).toBe(true);
    expect(facts.some(f => f.q === "7 × 12")).toBe(true);
    expect(facts.some(f => f.q.startsWith("8 "))).toBe(false);
  });

  it("every fact's answer is right, whole and not negative", () => {
    for (const op of Object.keys(OPS)) {
      for (const scope of ["only", "upto"]) {
        for (const n of [1, 6, OPS[op].max]) {
          const facts = mathFacts(mathSpec(op, scope, n));
          expect(facts.length).toBeGreaterThan(0);
          for (const { q, a } of facts) {
            const [x, sym, y] = q.split(" ");
            const l = Number(x), r = Number(y);
            const value = sym === "×" ? l * r : sym === "÷" ? l / r : sym === "+" ? l + r : l - r;
            expect(String(value), q).toBe(a);
            expect(Number.isInteger(value) && value >= 0, q).toBe(true);
          }
        }
      }
    }
  });

  it("division and subtraction undo the facts they come from", () => {
    expect(mathFacts(mathSpec("div", "only", 7))[11]).toEqual({ q: "84 ÷ 7", a: "12" });
    expect(mathFacts(mathSpec("sub", "only", 7))[0]).toEqual({ q: "8 − 7", a: "1" });
    expect(mathFacts(null)).toEqual([]);
  });
});

describe("written decks", () => {
  it("parses flash cards, one per line", () => {
    const { cards, skipped } = parseCards("capital of France = Paris\n\n  dog = el perro  \nno answer here\n= nothing\n", "cards");
    expect(cards).toEqual([{ q: "capital of France", a: "Paris" }, { q: "dog", a: "el perro" }]);
    expect(skipped).toBe(2);
  });

  it("splits on the first '=' only, and accepts a tab", () => {
    expect(parseCards("2 + 2 = 4 = four", "cards").cards).toEqual([{ q: "2 + 2", a: "4 = four" }]);
    expect(parseCards("gato\tcat", "cards").cards).toEqual([{ q: "gato", a: "cat" }]);
  });

  it("parses spelling words with an optional hint", () => {
    const { cards, skipped } = parseCards("necessary\nrhythm = a steady beat\n", "spelling");
    expect(cards).toEqual([{ q: "", a: "necessary" }, { q: "a steady beat", a: "rhythm" }]);
    expect(skipped).toBe(0);
  });

  it("stops at the card limit and reports the rest", () => {
    const text = Array.from({ length: MAX_CARDS + 5 }, (_, i) => `q${i} = a${i}`).join("\n");
    const { cards, skipped } = parseCards(text, "cards");
    expect(cards).toHaveLength(MAX_CARDS);
    expect(skipped).toBe(5);
  });

  it("writes cards back out the way they were typed", () => {
    for (const [mode, text] of [["cards", "capital of France = Paris\ndog = el perro"], ["spelling", "necessary\nrhythm = a steady beat"]]) {
      expect(cardsToText(parseCards(text, mode).cards, mode)).toBe(text);
    }
  });

  it("reads stored cards and drops anything malformed", () => {
    expect(readCards('[{"q":"a","a":"b"},{"q":"x"},null,{"a":"  "},{"a":"word"}]')).toEqual([{ q: "a", a: "b" }, { q: "", a: "word" }]);
    expect(readCards("not json")).toEqual([]);
    expect(readCards('{"q":"a"}')).toEqual([]);
    expect(readCards(null)).toEqual([]);
    expect(readCards([{ q: "a", a: "b" }])).toEqual([{ q: "a", a: "b" }]);
  });

  it("keys a deck by its id", () => {
    expect(deckKey("abc")).toBe("deck:abc");
  });
});

describe("checking an answer", () => {
  it("compares maths answers as whole numbers", () => {
    expect(isCorrect("56", "56", true)).toBe(true);
    expect(isCorrect(" 056 ", "56", true)).toBe(true);
    expect(isCorrect("1,000", "1000", true)).toBe(true);
    expect(isCorrect("57", "56", true)).toBe(false);
    expect(isCorrect("", "0", true)).toBe(false);
    expect(isCorrect("5.6", "56", true)).toBe(false);
    expect(isCorrect("fifty-six", "56", true)).toBe(false);
  });

  it("ignores capitals, spacing and a closing full stop in written answers", () => {
    expect(isCorrect("  paris ", "Paris")).toBe(true);
    expect(isCorrect("EL   PERRO.", "el perro")).toBe(true);
    expect(isCorrect("pari", "Paris")).toBe(false);
    expect(isCorrect("", "Paris")).toBe(false);
    expect(isCorrect("   ", "")).toBe(false);
  });

  it("keeps accents meaningful", () => {
    expect(isCorrect("nino", "niño")).toBe(false);
    expect(isCorrect("niño", "niño")).toBe(true);
  });

  it("accepts any listed alternative and shows the first", () => {
    expect(isCorrect("colour", "color|colour")).toBe(true);
    expect(isCorrect("Color", "color | colour")).toBe(true);
    expect(isCorrect("colr", "color|colour")).toBe(false);
    expect(shownAnswer("color | colour")).toBe("color");
    expect(shownAnswer("Paris")).toBe("Paris");
    expect(normalizeAnswer("  Hello   World!! ")).toBe("hello world");
  });
});

describe("building a run", () => {
  const cards = Array.from({ length: 12 }, (_, i) => ({ q: `7 × ${i + 1}`, a: String(7 * (i + 1)) }));

  it("shuffles without losing or inventing cards, and leaves the input alone", () => {
    const before = [...cards];
    const out = shuffle(cards, seeded(1));
    expect(out).toHaveLength(12);
    expect(new Set(out)).toEqual(new Set(cards));
    expect(cards).toEqual(before);
  });

  it("maths sets repeat to fill the run; a written deck is not padded", () => {
    expect(runLength(12, 20, true)).toBe(20);
    expect(runLength(12, 20, false)).toBe(12);
    expect(runLength(50, 20, false)).toBe(20);
    expect(runLength(0, 20, true)).toBe(0);
  });

  it("uses every card before repeating any", () => {
    for (const seed of [1, 2, 3, 99]) {
      const run = buildRun(cards, 20, seeded(seed));
      expect(run).toHaveLength(20);
      expect(new Set(run.slice(0, 12)).size).toBe(12);
    }
  });

  it("never asks the same card twice in a row", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const run = buildRun(cards.slice(0, 3), 40, seeded(seed));
      for (let i = 1; i < run.length; i++) expect(run[i], `seed ${seed} at ${i}`).not.toBe(run[i - 1]);
    }
  });

  it("handles one card and no cards", () => {
    expect(buildRun([cards[0]], 3, seeded(1))).toEqual([cards[0], cards[0], cards[0]]);
    expect(buildRun([], 20)).toEqual([]);
    expect(buildRun(cards, 0)).toEqual([]);
    expect(buildRun(cards, 5, seeded(4))).toHaveLength(5);
  });
});

describe("times and bests", () => {
  it("formats a time to the tenth", () => {
    expect(formatTime(0)).toBe("0.0s");
    expect(formatTime(42_340)).toBe("42.3s");
    expect(formatTime(59_960)).toBe("1:00.0");
    expect(formatTime(65_200)).toBe("1:05.2");
    expect(formatTime(-5)).toBe("0.0s");
    expect(formatTime(undefined)).toBe("0.0s");
  });

  const bests = [
    { id: "b1", member_id: "k1", deck_key: "math:mul:only:7", card_count: 20, best_ms: 40_000, best_date: "2026-10-01", run_count: 3, last_date: "2026-10-02" },
    { member_id: "k1", deck_key: "math:mul:only:7", card_count: 10, best_ms: 15_000, best_date: "2026-10-01", run_count: 1, last_date: "2026-10-01" },
    { member_id: "k2", deck_key: "math:mul:only:7", card_count: 20, best_ms: 30_000, best_date: "2026-10-01", run_count: 1, last_date: "2026-10-01" },
  ];

  it("finds a best by member, set and length", () => {
    expect(findBest(bests, "k1", "math:mul:only:7", 20).best_ms).toBe(40_000);
    expect(findBest(bests, "k1", "math:mul:only:7", 10).best_ms).toBe(15_000);
    expect(findBest(bests, "k1", "math:mul:only:8", 20)).toBeNull();
    expect(findBest(bests, "k3", "math:mul:only:7", 20)).toBeNull();
  });

  it("a first run is a best; later runs must be strictly faster", () => {
    expect(compareRun(50_000, null)).toEqual({ firstTime: true, isBest: true, deltaMs: 0 });
    expect(compareRun(39_000, bests[0])).toEqual({ firstTime: false, isBest: true, deltaMs: -1000 });
    expect(compareRun(40_000, bests[0]).isBest).toBe(false);
    expect(compareRun(43_500, bests[0])).toEqual({ firstTime: false, isBest: false, deltaMs: 3500 });
  });

  it("carries the best forward and counts every run", () => {
    const run = { member_id: "k1", deck_key: "math:mul:only:7", card_count: 20, label: "7 times table", duration_ms: 38_000, run_date: "2026-10-06" };
    expect(nextBest(bests[0], run, "unused")).toEqual({
      id: "b1", member_id: "k1", deck_key: "math:mul:only:7", card_count: 20, label: "7 times table",
      best_ms: 38_000, best_date: "2026-10-06", run_count: 4, last_date: "2026-10-06",
    });
    const slower = nextBest(bests[0], { ...run, duration_ms: 45_000 });
    expect(slower.best_ms).toBe(40_000);
    expect(slower.best_date).toBe("2026-10-01");
    expect(slower.run_count).toBe(4);
    expect(slower.last_date).toBe("2026-10-06");
    const first = nextBest(null, run, "new-id");
    expect(first.id).toBe("new-id");
    expect(first.best_ms).toBe(38_000);
    expect(first.run_count).toBe(1);
  });

  it("labels today and yesterday from the date it is given", () => {
    expect(dayLabel("2026-10-06", "2026-10-06")).toBe("Today");
    expect(dayLabel("2026-10-05", "2026-10-06")).toBe("Yesterday");
    expect(dayLabel("2026-09-30", "2026-10-01")).toBe("Yesterday");
    expect(dayLabel("2026-09-20", "2026-10-06")).not.toBe("");
    expect(dayLabel("bad", "2026-10-06")).toBe("");
  });
});

describe("gates mirror the row policies", () => {
  const adult = { id: "p1", role: "adult" };
  const kid = { id: "k1", role: "child" };

  it("the author or any adult edits a deck", () => {
    expect(canEditDeck(kid, { created_by: "k1" })).toBe(true);
    expect(canEditDeck(kid, { created_by: "p1" })).toBe(false);
    expect(canEditDeck(adult, { created_by: "k1" })).toBe(true);
    expect(canEditDeck(null, { created_by: "k1" })).toBe(false);
    expect(canEditDeck(kid, null)).toBe(false);
  });

  it("only adults see the family's times", () => {
    expect(canSeeFamily(adult)).toBe(true);
    expect(canSeeFamily({ id: "p2", role: "admin" })).toBe(true);
    expect(canSeeFamily(kid)).toBe(false);
    expect(canSeeFamily(null)).toBe(false);
  });

  it("a deck is findable by a word on one of its cards, not just its title", () => {
    const fields = searchableFields({ title: "Week 6", cards: '[{"q":"a steady beat","a":"rhythm"}]' });
    expect(fields).toContain("Week 6");
    expect(fields).toContain("rhythm");
    expect(fields).toContain("a steady beat");
  });
});
