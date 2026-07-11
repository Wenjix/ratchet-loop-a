# Ratchet — Loop A Prototype

**A household of AI agents that has to *earn* the right to spend your money — one errand at a time — and loses it instantly the first time it fails you.**

---

## The idea, in plain terms

Imagine a household with four software helpers: one keeps the budget, one keeps the calendar, one hires outside businesses, and one inspects the work. The businesses they hire — a lawn service, a grocer, a plumber — are *other people's* agents, out beyond the household's fence.

At the start, **every purchase asks you first**. The lawn mowing costs $45? A card lands in your inbox; nothing happens until you approve. But the household is watching its own track record. After **three clean jobs in a row** with the same vendor, for the same kind of errand, in the same price range, it comes to you with a proposal: *"May I stop asking about this one? I'll never go above $60.50."* Say yes, and that errand runs on its own — still inspected, still budgeted, just no longer asking.

Then the grocer shorts a delivery. **The standing permission is withdrawn on the spot** — not next week, not after a review meeting. The grocery errand goes back to asking you every time, and it must wait two quiet weeks before it can even start rebuilding its streak. When it eventually earns the permission back, the repair is deliberately left visible — like a bowl mended with gold.

And some things — the plumber, in this demo — are **never allowed to stop asking**, no matter how flawless the track record. You decide which.

That two-way movement — trust ratcheting up through evidence, snapping down through failure — is **Loop A**.

## Why this matters

Most agent demos show the easy half: agents doing work. The hard half is the *authority* question — how a human safely delegates spending power to agents that deal with **other people's agents**, and how that delegation stays revocable. Two problems usually get conflated:

- **Orchestration** — one owner, many agents, shared goals, inside one trust boundary. (Solved-ish; every framework does this.)
- **Coordination** — many owners, no shared boss, misaligned interests: discovery, credentialing, commitment, verified execution, payment, recourse.

This prototype focuses on the seam between them: the **human-to-agent trust layer** that decides what may cross the boundary without asking. The coordination rails themselves — vendor registry, mandates, escrow, settlement — are simulated in-memory stand-ins for the emerging protocol stack (MCP/A2A for agent discovery and messaging, ERC-8004-style identity/reputation registries, AP2 mandates, x402 payments). No blockchain, no real money: the point is the *mechanism*, reproducibly.

## Vocabulary — plainly and precisely

| Term | Plainly | Precisely |
|---|---|---|
| **Decision class** | "One kind of errand, with one vendor, in one price range" | The tuple `agent:action:counterparty:task_type:amount_band` — trust attaches to this whole key, never to a vendor globally |
| **Mandate** | A purchase order waiting for a yes | A commitment record with an escrow lifecycle: `pending_approval → committed → settled \| disputed \| rejected` |
| **Escalate / surface / auto** | Asks every time / proposal on the table / runs on its own | The class's status ladder; `surface` is the moment a crystallization proposal awaits a one-time human ruling |
| **Crystallization** | "May I stop asking about this one?" | 3 consecutive clean outcomes → engine proposes a standing policy, `cap = highest recent price × 1.1`; a human accepts, edits, or rejects — once |
| **De-ratchet** | One bad job, trust gone — instantly | A verified-bad outcome or human override → policy revoked (kept, marked, never deleted), streak zeroed, 2-week cooldown before streaks may regrow |
| **Ceiling** | "Some things always ask" | A per-class clamp on how far status may ever ratchet; the plumbing class is pinned at `escalate` |
| **Verification** | The inspector who checks the work before money moves | The completion oracle: rules each job `good` (escrow released, reputation +0.05, streak +1) or `bad` (refunded, −0.15, instant de-ratchet). In this prototype the verdict comes from seeded vendor attestations so the demo is reproducible; in production this seam is where real evidence plugs in |

## The demo — nine seeded weeks

Three vendor arcs run side by side, deterministically (no API keys, no network, no LLM calls in the scenario path):

- **GreenBlade Lawn Care** — the clean arc: three good weeks, a policy crystallizes, autonomy holds to the end.
- **FreshCart Grocery** — the full loop: crystallizes at week 3, seeded bad delivery at week 4 (revocation, dormancy), re-earns its policy by week 9 — mended, with the seam left gold.
- **QuickFix Plumbing** — the ceiling: nine flawless jobs that never become autonomy, proving trust is granted per decision class, not per vendor performance.

