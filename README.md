# Ratchet — Loop A Prototype

A working prototype of Ratchet's Loop A mechanism: approvals crystallizing into standing policy, bidirectionally. Demonstrated through a household-procurement multi-agent scenario — Budget, Scheduler, Sourcing, and Verification agents (real Claude tool-use agents) coordinating with simulated external vendor agents (GreenBlade Lawn Care, FreshCart Grocery, QuickFix Plumbing) through a registry and escrow ledger.

Full design: `docs/superpowers/specs/2026-07-10-loop-a-household-ops-design.md`.

## Setup

```bash
npm install
cp .env.example .env   # then set ANTHROPIC_API_KEY
```

## LLM provider

`LLM_PROVIDER` selects which SDK the agents call: `anthropic` (default) or `openai`. Set the matching `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`. `ANTHROPIC_MODEL`/`OPENAI_MODEL` optionally override the default model string (`claude-sonnet-4-6` / `gpt-4o`). OpenAI model availability changes over time — if `gpt-4o` isn't available on your account, set `OPENAI_MODEL` to whatever tool-calling-capable model you do have access to.

## Run the tests

```bash
npm test
```

## Run the seeded demo

Two ways to see the full 9-cycle Loop A arc (clean ratchet-up, ratchet-up → de-ratchet → re-crystallize, permanently-pinned-at-ceiling):

**CLI, no browser:**
```bash
npm run demo
```
Prints every mandate, approval, verification, and policy decision as JSON lines to stdout.

**Dashboard, live in a browser:**
```bash
npm start
```
Open `http://localhost:3300`, click "Run Scenario," and watch the Decision Feed, Coordination Graph, Policy Ledger, and Approval Inbox update live over SSE.

## What to look for

- **GreenBlade Lawn Care** (`lawn_mowing`) crystallizes cleanly after 3 good cycles, then auto-executes for the rest of the run.
- **FreshCart Grocery** (`grocery_restock`) crystallizes at cycle 3, hits a seeded bad delivery at cycle 4 (policy revoked, visible struck-through in the Policy Ledger), sits at `escalate` through a 2-cycle cooldown, then re-crystallizes by cycle 9.
- **QuickFix Plumbing** (`plumbing_repair`) never crystallizes — its decision class is pinned at `ceiling: escalate` regardless of streak, proving trust is earned per decision class rather than granted globally.
