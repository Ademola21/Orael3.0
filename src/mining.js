/* ========================================================================
   mining.js — Mining UI actions
   Wires refuel, boost, and rig upgrade buttons to backend API.
   ======================================================================== */

import { api } from './api.js';
import { playAd } from './ads.js';
import { getState, updateState } from './state.js';
import { $, render, toast, reward, fmt, fmtInt, tankOrl, rigsList } from './ui.js';
import { launchConfetti } from './animations.js';

/**
 * Set up all mining-related event listeners.
 */
export function setupMining() {
  const refuelBtn = $('refuelBtn');
  const boostBtn  = $('boostBtn');
  const rigBtn    = $('rigBtn');

  /* ---- Refuel ---- */
  if (refuelBtn) {
    refuelBtn.addEventListener('click', () => {
      const S = getState();
      const isPro = Date.now() < (S.proUntil || 0);

      const doRefuel = async () => {
        try {
          const res = await api('/api/mining/refuel', { method: 'POST' });
          updateState(res);
          render();
          toast({ title: 'Engine refueled', message: 'Fuel at 100%', variant: 'success' });
          // Small confetti burst for refuel
          launchConfetti(15);
        } catch (e) { /* api() already shows toast on error */ }
      };

      if (isPro) {
        // Pro users skip the ad
        doRefuel();
      } else {
        playAd('Refueling engine…', 'Reward unlocks when the ad finishes.', 15, doRefuel);
      }
    });
  }

  /* ---- Boost ---- */
  if (boostBtn) {
    boostBtn.addEventListener('click', () => {
      const S = getState();
      const isBoosted = Date.now() < (S.boostUntil || 0);
      const mining = (S.tankMined || 0) < tankOrl() - 1e-9;
      if (isBoosted || !mining) return;

      playAd('Loading boost…', '1.2× mining speed for 3 hours.', 15, async () => {
        try {
          const res = await api('/api/mining/boost', { method: 'POST' });
          updateState(res);
          render();
          toast({ title: '1.2× Boost active', message: 'Speed increased by 20% for 3h', variant: 'success' });
        } catch (e) { /* handled */ }
      });
    });
  }

  /* ---- Rig upgrade ---- */
  if (rigBtn) {
    rigBtn.addEventListener('click', async () => {
      const S = getState();
      const rigs = rigsList();
      const next = rigs[S.rigLevel + 1];
      if (!next || S.balance < next.cost) return;

      try {
        const res = await api('/api/mining/rig-upgrade', { method: 'POST' });
        updateState(res);
        render();

        const newRig = rigs[getState().rigLevel] || next;
        reward(
          0,
          `${newRig.name} online`,
          `Now mining ${fmt(tankOrl() / (newRig.sessionMin / 60), 1)} ORL/hr — faster sessions.`
        );
      } catch (e) { /* handled */ }
    });
  }
}