The dashboard renders this as a calm "washi daylight" garden: household agents inside a hand-drawn boundary, vendors on signposts beyond it, every interaction drifting as a mote through one gate. Escalated mandates visibly detour to a **principal** mark (the human) and get a hanko seal on approval; policy-covered mandates skip the detour — the missing stop *is* the standing policy. Trust grows as plants (streaks are growth rings; the pinned plumbing class is a bonsai), the week-4 revocation plays as a hush and a ceramic crack rather than an alarm, and the week-9 repair fills that same crack with gold. Each week ends with a debrief card; an opening card introduces the cast; rules are stated once, the moment they first fire.

## Architecture

```
┌────────────────────────────  browser  ─────────────────────────────┐
│  web/  ·  Vite + Svelte 5 dashboard ("washi daylight")             │
│  one runes store ← hydrate (GET /api/state) + live SSE stream      │
└──────────────▲──────────────────────────────▲──────────────────────┘
               │ REST (approve / reject /     │ SSE  /api/events
               │ override / policies / run)   │ (one event funnel)
┌──────────────┴──────────────────────────────┴──────────────────────┐
│  src/server/       Express :3300 — routes + bus→SSE bridge         │
│  src/scenario/     seeded 9-week driver (pacing, lifecycle events) │
│  src/agents/       Budget · Scheduler · Sourcing · Verification    │
│                    (deterministic tool executors; LLM loop only    │
│                    for interactive /api/command)                   │
│  src/loop-a/       the trust engine — decision classes,            │
│                    crystallize / de-ratchet / ceilings             │
│  src/coordination/ vendor registry · escrow ledger (simulated      │
│                    Web-4.0 rails)                                  │
│  src/vendors/      vendor agents with seeded quotes/attestations   │
│  src/core/         in-memory world state + event bus · swappable   │
│                    LLM provider (Anthropic/OpenAI) · UI formatting │
└─────────────────────────────────────────────────────────────────────┘
```

**How a week flows:** Scheduler flags a task due → Sourcing takes the vendor's quote and drafts a mandate → Loop A checks the decision class (auto-commit under a live policy, otherwise escalate to the principal) → on commit, escrow holds the funds → the vendor reports completion → Verification rules good/bad → escrow settles or refunds, reputation and budget update, and the outcome feeds the class's streak → any pending crystallization proposal goes to the human. Every state change is emitted on an in-process event bus and bridged to the browser over a single SSE stream — the frontend is a pure listener with one reducer.

**Design properties worth knowing:**

- **Deterministic demo.** The seeded scenario calls the agents' tool executors directly — no LLM, no keys, millisecond-fast unpaced. Pacing (`stepMs` / `cycleDelayMs` / `approverDelayMs` on `POST /api/scenario/run`) is what makes it watchable; a run guard 409s concurrent starts and `POST /api/scenario/stop` cancels.
- **LLM layer is real but optional.** The agents carry full Claude tool-use loops (swappable to OpenAI via `LLM_PROVIDER`); the interactive `POST /api/command` voice/direct path uses them. The demo never does.
- **In-memory by design.** World state, escrow, reputations, and decision classes reset per run; persistence is out of scope for the prototype.
- **Human decisions are first-class events.** The inbox routes broadcast `principal_action` frames, so the UI can distinguish a real by-hand click from the demo's simulated principal.


## Setup

```bash
npm install
npm run web:install    # frontend workspace (web/)
npm run build          # builds the dashboard into web/dist
cp .env.example .env   # optional — ANTHROPIC_API_KEY only needed for /api/command
```

The demo itself needs **no API keys at all**.

## Run it

**Dashboard (recommended):**

```bash
npm start   # serves the built web/dist at http://localhost:3300
```

Open the page and click **▶ Begin the nine weeks**. Watch for: streaks growing weeks 1–3 → two crystallizations → the week-4 hush, crack, and dormancy → the week-9 gold seam → the plumbing bonsai that never blooms. Escalated mandates linger in the Approval Inbox long enough to approve or reject one by hand — your decision drives the real endpoints and earns a "by hand" seal.

**Frontend development** (Vite HMR on :5173, `/api` proxied to :3300):

```bash
npm start        # terminal 1 — API + SSE
npm run dev:web  # terminal 2 — Vite dev server
```

**CLI, no browser:**

```bash
npm run demo     # prints every mandate, verdict, and policy decision as JSON lines
```

## Tests

```bash
npm test         # node --test — engine, agents, coordination, driver, API/SSE
```

## LLM provider

`LLM_PROVIDER` selects which SDK the interactive agents call: `anthropic` (default) or `openai`. Set the matching `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`. `ANTHROPIC_MODEL`/`OPENAI_MODEL` optionally override the default model string (`claude-sonnet-4-6` / `gpt-4o`). OpenAI model availability changes over time — if `gpt-4o` isn't available on your account, set `OPENAI_MODEL` to whatever tool-calling-capable model you do have access to.
