# Practice Decks

A [Chickadee Bandit](https://chickadeebandit.com/app-library/practice-decks) app.

Timed flash card runs. Times tables and other maths facts are built in, and anyone can add a deck: this week's spelling words, capitals, vocabulary. Beat your best time for each set.

## Features

- Maths facts are built in: times, divide, add and take away. Pick one table ("just the 7s") or everything up to a number.
- A run is 10, 20 or 40 cards against the clock. The answer is typed.
- A wrong answer shows the right one, which must be typed before moving on. The clock keeps running, so a miss costs time.
- Each set and length keeps a best time. The result screen says how far off it the run was, and lists the cards worth another look.
- Anyone can write a deck, one card per line. A flash card deck asks a question; a spelling deck reads each word aloud.
- A deck is for the whole family, or private to its author and the adults.
- Adults get a Family tab with every member's bests and recent runs.

## Writing a deck

Flash cards, one per line, question then answer:

```
France = Paris
Japan = Tokyo
colour (US) = color|colour
```

Put `|` between answers to accept more than one. Capitals, extra spaces and a closing full stop are ignored; accents are not.

Spelling words, one per line, with an optional hint:

```
necessary
rhythm = a steady beat
```

Each word is read aloud. **Peek** shows the word for a moment, and counts it as not right first time. A device that cannot speak shows each word briefly instead.

## Who can do what

| | Child | Adult |
|---|---|---|
| Use a family deck | Yes | Yes |
| See a private deck | Their own | Every one |
| Write a deck | Yes | Yes |
| Change or delete a deck | Their own | Any |
| See times and bests | Their own | Everyone's |
| Change or remove a recorded run | No | Yes |

The hub enforces every row of this table through the `row_policies` in `manifest.json`. `scenarios.json` replays each rule against the real runtime.

A time is whatever the member's own device reports. It is good for beating your own best, and is not proof of anything to anyone else.

## Events

| Event | When | Payload |
|---|---|---|
| `practice-decks.run_completed` | A run is finished. Once per set, length and day. | `member_id`, `deck_key`, `cards`, `missed`, `duration_ms`, `personal_best` |

The member who ran it is the event's `subject_id`. `deck_key` is `math:<op>:<only or upto>:<n>` for a built-in set, such as `math:mul:only:7`, and `deck:<id>` for a written deck.

## Install

In your hub, go to **Apps → Install from URL** and paste:

```
https://github.com/firebirdsystems/chickadeebandit-practice-decks/releases/latest/download/bundle.json
```

## Development

```bash
make setup     # once: enables the pre-push hook
npm install
npm run dev    # http://localhost:3001, with demo data and a "preview as" bar
npm test
npm run build
```

Pure logic lives in `src/logic.js` and is tested in `__tests__/logic.test.mjs`. See the [app-template](https://github.com/firebirdsystems/chickadeebandit-app-template) for the full manifest field reference.
