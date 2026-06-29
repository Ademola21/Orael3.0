/* ========================================================================
   play.js — Play screen UI actions
   Wheel, scratch card, mystery chest, lottery, and leaderboard.
   All game outcomes come from the server — the client only animates.
   ======================================================================== */

import { api } from './api.js';
import { playAd } from './ads.js';
import { getState, updateState } from './state.js';
import { $, render, toast, reward, fmt, fmtInt } from './ui.js';
import { haptic } from './telegram.js';
import { launchConfetti } from './animations.js';

/* ---- Wheel constants ---- */
const WHEEL_PRIZES = [300, 150, 750, 0, 100, 50, 1500, 20];
const NUM_SEGMENTS = WHEEL_PRIZES.length;
const SEG_ANGLE    = 360 / NUM_SEGMENTS;

let wheelRot = 0;
let spinning = false;

/* ========================================================================
   BUILD WHEEL SVG
   ======================================================================== */

/**
 * Build the wheel SVG with 8 segments and copper accent text.
 * Must be called once on init.
 */
export function buildWheel() {
  const svg = $('wheel');
  if (!svg) return;

  const cx = 100, cy = 100, r = 100;
  let html = '';

  for (let i = 0; i < NUM_SEGMENTS; i++) {
    const a0 = (i * SEG_ANGLE - 90) * Math.PI / 180;
    const a1 = ((i + 1) * SEG_ANGLE - 90) * Math.PI / 180;

    const x0 = cx + r * Math.cos(a0);
    const y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);

    const fill = i % 2 === 0 ? '#241f1b' : '#2f2722';

    // Segment path
    html += `<path d="M${cx},${cy} L${x0},${y0} A${r},${r} 0 0 1 ${x1},${y1} Z" fill="${fill}" stroke="#3a312a" stroke-width="0.5"/>`;

    // Label text positioned at midpoint of segment
    const am = (a0 + a1) / 2;
    const tx = cx + r * 0.66 * Math.cos(am);
    const ty = cy + r * 0.66 * Math.sin(am);
    const label = WHEEL_PRIZES[i] === 0 ? '✕' : WHEEL_PRIZES[i];
    const rot = (i * SEG_ANGLE) + (SEG_ANGLE / 2);

    html += `<text x="${tx}" y="${ty}" fill="#e0a25b" font-size="13" font-family="Space Grotesk" font-weight="700" text-anchor="middle" dominant-baseline="middle" transform="rotate(${rot} ${tx} ${ty})">${label}</text>`;
  }

  svg.innerHTML = html;
}

/* ========================================================================
   WHEEL ANIMATION
   ======================================================================== */

/**
 * Animate the wheel to land on the server-provided prize index.
 * @param {number} prizeIndex — segment index (0-based)
 * @param {number} prizeAmount — ORL won
 */
function animateWheel(prizeIndex, prizeAmount) {
  if (spinning) return;
  spinning = true;

  const wheelEl = $('wheel');
  let currentAngle = wheelRot;

  if (wheelEl) {
    const style = window.getComputedStyle(wheelEl);
    const matrix = style.transform || style.webkitTransform;
    if (matrix && matrix !== 'none') {
      const values = matrix.split('(')[1].split(')')[0].split(',');
      const a = parseFloat(values[0]);
      const b = parseFloat(values[1]);
      let angle = Math.round(Math.atan2(b, a) * (180 / Math.PI));
      if (angle < 0) angle += 360;
      
      const currentFullRotations = Math.floor(wheelRot / 360);
      currentAngle = currentFullRotations * 360 + angle;
    }

    // Lock the wheel at its current visual angle
    wheelEl.style.transition = 'none';
    wheelEl.style.transform = `rotate(${currentAngle}deg)`;
    
    // Force reflow
    wheelEl.offsetHeight;
  }

  // Calculate target relative to the current visual angle
  const targetAngle = 360 - (prizeIndex * SEG_ANGLE + SEG_ANGLE / 2);
  const currentAngleMod = currentAngle % 360;
  let angleDiff = targetAngle - currentAngleMod;
  if (angleDiff <= 0) {
    angleDiff += 360;
  }
  wheelRot = currentAngle + 360 * 5 + angleDiff; // Spin 5 more times from the current position

  if (wheelEl) {
    // Smooth final landing transition curve
    wheelEl.style.transition = 'transform 4.5s cubic-bezier(0.15, 0.85, 0.35, 1)';
    wheelEl.style.transform = `rotate(${wheelRot}deg)`;
  }

  setTimeout(() => {
    spinning = false;
    if (wheelEl) wheelEl.style.transition = '';

    if (prizeAmount > 0) {
      reward(prizeAmount, 'Lucky spin!', 'Watch an ad to spin again!');
      // Confetti for big wins (500+ ORL)
      if (prizeAmount >= 500) {
        launchConfetti(60);
      }
    } else {
      toast('So close', 'No win this time');
    }
    render();
  }, 4700);
}

