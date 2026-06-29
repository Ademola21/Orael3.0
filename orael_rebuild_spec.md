# Orael Rebuild Specification

This document provides a comprehensive, production-ready specification of the Orael backend and frontend architecture. It defines all features, variables, limits, database schemas, and UX behaviors conceptually. The rebuilding AI model should generate all backend API routing, database migrations, security configurations, and frontend layouts independently.

---

## 1. Project Philosophy & Design Guidelines

### Realistic Design Approach
- **Visual Feel**: The frontend must look and feel like a realistic, premium fintech application. The design must be custom-built and realistic, strictly avoiding default shiny designs, neon borders, glowing colors, or rainbow/neon gradients.
- **Custom Animated welcomed messages**: New users must be greeted with a custom-built, highly engaging animated welcome and onboarding sequence with a crazy, high-quality design.
- **Tutorial Walkthrough**: A full custom tutorial animation design must guide new users through refueling, upgrading rigs, earning rewards, and cashing out.
- **Custom Notifications**: Toast messages and alert overlays must use custom animations tailored to the visual aesthetic.

### Telegram-Only Constraint
- The application is a Telegram Mini App. It must verify signatures on startup using Telegram's initialization data.
- **Browser Access Restriction**: If a user attempts to open the application in a standard desktop or mobile web browser outside of Telegram, they must be greeted with a custom-designed browser gate page directing them to open the link in Telegram, blocking all API access.

---

## 2. Docker & Environment Configuration

The application must run inside a containerized Docker environment for single-command deployment.

### Container Requirements
- **Runtime**: Node.js environment setup using a multi-stage Docker build.
- **Volumes**: Persistent volume mounting for the SQLite database data directory and a separate volume for server log tracking.
- **Auto-restart**: Configured to restart unless stopped manually.
- **Ports**: Exposes the server port (default 3000) mapped to the host.
- **Health check**: A periodic curl or wget query to verify that the server's API health check endpoint returns successfully over HTTPS.
- **Log Rotation**: Docker logging driver configured with a maximum file size and file count limit to prevent server disk overflow.

### Environment Configuration Variables
All configurations must be loaded dynamically from a `.env` file containing:
- **Telegram Bot Token**: Credential for polling updates and sending messages.
- **Environment State**: Setting node environment (development/production) and server port.
- **Domain**: The target HTTPS domain URL.
- **Admin Accounts**: Comma-separated list of Telegram user IDs with full admin authorization.
- **Adsgram Configuration**: Reward block ID and Task wall block ID.
- **Adsgram Secret Key**: Secret signature verified for server-to-server ad callback crediting.
- **Flutterwave API keys**: Secret key (for Bearer auth API requests), webhook secret hash (for signature checks), and public/encryption keys.
- **Withdrawal Limits**: Customize daily, monthly, and single payout thresholds.

---

## 3. Database Schema

The database must use SQLite with runtime state persistence. All transactions, user states, payouts, and modifications must be logged.

### Table: Users
Tracks user credentials, balances, mining status, achievements, streaks, and security credentials.
- **User Identification**: Database ID (autoincrement), Telegram ID (unique, indexed), First Name, Last Name, Username, and Avatar Cached Photo URL.
- **Accounting**: Balance (current ORL tokens), Total Withdrawn, Total Ads Watched, and Role ('user', 'mod', 'admin') with Comma-separated Mod Permission List.
- **Mining Rig State**: Rig Level (active rig level index), Tank Mined (fuel consumed in current session), Last Accrue Time (timestamp of last accrual), Boost Until (boost expiry timestamp), and Pro Until (subscription expiry timestamp).
- **Faucet, Streak & Games**: Faucet Last (timestamp of last faucet claim), Streak Day (current consecutive login day 1-7), Streak Last Date (YYYY-MM-DD of last streak claim), Spin Date (last wheel spin YYYY-MM-DD), Spin Free Used (count of free spins today), Scratch Date (last scratch YYYY-MM-DD), and Scratch Left (kept for client compatibility).
- **Lottery & Referrals**: Lottery Date (date of current lottery pool ticket), Lottery Tickets (number of tickets owned for current draw), Referral Code (unique, indexed), Referred By (reference to referrer User ID), Referral Count (number of direct referrals), Referral Earnings (total commissions earned), and Active Referrals (count of active mining referrals).
- **Settings & Security**: Tier (multiplier tier level 1-5), Detected Country, Withdrawal PIN (SHA-256 hash of a 4-digit PIN salted with Telegram ID), Tutorial Seen (boolean status tracker), Ads Today Count (ad challenge counter), Ads Today Date (current ad date), Ad Milestones Claimed (list of daily milestones completed), and Pro Chest Last (last timestamp of daily Pro chest claim).
- **Timestamps**: Created At and Updated At.

