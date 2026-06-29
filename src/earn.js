/* ========================================================================
   earn.js — Earn screen UI actions
   Tasks, featured tasks, daily streak, faucet, and referral buttons.
   (Offerwall section removed — those networks don't support Telegram.)
   ======================================================================== */

import { api } from './api.js';
import { playAd } from './ads.js';
import { getState, updateState, setLocal } from './state.js';
import { $, render, toast, reward, fmt, fmtInt, naira } from './ui.js';
import { haptic, shareLink, openLink } from './telegram.js';

/* ---- SVG icon constants ---- */
const icoPlay = `<svg viewBox="0 0 24 24" fill="none"><path d="M8 5v14l11-7L8 5z" fill="#e0a25b"/></svg>`;
const icoStar = `<svg viewBox="0 0 24 24" fill="none"><path d="M12 3l2.5 5.5 6 .5-4.5 4 1.4 5.9L12 16.8 6.6 18.9 8 13 3.5 9l6-.5L12 3z" fill="#e0a25b"/></svg>`;

/* ---- Helpers ---- */

function chipFor(done, label) {
  return `<div class="chip-go">${done ? 'Done' : label}</div>`;
}

/* ========================================================================
   RENDER FUNCTIONS
   ======================================================================== */

export function renderTasks() {
  const S = getState();
  const tasks = S.tasks && S.tasks.length ? S.tasks : [];
  const featured = S.featuredTasks && S.featuredTasks.length ? S.featuredTasks : [];
  const completed = S.completedTasks || {};

  // Tasks list
  const taskListEl = $('taskList');
  if (taskListEl) {
    if (tasks.length) {
      taskListEl.innerHTML = tasks.map(t => `
        <div class="item ${completed[t.id] ? 'done' : ''}" data-kind="tasks" data-id="${t.id}" data-r="${t.r}" data-url="${t.url || ''}">
          <div class="item-ic">${icoPlay}</div>
          <div class="item-body"><div class="item-title">${t.title}</div><div class="item-sub">${t.sub}</div></div>
          ${chipFor(completed[t.id], '+' + t.r + ' ORL')}</div>`).join('');
    } else {
      taskListEl.innerHTML = `<div style="text-align:center;padding:15px;color:var(--ink-soft);font-size:13px">Loading tasks...</div>`;
    }
  }

  // Featured list
  const featListEl = $('featuredList');
  if (featListEl) {
    if (featured.length) {
      featListEl.innerHTML = featured.map(t => `
        <div class="item featured ${completed[t.id] ? 'done' : ''}" data-kind="featured" data-id="${t.id}" data-r="${t.r}" data-url="${t.url || ''}">
          <div class="item-ic">${icoStar}</div>
          <div class="item-body"><div class="item-title">${t.title}</div><div class="item-sub">${t.sub}</div></div>
          ${chipFor(completed[t.id], '+' + t.r + ' ORL')}</div>`).join('');
    } else {
      featListEl.innerHTML = `<div style="text-align:center;padding:15px;color:var(--ink-soft);font-size:13px">Loading featured tasks...</div>`;
    }
  }

  // Wire click handlers
  document.querySelectorAll('[data-kind="tasks"], [data-kind="featured"]').forEach(el => {
    el.addEventListener('click', () => {
      const { kind, id, url } = el.dataset;
      const r = parseInt(el.dataset.r);
      const S = getState();
      const completedMap = S.completedTasks || {};
      if (completedMap[id]) return;

      if (url) {
        openLink(url);
      }

      const label = 'Verifying task…';
      playAd(label, 'Reward credits when you complete it.', 10, async () => {
        try {
          const res = await api('/api/earn/task', {
            method: 'POST',
            body: { taskId: id, kind },
          });
          updateState(res);
          renderTasks();
          render();
          reward(r, 'Reward earned', 'Nice. Keep stacking ORL.');
        } catch (e) { /* handled */ }
      });
    });
  });
}

export function renderStreak() {
  const S = getState();
  const el = $('streakStrip');
  if (!el) return;

  const STREAK_AMOUNTS = (S.streakAmounts && S.streakAmounts.length)
    ? S.streakAmounts
    : [40, 70, 110, 170, 240, 330, 440];

  el.innerHTML = STREAK_AMOUNTS.map((a, i) => {
    const day = i + 1;
    const isClaimed = day < S.streakDay || (day === S.streakDay && S.streakClaimedToday);
    const isToday = day === S.streakDay && !S.streakClaimedToday;
    const cls = isClaimed ? 'claimed' : isToday ? 'today' : '';
    return `<div class="day ${cls}" ${isToday ? 'id="streakClaim"' : ''}><div>D${day}</div><div class="d-amt">${a}</div></div>`;
  }).join('');

  const claimEl = $('streakClaim');
  if (claimEl) {
    claimEl.addEventListener('click', async () => {
      try {
        haptic('light');
        const res = await api('/api/earn/streak', { method: 'POST' });
        updateState(res.user);
        render();
        renderStreak();
        toast('Daily streak claimed', `+${STREAK_AMOUNTS[(S.streakDay || 1) - 1]} ORL`);
      } catch (e) { /* handled */ }
    });
  }
}

