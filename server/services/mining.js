import { TANK_ORL, RIGS, getTierMultiplier, PRO_MULTIPLIER, BOOST_MULTIPLIER } from '../economy.js';
import { updateUser, addTransaction, getUserById } from '../db.js';
import { payReferralCommission } from './referral.js';

/**
 * Accrue mined ORL for a user based on elapsed time, rig level, and active boosts.
 *
 * @param {object} user - User row from the database.
 * @returns {number} The amount of ORL mined (0 if no mining is active).
 */
export async function accrueMinedORL(user) {
  const now = Date.now();

  // Initialize accrual timestamp if missing
  if (!user.last_accrue_at) {
    await updateUser(user.id, { last_accrue_at: now });
    user.last_accrue_at = now;
  }

  // Tank already full
  if (user.tank_mined >= TANK_ORL) {
    return 0;
  }

  const timeDelta = (now - user.last_accrue_at) / (1000 * 60 * 60); // hours

  const rig = RIGS[user.rig_level];
  const sessionHours = rig.sessionMin / 60;
  const baseRate = TANK_ORL / sessionHours; // ORL per hour

  const isPro = user.pro_until > now;
  const isBoosted = user.boost_until > now;
  const tierMul = getTierMultiplier(user.tier);
  const multiplier = (isPro ? PRO_MULTIPLIER : 1) * (isBoosted ? BOOST_MULTIPLIER : 1) * tierMul;

  const effectiveRate = baseRate * multiplier;

  let mined = Math.min(timeDelta * effectiveRate, TANK_ORL - user.tank_mined);
  mined = Math.max(0, mined);
  mined = Math.round(mined * 1e6) / 1e6; // 6 decimal places

  if (mined > 0) {
    await updateUser(user.id, {
      balance: user.balance + mined,
      tank_mined: user.tank_mined + mined,
      last_accrue_at: now,
    });

    await addTransaction(user.id, 'mining', mined, `Mined ${mined} ORL`);

    if (user.referred_by) {
      await payReferralCommission(user.id, mined);
    }
  }

  return mined;
}
