# phoropter.ai

Binary-choice therapeutic instrument powered by Lightward AI.

## Architecture

Pure static site: `index.html`, `style.css`, `app.js`, `README.md`. No build tools, no frameworks. Served via GitHub Pages at phoropter.ai.

- **Entry phase** (pre-rendered, no API): 4 binary pairs, cycling with "→ different question"
- **Session phase** (generative): calls `POST https://lightward.com/api/plain` with README.md contents as context
- **README.md** is fetched at runtime and used as the sole context for Lightward AI — it's the single source of truth for what the practitioner knows

## Payload format

```
[README.md contents]

---

[user's trajectory — only their positive choices, one per line]

[response instruction asking for two statement lines]
```

The AI's offered pairs are ephemeral — only what the user chose *toward* persists in the payload.

## Code structure

`app.js` has 4 sections:
1. **Data** — `Phoropter.*` constants and pure functions
2. **Pure functions** — `parseResponse`, `buildPayload`, `cycleIndex`, state serialization (all testable without DOM)
3. **Tests** — run in-browser before any UI renders, gate the app on all passing
4. **App** — DOM, events, API calls (only executes if tests pass)

## Design decisions

- User only interacts via binary choices — no free text input
- ☛ manicules lead each choice as tap/click affordance
- ⏿ (observer eye) is the mark/favicon
- Choice history accumulates above current pair (Typeform-style)
- "→ different question" in session doesn't add to trajectory — just re-requests
- Layout locks interactive area height during loading to prevent jumps
- Fathom analytics with events: entry select, entry cycle, session select, session cycle, start over
