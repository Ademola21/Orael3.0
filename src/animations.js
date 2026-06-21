/* ========================================================================
   animations.js — Interactive animation utilities for Orael
   - Number count-up for balance changes
   - Confetti for big wins (500+ ORL)
   - Ripple effect on button clicks
   - Screen transition slide direction
   - Scroll-reveal observer for cards
   ======================================================================== */

import { getState, setLocal } from './state.js';

/* ─── Track previous balance for count-up animation ──────────── */
let prevBalance = null;
let countUpTimer = null;

/**
 * Animate a number from old value to new value over duration.
 * @param {HTMLElement} el - element to update
 * @param {number} from - start value
 * @param {number} to - end value
 * @param {number} duration - ms
 * @param {function} [formatter] - optional formatter function
 */
export function animateNumber(el, from, to, duration = 800, formatter = (n) => n.toFixed(2)) {
  if (!el) return;
  if (from === to) {
    el.textContent = formatter(to);
    return;
  }

  const start = performance.now();
  const diff = to - from;

  // Flash color based on direction
  el.classList.remove('flash-up', 'flash-down');
  void el.offsetWidth; // force reflow
  el.classList.add(diff > 0 ? 'flash-up' : 'flash-down');

  if (countUpTimer) cancelAnimationFrame(countUpTimer);

  function step(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    // ease-out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = from + diff * eased;
    el.textContent = formatter(current);

    if (progress < 1) {
      countUpTimer = requestAnimationFrame(step);
    } else {
      el.textContent = formatter(to);
    }
  }

  countUpTimer = requestAnimationFrame(step);
}

/**
 * Check if balance changed and animate the balance element.
 * Called from the render loop.
 */
export function checkBalanceAnimation() {
  const S = getState();
  if (!S._loaded) return;

  const currentBalance = S.balance || 0;
  const balEl = document.getElementById('balance');
  const wBalEl = document.getElementById('wBalance');

  if (prevBalance !== null && prevBalance !== currentBalance) {
    const diff = currentBalance - prevBalance;
    const formatter = (n) => Number(n).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    if (balEl) animateNumber(balEl, prevBalance, currentBalance, 800, formatter);
    if (wBalEl) animateNumber(wBalEl, prevBalance, currentBalance, 800, formatter);

    // Trigger confetti for big wins
    if (diff >= 500) {
      launchConfetti();
    }
  }

  prevBalance = currentBalance;
}

