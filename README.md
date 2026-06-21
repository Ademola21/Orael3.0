# Orael — Telegram Mini App

AI mining faucet. Users trade attention (rewarded ads) for mining energy.
"Refuel-to-Mine" loop: a virtual engine mines ORL for 3 hours, then runs out
of fuel; one rewarded ad refuels it to 100%. Optional ad unlocks a 1.2× boost.

**Live:** https://yorubacinemax.xyz

## Design

"Engine room" language — warm near-black surfaces, a single machined-copper
accent, analog instrument gauge, tactile cards, fine grain. No neon, no rainbow
gradients. Built to read as premium fintech, not a casino tap-game.

## Economy Model

All reward values are calibrated against **real Adsgram CPM data ($2.24)** and
locked to a 65%+ gross margin. See:
- **`ECONOMY_CALCULATIONS.md`** — per-feature reward breakdown with proof math
- **`FINANCIAL_MODEL.md`** — full production financial model + revenue projections

### Monetization (what pays you)
1. ✅ **Adsgram rewarded video** (block 35273) — used by Refuel, Boost, Spin,
   Scratch, Chest, Faucet, Task verification
2. ✅ **Adsgram Tasks** web component (block task-35279) — task-wall with
   server-to-server crediting via `/api/adsgram-callback`
3. ✅ **Telegram Stars** — Orael Pro subscription (250 XTR/mo ≈ $3.25/mo)

> ❌ Offerwalls (Mmwall, ayeT-Studios, BitcoTasks) were removed — they don't
> support Telegram Mini Apps.

## Architecture

```
Orael/
├── index.html              # Single-page app shell (4 screens)
├── src/                    # Frontend (vanilla JS + Vite)
│   ├── main.js             # Boot sequence + render loops
│   ├── api.js              # Fetch wrapper (attaches Telegram initData)
│   ├── state.js            # State store + localStorage cache
│   ├── telegram.js         # Telegram WebApp SDK wrapper
│   ├── ui.js               # Master render() — runs every second
│   ├── ads.js              # Adsgram rewarded ad player
│   ├── mining.js / play.js / earn.js / wallet.js
│   └── styles/             # 8 CSS files — "Engine Room" design system
├── server/                 # Express.js backend
│   ├── index.js            # Express app + Adsgram callback endpoint
│   ├── bot.js              # Telegram bot (long-polling, Pro payments)
│   ├── db.js               # SQLite schema + helpers + lottery drawing
│   ├── auth.js             # Telegram initData HMAC verification
│   ├── economy.js          # All economy constants (single source of truth)
│   ├── middleware/rateLimit.js
│   ├── routes/             # user, mining, play, earn, wallet, leaderboard
│   └── services/           # mining accrual, 2-tier referral commission
├── data/orael.db           # SQLite database (gitignored in production)
├── ECONOMY_CALCULATIONS.md # Per-feature reward math (transparent)
└── FINANCIAL_MODEL.md      # Full production financial model
```

## The Four Screens

1. **Miner** — Balance card + hourly faucet + analog engine gauge + Refuel /
   Boost buttons + Mining rig upgrade (Rig I → V)
2. **Play** — Lucky Spin, Scratch & Win (3/day), Mystery Chest (5 ads), Daily
   Lottery, Weekly Leaderboard
3. **Earn** — Adsgram Tasks widget + Daily streak (7 days) + Watch & Earn tasks
   + Featured partners + Invite (10% L1 / 3% L2 referral)
4. **Wallet** — Withdrawal UI (Bank NGN / USDT) + Orael Pro subscription via
   Telegram Stars

## Development

```bash
npm install
npm run dev      # Start server + Vite client + Telegram bot (concurrent)
npm run build    # Production build → dist/
npm start        # Production server + bot
```

## Environment Variables

```
BOT_TOKEN=                  # From @BotFather
PORT=3000                   # Server port
NODE_ENV=development
DOMAIN=https://yourdomain.com
VITE_ADSGRAM_BLOCK_ID=35273
VITE_ADSGRAM_TASK_BLOCK_ID=task-35279
ADSGRAM_SECRET=             # From Adsgram dashboard (for callback verification)
```