### Table: Transactions
Ledger of balance changes.
- Database ID (autoincrement)
- User ID (foreign key reference)
- Transaction Type (refuel mining, faucet, spin, scratch, chest, coin flip, video wall, withdrawal request, withdrawal completed, withdrawal refund, pro chest, weekly leaderboard reward, referral level commissions, promo codes, admin adjustments)
- Amount (positive or negative decimal value)
- Description (custom reason or parameter log)
- Created At Timestamp

### Table: Completed Tasks
- User ID
- Task ID
- Completed At Timestamp
- *Composite Primary Key*: User ID and Task ID

### Table: Lottery Pools
- Draw Date (YYYY-MM-DD Primary Key)
- Total Pool (aggregate ORL tokens in the draw)
- Total Tickets (aggregate tickets purchased)
- Winner User ID (referencing users)
- Drawn Status (boolean status flag)
- Created At Timestamp

### Table: Withdrawals
- Database ID (autoincrement)
- User ID (foreign key reference)
- Withdrawal Method (airtime, bank, usdt)
- Amount ORL (gross amount requested)
- Fee ORL (fee deducted based on user tier)
- Net Amount (final ORL payout)
- Net Fiat (formatted reward, e.g. "₦1,000" or "$1.50 USDT")
- Status (needs_approval, pending, completed, rejected)
- Wallet Info (bank details, phone number, or TRC20 wallet address)
- Flutterwave Transfer ID (API reference)
- Flutterwave Transaction Reference (unique merchant transaction reference)
- Flutterwave Status (status message returned by payment processor)
- Failure Reason (error details if payout failed)
- Created At Timestamp
- Processed At Timestamp

### Table: Bank Accounts
Saves verified payout details. Max 3 per user.
- Database ID (autoincrement)
- User ID (foreign key reference)
- Account Number (NUBAN)
- Account Bank (Bank code)
- Bank Code (identical bank representation)
- Bank Name
- Account Name
- Created At Timestamp

### Table: Promo Codes
- Code String (Primary Key)
- Reward ORL (token payout amount)
- Max Uses (limit, 0 for unlimited)
- Uses Count (number of redemptions)
- Expires At Timestamp
- Active Status (boolean)
- Created At Timestamp

### Table: Promo Redemptions
- Database ID (autoincrement)
- User ID (foreign key reference)
- Code String (referencing promo_codes)
- Reward ORL
- Redeemed At Timestamp
- *Unique Constraint*: User ID and Code String

### Table: Achievements
- User ID (foreign key reference)
- Achievement ID (identifying string)
- Unlocked At Timestamp
- *Composite Primary Key*: User ID and Achievement ID

### Table: Weekly Leaderboard
- Week Start (YYYY-MM-DD string Primary Key)
- User ID (foreign key reference)
- Rank Level (position 1-20)
- Balance (snapshot of balance at draw time)
- Reward Paid (token bonus received)
- Snapshot At Timestamp

### Table: Audit Log
Tracks sensitive administrative operations.
- Database ID (autoincrement)
- Actor User ID (null if system action)
- Actor Role ('system', 'user', 'mod', 'admin')
- Action Name
- Target User ID
- Details (JSON representation of parameters)
- IP Address
- Created At Timestamp

---

## 4. Mining & Economy Engine

### Authorized Economic Pegs
- **Token Value**: 1 ORL = ₦0.02 (Authoritative peg).
- **Exchange Rate**: $1 USD = ₦1,500 NGN (Fetched and synchronized from open.er-api.com every 12 hours).
- **Conversion rate**: 1 USD = 75,000 ORL.

### Refuel-to-Mine Mechanics
- **Tank Capacity**: 100 ORL per refuel.
- **Mining Rate**: A full tank depletes over the course of `sessionMin` determined by rig level.
- **Refuel Cooldown**: Watching 1 ad refuels the tank and resets the accrual timestamp.
- **Free Mining Cap**: Free users can mine up to 60% of the tank capacity before the engine stops and requires a refuel ad.

