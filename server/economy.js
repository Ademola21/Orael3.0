// ─────────────────────────────────────────────────────────────
//  Orael – Economy Constants (single source of truth)
// ─────────────────────────────────────────────────────────────
//
//  CALIBRATED AGAINST REAL ADSGRAM DATA (June 2026)
//  ───────────────────────────────────────────────────────────
//  Real weighted CPM (from Adsgram dashboard):
//     51 impressions, $0.114 total → $2.24 per 1,000 ad views
//
//  CORRECTED PEG (June 2026):
//     $1 = ₦1,500 (current market rate)
//     1 ORL = ₦0.02 → $1 = 75,000 ORL  (was 50,000 — math was wrong)
//
//  Revenue per single ad view:
//     $2.24 / 1000 = $0.00224 USD
//                  = ₦3.36  (at ₦1,500/$1)
//                  = 168 ORL (at ₦0.02/ORL peg)
//
//  PAYOUT RATIOS (all targets):
//     Per-ad revenue = 168 ORL
//     Target payout  = 22-28% (sweet spot: fair to users, safe for platform)
//     Per-ad reward   = 35-45 ORL range
//
//  Safe ceiling (30%): 50.4 ORL per ad
//  Referral envelope (L1 7% + L2 2% = 9%): true refuel cost = 40 × 1.09 = 43.6 ORL = 26% ✅
// ─────────────────────────────────────────────────────────────

/** ORL → NGN exchange rate (peg: 1 ORL = ₦0.02, so $1 = 75,000 ORL) */
export const ORL_TO_NGN = 0.02;

/** USD → NGN exchange rate */
export let USD_TO_NGN = 1350;

/** ORL per USD (derived from peg) */
export let ORL_PER_USD = Math.round(USD_TO_NGN / ORL_TO_NGN);

/** Fetch live exchange rate from open.er-api.com */
export async function fetchExchangeRate() {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    const data = await res.json();
    if (data && data.result === 'success' && data.rates && data.rates.NGN) {
      const rate = data.rates.NGN;
      if (rate >= 1000 && rate <= 2200) {
        USD_TO_NGN = Math.round(rate);
        ORL_PER_USD = Math.round(USD_TO_NGN / ORL_TO_NGN);
        console.log(`[economy] Updated exchange rate: $1 = ₦${USD_TO_NGN} (ORL per USD = ${ORL_PER_USD})`);
      } else {
        console.warn(`[economy] Fetched exchange rate out of sanity bounds: ${rate}`);
      }
    } else {
      console.warn('[economy] Failed to parse exchange rate data:', data);
    }
  } catch (err) {
    console.error('[economy] Error fetching exchange rate:', err.message);
  }
}

/** ORL earned per full tank session (one refuel ad = one tank) */
export const TANK_ORL = 100;

/**
 * Pre-ad mining cap: user can only mine this % of tank before forced refuel.
 * Pushes refuel conversions = more ad views = more revenue.
 * Set to 0.6 = 60% of tank drains freely, then engine stops until refuel.
 */
export const FREE_MINING_CAP = 0.6;

/**
 * Mining rig tiers — fixed-tank model.
 * Each rig pays out the SAME 40 ORL per refuel, but drains faster.
 * Faster drain → user refuels more often → more ad views → more revenue.
 * Per-ad payout ratio stays flat at ~24% regardless of rig level.
 */
export const RIGS = [
  { name: 'Rig I',   sessionMin: 240, cost: 0 },      // 4h
  { name: 'Rig II',  sessionMin: 200, cost: 8000 },   // 3h 20m
  { name: 'Rig III', sessionMin: 160, cost: 30000 },  // 2h 40m
  { name: 'Rig IV',  sessionMin: 120, cost: 90000 },  // 2h
  { name: 'Rig V',   sessionMin: 80,  cost: 250000 }, // 1h 20m
];

// ── Faucet ──────────────────────────────────────────────────
//  1 ad → 80 ORL
export const FAUCET_COOLDOWN = 60 * 60 * 1000;   // 1 hour in ms
export const FAUCET_REWARD   = 80;                // ORL per claim

// ── Lottery ─────────────────────────────────────────────────
//  ORL sink — removes coins from circulation, self-funds the prize pool.
export const LOTTO_TICKET_ORL = 750;

// ── Chest mini-game ─────────────────────────────────────────
//  5 ads to unlock → 450-550 ORL payout.
//  NO daily limit — users can fill chests unlimited (each requires 5 ads)
export const CHEST_GOAL       = 5;    // ads needed to unlock reward
export const CHEST_REWARD_MIN = 450;
export const CHEST_REWARD_MAX = 550;

// ── Spin-the-wheel ──────────────────────────────────────────
//  NO daily limit — each spin requires 1 ad
export const WHEEL_PRIZES  = [300, 150, 750, 0, 100, 50, 1500, 20];
export const WHEEL_WEIGHTS = [10, 16, 1, 20, 14, 20, 0.3, 18.7];

// ── Scratch card ────────────────────────────────────────────
//  NO daily limit — each scratch requires 1 ad
export const SCRATCH_PRIZES  = [20, 50, 100, 250, 600, 0];
export const SCRATCH_WEIGHTS = [38, 28, 20, 10, 1, 3];