/* ─── Confetti for big wins ──────────────────────────────────── */
const CONFETTI_COLORS = ['#fbbf24', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444'];

export function launchConfetti(count = 40) {
  for (let i = 0; i < count; i++) {
    setTimeout(() => spawnConfettiPiece(), i * 20);
  }
}

function spawnConfettiPiece() {
  const piece = document.createElement('div');
  piece.className = 'confetti-piece';
  piece.style.left = Math.random() * 100 + 'vw';
  piece.style.background = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
  piece.style.animationDuration = (2 + Math.random() * 1.5) + 's';
  piece.style.animationDelay = Math.random() * 0.3 + 's';
  piece.style.transform = `rotate(${Math.random() * 360}deg)`;
  // Vary the shape slightly
  if (Math.random() > 0.5) {
    piece.style.borderRadius = '50%';
    piece.style.width = '10px';
    piece.style.height = '10px';
  }
  document.body.appendChild(piece);
  setTimeout(() => piece.remove(), 4000);
}

/* ─── Ripple effect on any element ───────────────────────────── */
export function attachRipple(el) {
  if (!el || el.dataset.rippleAttached) return;
  el.dataset.rippleAttached = '1';

  el.addEventListener('click', (e) => {
    const rect = el.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;

    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.style.width = ripple.style.height = size + 'px';
    ripple.style.left = x + 'px';
    ripple.style.top = y + 'px';

    el.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
  });
}

/**
 * Attach ripple to all interactive elements.
 */
export function attachAllRipples() {
  const selectors = '.btn, .faucet-btn, .nav-btn, .seg button, .chip-go, .pg-btn, .referral button, .method, .day, .lb-row';
  document.querySelectorAll(selectors).forEach(attachRipple);
}

/* ─── Screen transition slide direction ──────────────────────── */
const SCREEN_ORDER = ['mine', 'play', 'earn', 'wallet'];

export function animateScreenTransition(newScreen) {
  const prevScreen = getState()._screen;
  const prevIdx = SCREEN_ORDER.indexOf(prevScreen);
  const newIdx = SCREEN_ORDER.indexOf(newScreen);

  const screenEl = document.getElementById('screen-' + newScreen);
  if (!screenEl) return;

  // Remove old animation classes
  screenEl.classList.remove('slide-left', 'slide-right');

  // Force reflow
  void screenEl.offsetWidth;

  // Add new animation class based on direction
  if (newIdx > prevIdx) {
    screenEl.classList.add('slide-left'); // moving forward → slide from right
  } else if (newIdx < prevIdx) {
    screenEl.classList.add('slide-right'); // moving backward → slide from left
  }

  setLocal('_screen', newScreen);
}

/* ─── Scroll-reveal observer for cards ───────────────────────── */
let revealObserver = null;

export function initScrollReveal() {
  if (revealObserver) revealObserver.disconnect();

  if (!('IntersectionObserver' in window)) return;

  revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('fade-in');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

  // Observe all cards and features
  document.querySelectorAll('.feat, .card, .item').forEach((el) => {
    revealObserver.observe(el);
  });
}

/**
 * Re-observe newly added elements (call after dynamic content render).
 */
export function refreshScrollReveal() {
  if (!revealObserver) return initScrollReveal();
  document.querySelectorAll('.feat:not(.fade-in), .card:not(.fade-in), .item:not(.fade-in)').forEach((el) => {
    revealObserver.observe(el);
  });
}

/* ─── Pulse glow on actionable items ─────────────────────────── */
/**
 * Add pulse-glow class to elements that are ready for action.
 * e.g., refuel button when fuel < 30%, faucet when ready to claim.
 */
export function updatePulseGlow() {
  const S = getState();
  if (!S._loaded) return;

  // Refuel button: pulse when energy is low
  const refuelBtn = document.getElementById('refuelBtn');
  if (refuelBtn) {
    const tankMined = S.tankMined || 0;
    const energy = Math.max(0, (40 - tankMined) / 40 * 100);
    if (energy < 30 && !refuelBtn.disabled) {
      refuelBtn.classList.add('pulse-glow');
    } else {
      refuelBtn.classList.remove('pulse-glow');
    }
  }

  // Faucet button: pulse when ready
  const faucetBtn = document.getElementById('faucetBtn');
  if (faucetBtn) {
    const elapsed = Date.now() - (S.faucetLast || 0);
    if (elapsed >= 60 * 60 * 1000) {
      faucetBtn.classList.add('pulse-glow');
    } else {
      faucetBtn.classList.remove('pulse-glow');
    }
  }

  // Free lottery ticket button: pulse
  const lottoAdBtn = document.getElementById('lottoAdBtn');
  if (lottoAdBtn) {
    lottoAdBtn.classList.add('pulse-glow');
  }

  // Streak claim: pulse when today is claimable
  const streakClaim = document.getElementById('streakClaim');
  if (streakClaim) {
    streakClaim.classList.add('pulse-glow');
  }

  // Video wall button: subtle pulse to attract attention
  const videoWallBtn = document.getElementById('videoWallBtn');
  if (videoWallBtn) {
    videoWallBtn.classList.add('ready');
  }
}

/* ─── Parallax effect on hero balance card ───────────────────── */
export function initParallax() {
  const scrollEl = document.querySelector('.scroll');
  const heroCard = document.querySelector('.balance-card');
  if (!scrollEl || !heroCard) return;

  let ticking = false;
  scrollEl.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        const y = scrollEl.scrollTop;
        if (y < 200) {
          heroCard.style.transform = `translateY(${y * 0.15}px) scale(${1 - y * 0.0005})`;
          heroCard.style.opacity = String(1 - y * 0.003);
        }
        ticking = false;
      });
      ticking = true;
    }
  });
}

/* ─── Idle mining indicator (live dot) ───────────────────────── */
export function updateLiveIndicator() {
  const S = getState();
  if (!S._loaded) return;

  const engineStatus = document.getElementById('engineStatus');
  if (!engineStatus) return;

  const tankMined = S.tankMined || 0;
  const isMining = tankMined < 40 - 1e-9;

  // Prepend live dot if not already there
  const existing = engineStatus.querySelector('.live-dot');
  if (existing) existing.remove();

  const dot = document.createElement('span');
  dot.className = 'live-dot' + (isMining ? '' : ' idle');
  engineStatus.insertBefore(dot, engineStatus.firstChild);
}