### Mining Rigs
Rigs pay out the same 100 ORL per refuel but drain faster, driving more ad impressions:
- **Rig I**: sessionMin = 240 minutes (4h) | Cost: 0 ORL
- **Rig II**: sessionMin = 200 minutes (3h 20m) | Cost: 8,000 ORL
- **Rig III**: sessionMin = 160 minutes (2h 40m) | Cost: 30,000 ORL
- **Rig IV**: sessionMin = 120 minutes (2h) | Cost: 90,000 ORL
- **Rig V**: sessionMin = 80 minutes (1h 20m) | Cost: 250,000 ORL

### Tier Multipliers
Speed multipliers stack on top of base hashrate based on user progress (balance or referrals):
- **Tier 1**: 1.0x (Default)
- **Tier 2**: 1.1x (Requires: balance >= 5,000 ORL or L1 referrals >= 3)
- **Tier 3**: 1.25x (Requires: balance >= 25,000 ORL or L1 referrals >= 10)
- **Tier 4**: 1.5x (Requires: balance >= 100,000 ORL or L1 referrals >= 25)
- **Tier 5**: 2.0x (Requires: balance >= 500,000 ORL or L1 referrals >= 100)

### Pro Membership
- **Price**: 250 Telegram Stars / Month.
- **Perks**:
  - 2.0x base mining rate speed multiplier.
  - 5% withdrawal fee (instead of 10% on free tier).
  - One free daily Mystery Chest (150-200 ORL value, no ads required).
  - Priority withdrawal processing.
  - Exclusive Pro badge.
  - *Note*: Pro members must still watch ads to refuel their tanks.

---

## 5. Earn & Mini-Games Features

All features must run server-authoritative calculations, using Adsgram rewarded video triggers:

### Coin Flip
- **Interface**: A custom-designed coin flip animation.
- **Cost**: Watch 1 ad. Choose Heads or Tails.
- **Reward**: Win pays 160 ORL | Loss pays 40 ORL consolation.
- **Limit**: Unlimited.

### Faucet
- **Cost**: Watch 1 ad.
- **Reward**: 80 ORL.
- **Cooldown**: 1 hour.

### Mystery Chest
- **Cost**: Watch 5 ads (saves progress between ads).
- **Reward**: Random range between 450 - 550 ORL.
- **Limit**: Unlimited.

### Lucky Spin
- **Interface**: A custom-designed spin wheel animation.
- **Cost**: Watch 1 ad.
- **Reward**: Wheel spin. Prizes: [300, 150, 750, 0, 100, 50, 1500, 20] with corresponding weights: [10, 16, 1, 20, 14, 20, 0.3, 18.7].
- **Limit**: Unlimited.

### Scratch Card
- **Cost**: Watch 1 ad.
- **Reward**: Scratch. Prizes: [20, 50, 100, 250, 600, 0] with corresponding weights: [38, 28, 20, 10, 1, 3].
- **Limit**: Unlimited.

### Video Wall
- **Cost**: Watch 1 ad.
- **Reward**: 100 ORL.
- **Limit**: Unlimited.

### Daily Login Streak
- Payout advances sequentially: 150, 220, 350, 500, 700, 950, 1850 ORL.
- Claiming resets progress if a consecutive day is missed. Progress wraps back to Day 1 after Day 7.

### Daily Ad Challenge
- Automatic milestone bonuses credited based on daily ad counts:
  - 10 ads -> +150 ORL
  - 25 ads -> +300 ORL
  - 50 ads -> +800 ORL

### 2-Tier Referral Commissions
- **Level 1 (Direct)**: Direct referrer gets 7% of mined tokens in real-time.
- **Level 2 (Indirect)**: Secondary referrer gets 2% of mined tokens.

---

## 6. Payment & SDK Integrations

### Flutterwave SDK Integration
Production-grade integration interfacing with Flutterwave v3 API:
- **List Banks**: Fetch bank details via banks endpoint, cached locally for 1 hour.
- **Resolve Account**: Resolve account details via resolve endpoint sending account number and bank code. Validate 10-digit NUBAN structures.
- **Initiate Transfer**: Call transfers endpoint using unique reference and retry exponential backoffs on HTTP 429.
  - Payout currency: NGN. Narration: "Orael payout — [User ID]".
- **Airtime dispatch**: Call bills endpoint (type: "AIRTIME"). Phone numbers must be normalized to +234 format.