/* ========================================================================
   SETUP PLAY ACTIONS
   ======================================================================== */

/**
 * Wire all Play screen event listeners.
 */
export function setupPlay() {

  /* ---- Spin ---- */
  const spinBtn = $('spinBtn');
  if (spinBtn) {
    spinBtn.addEventListener('click', () => {
      if (spinning) return;
      spinning = true;

      const doSpin = async () => {
        const wheelEl = $('wheel');
        const prevRot = wheelRot;
        const preSpinTarget = wheelRot + 360 * 3; // pre-spin target angle (3 full spins)

        if (wheelEl) {
          // Immediately start slow rotation to avoid hanging feel
          wheelEl.style.transition = 'transform 10s linear';
          wheelEl.style.transform = `rotate(${preSpinTarget}deg)`;
        }

        try {
          const res = await api('/api/play/spin', { method: 'POST' });
          updateState(res);
          spinning = false; // Unlock so animateWheel can acquire the spin lock
          animateWheel(res.prizeIndex ?? 0, res.prizeAmount ?? 0);
        } catch (e) {
          spinning = false;
          if (wheelEl) {
            // Smoothly reset back to the stable starting position
            wheelEl.style.transition = 'transform 1s ease-out';
            wheelEl.style.transform = `rotate(${prevRot}deg)`;
          }
        }
      };

      playAd('Loading spin…', 'Watch an ad to spin the wheel.', 10)
        .then(doSpin)
        .catch(() => {
          spinning = false;
        });
    });
  }

  /* ---- Scratch card ---- */
  const scratchBtn = $('scratchBtn');
  if (scratchBtn) {
    scratchBtn.addEventListener('click', () => {
      const S = getState();
      if ((S.scratchLeft || 0) <= 0) {
        toast('No cards left', 'Come back tomorrow');
        return;
      }

      playAd('Loading card…', 'Scratch to reveal your prize.', 8, async () => {
        try {
          const res = await api('/api/play/scratch', { method: 'POST' });
          updateState(res);

          const prize = res.prizeAmount ?? 0;
          const card = $('scratch');
          if (card) {
            card.classList.remove('revealed');
            const prizeEl = $('scratchPrize');
            if (prizeEl) prizeEl.textContent = prize > 0 ? '+' + prize : '✕';

            card.onclick = () => {
              card.classList.add('revealed');
              card.onclick = null;
              if (prize > 0) {
                toast('Scratch win!', `+${prize} ORL`);
              } else {
                toast('No luck', 'Try the next one');
              }
              render();
            };
          }
          render();
        } catch (e) { /* handled */ }
      });
    });
  }

  /* ---- Mystery chest ---- */
  const chestBtn = $('chestBtn');
  if (chestBtn) {
    chestBtn.addEventListener('click', () => {
      playAd('Filling chest…', 'Each ad gets you closer to the loot.', 10, async () => {
        try {
          const res = await api('/api/play/chest', { method: 'POST' });
          updateState(res);

          if (res.chestOpened && res.prizeAmount) {
            reward(res.prizeAmount, 'Chest unlocked!', 'Big haul. Fill another one?');
            // Confetti for chest unlocks (always 200+ ORL)
            launchConfetti(40);
          } else {
            const S = getState();
            toast('Chest filling', `${S.chestProgress || 0}/5`);
          }
          render();
        } catch (e) { /* handled */ }
      });
    });
  }

  /* ---- Lottery: free ticket (ad) ---- */
  const lottoAdBtn = $('lottoAdBtn');
  if (lottoAdBtn) {
    lottoAdBtn.addEventListener('click', () => {
      playAd('Loading ticket…', 'Watch to grab a free entry.', 10, async () => {
        try {
          const res = await api('/api/play/lottery/ticket', {
            method: 'POST',
            body: { type: 'ad' },
          });
          updateState(res);
          render();
          toast('Ticket added', 'Good luck tonight');
        } catch (e) { /* handled */ }
      });
    });
  }

  /* ---- Lottery: buy ticket ---- */
  const lottoBuyBtn = $('lottoBuyBtn');
  if (lottoBuyBtn) {
    lottoBuyBtn.addEventListener('click', async () => {
      const S = getState();
      if (S.balance < 750) {
        toast('Not enough ORL', 'Need 750');
        return;
      }

      try {
        const res = await api('/api/play/lottery/ticket', {
          method: 'POST',
          body: { type: 'buy' },
        });
        updateState(res);
        render();
        toast('Ticket bought', 'Entry confirmed');
      } catch (e) { /* handled */ }
    });
  }

  /* ---- Coin Flip (NEW) ---- */
  const cfHeadsBtn = $('cfHeadsBtn');
  const cfTailsBtn = $('cfTailsBtn');
  const cfCoin = $('coinflipCoin');
  const cfResult = $('coinflipResult');

  function doCoinFlip(choice) {
    if (!cfCoin) return;
    if (cfCoin.classList.contains('flipping-heads') || cfCoin.classList.contains('flipping-tails')) return;

    if (cfResult) cfResult.textContent = 'Watching ad...';

    playAd('Loading coin flip…', 'Watch an ad to flip the coin.', 8)
      .then(async () => {
        if (cfResult) cfResult.textContent = 'Flipping...';
        
        // Reset state classes
        cfCoin.classList.remove('land-heads', 'land-tails', 'flipping-heads', 'flipping-tails');

        // Request outcome from server
        const apiPromise = api('/api/play/coinflip', {
          method: 'POST',
          body: { choice },
        });

        try {
          const res = await apiPromise;
          const isHeads = res.result === 'heads';

          // Trigger corresponding 3D animation
          cfCoin.classList.add(isHeads ? 'flipping-heads' : 'flipping-tails');

          // Wait exactly 2s (flip animation duration) before showing final result
          setTimeout(() => {
            cfCoin.classList.remove('flipping-heads', 'flipping-tails');
            cfCoin.classList.add(isHeads ? 'land-heads' : 'land-tails');

            updateState(res);
            render();

            if (cfResult) {
              cfResult.textContent = `Landed on ${res.result.toUpperCase()}! You won ${res.prizeAmount} ORL.`;
            }

            if (res.won) {
              reward(res.prizeAmount, 'You won the flip!', `Landed on ${res.result}.`);
              launchConfetti(25);
            } else {
              toast('Coin landed on ' + res.result, `+${res.prizeAmount} ORL consolation`);
            }
          }, 2000);

        } catch (e) {
          cfCoin.classList.remove('flipping-heads', 'flipping-tails');
          cfCoin.classList.add('land-heads');
          if (cfResult) cfResult.textContent = 'Pick heads or tails · win 160 ORL';
        }
      })
      .catch(() => {
        cfCoin.classList.remove('flipping-heads', 'flipping-tails');
        cfCoin.classList.add('land-heads');
        if (cfResult) cfResult.textContent = 'Pick heads or tails · win 160 ORL';
      });
  }

  if (cfHeadsBtn) cfHeadsBtn.addEventListener('click', () => doCoinFlip('heads'));
  if (cfTailsBtn) cfTailsBtn.addEventListener('click', () => doCoinFlip('tails'));

  // Render leaderboard initially
  renderLeaderboard();
}