/* ========================================================================
   VIDEO WALL (NEW) — unlimited watch & earn
   ======================================================================== */

function setupVideoWall() {
  const videoWallBtn = $('videoWallBtn');
  if (!videoWallBtn) return;

  videoWallBtn.addEventListener('click', () => {
    playAd('Video ad loading…', 'Watch to earn 100 ORL.', 15, async () => {
      try {
        const res = await api('/api/earn/video-wall', { method: 'POST' });
        updateState(res.user || res);
        render();
        toast('Video reward', `+${res.reward || 100} ORL`);
      } catch (e) { /* handled */ }
    });
  });
}

/* ========================================================================
   FAUCET + REFERRAL
   ======================================================================== */

function setupFaucet() {
  const faucetBtn = $('faucetBtn');
  if (!faucetBtn) return;

  faucetBtn.addEventListener('click', () => {
    const S = getState();
    const elapsed = Date.now() - (S.faucetLast || 0);
    if (elapsed < 60 * 60 * 1000) return;

    playAd('Claiming bonus…', 'Your hourly drip is loading.', 10, async () => {
      try {
        const res = await api('/api/earn/faucet', { method: 'POST' });
        updateState(res);
        render();
        toast('Hourly bonus', `+${res.reward || 80} ORL`);
      } catch (e) { /* handled */ }
    });
  });
}

function setupReferral() {
  const copyBtn = $('copyRef');
  const shareBtn = $('shareRef');
  const refCodeEl = $('refCode');

  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const code = refCodeEl?.textContent || '';
      navigator.clipboard?.writeText(code);
      toast('Invite link copied', 'Share it anywhere');
    });
  }

  if (shareBtn) {
    shareBtn.addEventListener('click', () => {
      const code = refCodeEl?.textContent || '';
      const url = code.startsWith('http') ? code : 'https://' + code;
      shareLink(url, 'Mine ORL free on Orael ⛏️');
      toast('Link shared', '');
    });
  }
}

/* ========================================================================
   ADSGRAM TASKS
   ======================================================================== */

function renderAdsgramTasks() {
  const container = $('adsgramTaskList');
  if (!container) return;

  const blockId = import.meta.env.VITE_ADSGRAM_TASK_BLOCK_ID;
  if (!blockId) {
    container.innerHTML = `<div style="font-size:12px;color:var(--ink-soft);text-align:center;width:100%">No Adsgram tasks configured.</div>`;
    return;
  }

  const isDebug = import.meta.env.DEV ? 'true' : 'false';

  const taskEl = document.createElement('adsgram-task');
  taskEl.setAttribute('data-block-id', blockId);
  taskEl.setAttribute('data-debug', isDebug);
  taskEl.setAttribute('data-debug-console', 'false');
  taskEl.className = 'task';

  const handleReward = async (event) => {
    console.log('[Adsgram Task] Completed! Detail:', event.detail);
    haptic('success');
    toast('Task completed!', 'Updating balance...');

    // Immediately update card to show a refreshing/loading state
    container.innerHTML = `
      <div style="font-size:13px;color:var(--ink-soft);text-align:center;padding:12px 0;">
        Checking for next available task...
      </div>
    `;

    // Reload the Adsgram task widget to load the next task (or show empty state if none are left)
    setTimeout(() => {
      renderAdsgramTasks();
    }, 1000);

    // Wait 2.5 seconds for server S2S webhook to complete and credit balance, then sync local state
    setTimeout(async () => {
      try {
        const res = await api('/api/user');
        updateState(res);
        render();
        toast('Success!', 'Reward credited to your balance.');
      } catch (e) {
        console.error('Failed to sync after ad completion:', e);
      }
    }, 2500);
  };

  taskEl.addEventListener('reward', handleReward);
  taskEl.addEventListener('onReward', handleReward);

  taskEl.addEventListener('onBannerNotFound', () => {
    console.log('[Adsgram Task] No banner found.');
    container.innerHTML = `
      <div style="font-size:13px;color:var(--ink-soft);text-align:center;padding:12px 0;">
        All tasks completed! Come back later.
      </div>
    `;
  });

  taskEl.addEventListener('onError', (err) => {
    console.error('[Adsgram Task] Error:', err);
    
    const S = getState();
    fetch('/api/log-ad-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: S.id,
        blockId: blockId,
        error: err ? {
          message: err.message || err.detail || 'Task Error',
          description: err.description,
          code: err.code
        } : 'Unknown task error'
      })
    }).catch(e => console.error('Failed to send task error log:', e));

    container.innerHTML = `
      <div style="font-size:13px;color:var(--ink-soft);text-align:center;padding:12px 0;">
        No tasks available at the moment.
      </div>
    `;
  });

  container.innerHTML = '';
  container.appendChild(taskEl);
}

/* ========================================================================
   MAIN SETUP
   ======================================================================== */

/**
 * Set up all Earn screen event listeners and initial renders.
 */
export function setupEarn() {
  renderTasks();
  renderAdsgramTasks();
  renderStreak();
  setupVideoWall();
  setupFaucet();
  setupReferral();
}