#### Webhook Handlers
- Public endpoints must handle incoming Flutterwave events.
- Protect handler with constant-time webhook signature verification comparing request header `verif-hash` directly to the server webhook secret.
- Process incoming event payloads:
  - **transfer.completed**: Check status. If successful, finalize withdrawal. If failed, reject withdrawal, refund user balance, write refund transaction, and notify user.
  - **singlebillpayment.status**: Check status. If successful, mark completed. If failed, reject status and refund user.

### USDT (TRC20) Payouts
- USDT cashouts are processed manually.
- System must validate that user inputs start with a capital "T" followed by 33 or 34 alphanumeric characters.
- Withdrawal is logged as needs_approval. Admin processes payouts via the dashboard.

---

## 7. Security Architecture & Controls

### Request Integrity & Authing
- **InitData Verification**: Authenticate all API endpoints (except public callbacks) by extracting the Telegram initialization header. Compute and compare HMAC-SHA256 signatures with the Bot Token as the key. Block requests where authorization date is older than 24 hours.
- **Sliding-Window Rate Limiting**:
  - General routes: 120 requests/minute.
  - Transactional/game actions: 20 requests/minute.
  - Critical/sensitive calls (PIN verify, withdraw): 5 requests/minute.
- **Sanitized Headers**: Apply security headers (nosniff, DENY frame, XSS protection). Content-Security-Policy (CSP) must whitelist only self, Telegram, and Adsgram hosts. Strict-Transport-Security (HSTS) must be enforced in production for 1 year. Permissions-Policy must disable camera, microphone, and geolocation.
- **Payload Restrictions**: Restrict request payloads to 10kb to prevent DoS attacks.

### Withdrawal Safeguards
- **Withdrawal PIN**: Required for all cashouts. Salted SHA-256 hash of a 4-digit PIN. Block weak setups (e.g. "0000", "1234").
- **Caps & Thresholds**:
  - Max single withdrawal: 200,000 ORL.
  - Daily cap: 500,000 ORL.
  - Monthly cap: 5,000,000 ORL.
  - Pending limits: User can only have 1 pending withdrawal at a time.
- **Manual Approvals**: Transfers equal to or exceeding 100,000 ORL (₦2,000) must stop at needs_approval and require manual admin approval before API calls trigger. USDT cashouts always require approval.

---

## 8. Background Cron Jobs & Automation

The backend must execute background tasks via scheduled timers:
- **Stuck Withdrawal Recovery**: Runs every 15 minutes. Find withdrawals in pending status older than 1 hour with active transfer IDs. Re-query status; if confirmed successful, finalize. If failed, refund user balance.
- **Weekly Leaderboard Rewards**: Runs Sundays at midnight. Distributes a 50,000 ORL weekly pool to the top 20 balance holders, allocated proportionally based on their share of the total balance.
- **Database Backup**: Runs at 3 AM daily. Backup SQLite file to a date-stamped file and maintain a sliding retention window of the last 14 backups.

---

## 9. Admin & Moderation Panel

Admins and Moderators require a clean administrative panel to control operations.

### Roles & Granular Permissions
- **Super Admin**: Defined in admin environment variables.
- **Moderators**: Users promoted to roles by admins, with granular permissions:
  - `view_users`: list all users and query search filters.
  - `ban_users`: block or unblock user access.
  - `adjust_balance`: credit or debit balances (with transaction ledger audit trails).
  - `process_withdrawals`: approve or reject pending withdrawals, triggering payment APIs.
  - `view_transactions`: view the global ledger.
  - `manage_mods`: promote users and configure mod permissions.

### Admin Features
- **Re-query stuck withdrawals**: Manual trigger to poll Flutterwave.
- **Bulk Payout Processing**: Approve or reject multiple pending withdrawals at once.
- **DB Backups**: Manual trigger to run immediate backup.
- **Promo Code Engine**: Create promo codes specifying ORL reward, max uses, and expiry times. Deactivate codes.
- **System Stats**: Display dashboard metrics (total users, aggregate balance, total mined, withdrawals, Pro users, banned list).

---

## 10. Notifications Engine

The system must send automated notifications via the Telegram Bot API on the following events:
- **Withdrawal Pending**: User requested large cashout; notified that review is processing.
- **Admin Warning**: Alert admins that a withdrawal requires approval.
- **Withdrawal Completed**: Payout confirmed, notification showing amount, method, and net fiat received.
- **Withdrawal Failed**: Transfer failed, notified of refund to balance with cause.
- **Pro Activation**: Welcome message detailing Pro privileges.
- **Lottery Win**: Winner notified of drawing and ORL prize value.
- **Achievement Unlocked**: Custom badge unlock alert.