/* ========================================================================
   RENDER: LEADERBOARD
   ======================================================================== */

/**
 * Render the leaderboard from state.
 * @param {Array} [data] — leaderboard entries
 */
export function renderLeaderboard(data) {
  const el = $('leaderboard');
  if (!el) return;

  const S = getState();
  const entries = data || S.leaderboard || [];

  let rows = '';

  if (entries.length) {
    rows = entries.map((n, i) => {
      const name = n.first_name || n.name || 'Anonymous';
      const amt = n.balance !== undefined ? fmtInt(n.balance) : 0;
      const initial = name.replace('@', '')[0].toUpperCase();
      const avHtml = n.photo_url
        ? `<div class="lb-av"><img src="${n.photo_url}" alt="" onerror="this.parentElement.textContent='${initial}'" /></div>`
        : `<div class="lb-av">${initial}</div>`;
      return `<div class="lb-row"><div class="lb-rank ${i < 3 ? 'top' : ''}">${i + 1}</div>
        ${avHtml}
        <div class="lb-name">${name}</div><div class="lb-amt">${amt} ORL</div></div>`;
    }).join('');
  } else {
    rows = `<div style="text-align:center;padding:20px;color:var(--ink-soft);font-size:13px">Leaderboard will update as users mine ORL.</div>`;
  }

  // Current user row
  const userInitial = S.firstName ? S.firstName[0].toUpperCase() : 'A';
  const rankStr = S._userRank ? S._userRank : '—';
  const userAvHtml = S.photoUrl
    ? `<div class="lb-av" id="lbAv"><img src="${S.photoUrl}" alt="" onerror="this.parentElement.textContent='${userInitial}'" /></div>`
    : `<div class="lb-av" id="lbAv">${userInitial}</div>`;
  rows += `<div class="lb-row lb-me"><div class="lb-rank">${rankStr}</div>${userAvHtml}
    <div class="lb-name">You<small>climb to reach the prize pool</small></div><div class="lb-amt">${fmtInt(S.balance)} ORL</div></div>`;

  el.innerHTML = rows;
}
