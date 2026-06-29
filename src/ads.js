/* ========================================================================
   ads.js — Adsgram rewarded ad player
   Plays real Adsgram rewarded video ads in production.
   ======================================================================== */

import { haptic } from './telegram.js';
import { getState } from './state.js';

/** SVG arc circumference for the main gauge */
export const ARC_LEN = 395.8;

/** SVG arc circumference for the ad countdown ring */
export const AD_RING = 276.46;

/** @type {object|null} */
let adsgramController = null;

/** @type {boolean} */
let adPlaying = false;

/**
 * Play a real Adsgram rewarded ad.
 *
 * @param {string}   title     — overlay title text (for logging/compatibility)
 * @param {string}   body      — overlay body text (for logging/compatibility)
 * @param {number}   seconds   — countdown duration (ignored as Adsgram handles video length)
 * @param {Function} onReward  — callback fired when ad completes successfully
 */
export function playAd(title, body, seconds, onReward) {
  return new Promise((resolve, reject) => {
    const S = getState();
    const isAdmin = S.role === 'admin' || S.role === 'mod' || (S.permissions && S.permissions.length > 0);

    if (isAdmin) {
      haptic('success');
      if (onReward) onReward();
      resolve();
      return;
    }

    if (adPlaying) {
      console.warn('An ad is already playing. Ignoring request.');
      reject(new Error('Ad already playing'));
      return;
    }
    adPlaying = true;
    haptic('light');

    // Show visual loading veil
    const veil = document.getElementById('adVeil');
    if (veil) {
      veil.classList.add('show');
      const titleEl = document.getElementById('adTitle');
      const bodyEl = document.getElementById('adBody');
      const adNumEl = document.getElementById('adNum');
      if (titleEl && title) titleEl.textContent = title;
      if (bodyEl && body) bodyEl.textContent = body;
      if (adNumEl) adNumEl.textContent = '…';
    }

    const hideVeil = () => {
      const veil = document.getElementById('adVeil');
      if (veil) veil.classList.remove('show');
    };

    const blockId = import.meta.env.VITE_ADSGRAM_BLOCK_ID;

    if (window.Adsgram && blockId) {
      if (!adsgramController) {
        adsgramController = window.Adsgram.init({ blockId });
      }
      adsgramController.show()
        .then((result) => {
          adPlaying = false;
          hideVeil();
          if (result.done) {
            haptic('success');
            if (onReward) onReward();
            resolve();
          } else {
            import('./ui.js').then(({ toast }) => {
              toast('Ad not completed', 'Please watch to the end');
            });
            reject(new Error('Ad not completed'));
          }
        })
        .catch((err) => {
          adPlaying = false;
          hideVeil();
          console.error('Adsgram error:', err);
          
          let errMsg = 'No ads available at the moment. Please try again later.';
          if (err) {
            errMsg = err.description || err.message || errMsg;
          }

          // Log error to server for remote diagnostics
          fetch('/api/log-ad-error', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: S.id,
              blockId: blockId,
              error: err ? {
                message: err.message,
                description: err.description,
                code: err.code
              } : 'Unknown error'
            })
          }).catch(e => console.error('Failed to send error log to server:', e));

          import('./ui.js').then(({ toast }) => {
            toast('Ad Error', errMsg);
          });
          reject(err || new Error('Ad error'));
        });
    } else {
      adPlaying = false;
      hideVeil();
      console.error('Adsgram SDK not available or blockId is missing.');
      import('./ui.js').then(({ toast }) => {
        toast('Ad failed to load', 'Please disable ad blockers and try again.');
      });
      reject(new Error('Adsgram SDK not available'));
    }
  });
}
