// ─────────────────────────────────────────────────────────────
//  notifications.js — Push notifications via Telegram bot
//  Sends withdrawal status updates, achievement unlocks, etc.
// ─────────────────────────────────────────────────────────────

const TELEGRAM_API_BASE = 'https://api.telegram.org/bot';

/**
 * Send a Telegram message to a user by their Telegram ID.
 *
 * @param {number} telegramId - user's Telegram ID
 * @param {string} text - message text (supports Markdown)
 * @param {object} [options] - extra Telegram API params
 * @returns {Promise<boolean>} true on success
 */
export async function sendTelegramMessage(telegramId, text, options = {}) {
  const token = process.env.BOT_TOKEN;
  if (!token) {
    console.warn('[notifications] BOT_TOKEN not set — skipping Telegram message');
    return false;
  }

  try {
    const res = await fetch(`${TELEGRAM_API_BASE}${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: telegramId,
        text,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
        ...options,
      }),
    });
    const data = await res.json();
    if (!data.ok) {
      console.warn('[notifications] Telegram API error:', data.description);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[notifications] Failed to send Telegram message:', err.message);
    return false;
  }
}

/**
 * Notify user that their withdrawal was completed.
 */
export async function notifyWithdrawalCompleted(telegramId, amount, method, netFiat) {
  const methodEmoji = method === 'bank' ? '🏦' : method === 'airtime' ? '📱' : '💵';
  const text = `✅ *Withdrawal Completed!*

${methodEmoji} Your withdrawal of *${amount} ORL* has been processed successfully.

💸 You received: *${netFiat}*

Thank you for using Orael! ⛏️`;
  return sendTelegramMessage(telegramId, text);
}

/**
 * Notify user that their withdrawal failed and was refunded.
 */
export async function notifyWithdrawalFailed(telegramId, amount, reason) {
  const text = `❌ *Withdrawal Failed*

Your withdrawal of *${amount} ORL* could not be processed.

Reason: ${reason || 'Unknown error'}

💰 Your ORL has been *refunded* to your balance. Please try again or contact support.`;
  return sendTelegramMessage(telegramId, text);
}

/**
 * Notify user that their withdrawal is pending admin approval.
 */
export async function notifyWithdrawalPendingApproval(telegramId, amount, method) {
  const text = `⏳ *Withdrawal Pending Approval*

Your withdrawal of *${amount} ORL* via ${method} requires admin approval (large amount).

Our team will review and process it within 24 hours.

Thank you for your patience! 🙏`;
  return sendTelegramMessage(telegramId, text);
}

/**
 * Notify user that an achievement was unlocked.
 */
export async function notifyAchievementUnlocked(telegramId, achievementName, description, icon) {
  const text = `🏆 *Achievement Unlocked!*

${icon} *${achievementName}*

${description}

Keep earning on Orael! ⛏️`;
  return sendTelegramMessage(telegramId, text);
}

/**
 * Notify user that their Pro subscription is activated.
 */
export async function notifyProActivated(telegramId) {
  const text = `👑 *Orael Pro Activated!*

Welcome to Pro! Enjoy these perks for 30 days:
• 2× base mining rate
• 5% withdrawal fee (instead of 10%)
• Free daily mystery chest (200-280 ORL)
• Priority withdrawals

Mine more, earn more! 🚀`;
  return sendTelegramMessage(telegramId, text);
}

/**
 * Notify user that they won the lottery.
 */
export async function notifyLotteryWin(telegramId, prize, date) {
  const text = `🎉 *Lottery Winner!*

Congratulations! You won the Orael Daily Lottery draw for ${date}!

🏆 Prize: *${prize} ORL* has been credited to your balance.

Try again tomorrow for another chance to win! 🍀`;
  return sendTelegramMessage(telegramId, text);
}

/**
 * Notify admins about a withdrawal that needs approval.
 */
export async function notifyAdminsPendingWithdrawal(amount, method, userName) {
  const adminIds = (process.env.ADMIN_IDS || '').split(',').map(s => parseInt(s.trim())).filter(Boolean);
  const text = `⚠️ *Approval Required*

A large withdrawal is pending approval:

👤 User: ${userName}
💰 Amount: *${amount} ORL*
💳 Method: ${method}

Open the admin panel to review: /admin`;
  for (const adminId of adminIds) {
    await sendTelegramMessage(adminId, text);
  }
}

export default {
  sendTelegramMessage,
  notifyWithdrawalCompleted,
  notifyWithdrawalFailed,
  notifyWithdrawalPendingApproval,
  notifyAchievementUnlocked,
  notifyProActivated,
  notifyLotteryWin,
  notifyAdminsPendingWithdrawal,
};