// ── Coin Flip (NEW game) ────────────────────────────────────
//  Watch 1 ad, pick heads or tails.
//  Win: 160 ORL | Lose: 40 ORL consolation
//  EV = (0.5 * 160) + (0.5 * 40) = 100 ORL
//  NO daily limit — unlimited flips, each requires 1 ad
export const COINFLIP_WIN  = 160;
export const COINFLIP_LOSE = 40;

// ── Video Wall (unlimited watch & earn) ─────────────────────
//  Each video ad watched → 100 ORL
//  NO daily limit — users watch as many as they want
export const VIDEO_WALL_REWARD = 100;

// ── Daily Ad Challenge (milestone bonuses) ──────────────────
//  Milestone bonuses credited automatically when ad count is reached.
//  One-time per day per milestone. Resets at midnight.
export const AD_MILESTONES = [
  { ads: 10, bonus: 150 },
  { ads: 25, bonus: 300 },
  { ads: 50, bonus: 800 },
];

// ── Daily login streak ──────────────────────────────────────
export const STREAK_AMOUNTS = [150, 220, 350, 500, 700, 950, 1850];

// ── Session duration ────────────────────────────────────────
export const SESSION_MS = 4 * 60 * 60 * 1000; // 4 hours in ms (boost duration)

// ── Referral programme ──────────────────────────────────────
//  L1 7% + L2 2% = 9% extra on every mined ORL.
//  Refuel true cost: 40 × 1.09 = 43.6 ORL = 26% payout ratio ✅
export const REFERRAL_L1_PCT = 0.07; // 7% of referee earnings
export const REFERRAL_L2_PCT = 0.02; // 2% second-level

// ── Earn tasks ──
export const TASKS = [
  { id: 't1', title: 'Watch a sponsored video', sub: '15s · rewarded ad', reward: 100, url: '' },
  { id: 't2', title: 'Visit partner offer',     sub: 'Open link · 10s',  reward: 80, url: '' },
  { id: 't3', title: 'Daily quiz',              sub: 'Answer 1 question', reward: 80, url: '' },
];

export const FEATURED_TASKS = [
  { id: 'f1', title: 'Join Orael Bot',          sub: 'Open & start the bot', reward: 100, url: 'https://t.me/Orael_bot' },
  { id: 'f2', title: 'Follow Orael on X',        sub: 'Tap follow',           reward: 100, url: 'https://x.com/Orael_Network' },
  { id: 'f3', title: 'Subscribe Orael channel',  sub: 'Telegram',             reward: 100, url: 'https://t.me/Orael_Channel' },
];

// ── Tier Multipliers ────────────────────────────────────────
//  Tiers are passive multipliers stacked on top of base mining rate.
//  They DO NOT change per-ad payout — only mining speed.
//  Higher tier → faster tank drain → more refuels → more ad revenue.
export const TIER_MULTIPLIERS = {
  1: 1.0,
  2: 1.1,
  3: 1.25,
  4: 1.5,
  5: 2.0
};

export function getTierMultiplier(tier) {
  return TIER_MULTIPLIERS[tier || 1] || 1.0;
}

// ── Pro / Boost Multipliers ──────────────────────────────────
//  PRO: 250 Telegram Stars/mo (≈ $3.25/mo). Perks:
//    - 2× base mining rate (faster tank drain = more refuels = more ad revenue)
//    - 5% withdrawal fee (vs 10% for free users)
//    - 1 free mystery chest per day (no ad required, 200-280 ORL value)
//    - Priority withdrawals
//  NOTE: Pro users STILL watch ads for refuels (no more ad-free refuels).
//  Net profit per Pro user: $3.25 - $0.20 (free chest cost) = $3.05/mo ✅
//
//  BOOST: 1 ad → 1.2× speed for 4h. The boost ad's revenue pays
//         for the extra ORL mined during the boost window.
export const PRO_MULTIPLIER = 2.0;
export const BOOST_MULTIPLIER = 1.2;

// ── Withdrawal Configuration ────────────────────────────────
//  Fee: 10% for free users, 5% for Pro users (pure margin)
//  Methods vary by country (NG gets airtime + bank, others get USDT only)
export const WITHDRAWAL_FEE_PCT = 0.10;
export const WITHDRAWAL_FEE_PRO_PCT = 0.05;

// Manual approval threshold — withdrawals at or above this ORL amount
// require admin approval BEFORE being sent to Flutterwave.
// Below this threshold, withdrawals auto-process instantly.
export const MANUAL_APPROVAL_THRESHOLD_ORL = 100000; // 100k ORL ≈ ₦2,000

export const WITHDRAWAL_METHODS = {
  airtime: {
    name: 'Airtime',
    minOrl: 15000,
    fiat: '₦300',
    countries: ['NG'],
    icon: 'phone'
  },
  bank: {
    name: 'Bank (NGN)',
    minOrl: 50000,
    fiat: '₦1,000',
    countries: ['NG'],
    icon: 'bank'
  },
  usdt: {
    name: 'USDT (TRC20)',
    minOrl: 75000,
    fiat: '$1.00',
    countries: 'all',
    icon: 'crypto'
  },
};
