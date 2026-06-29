// ─────────────────────────────────────────────────────────────
//  admin.js — Admin panel API routes
// ─────────────────────────────────────────────────────────────

import { Router } from 'express';
import {
  getUser,
  getUserById,
  getAllUsers,
  countUsers,
  getPendingWithdrawalsAll,
  countPendingWithdrawals,
  updateWithdrawalStatus,
  updateWithdrawalStatusById,
  updateWithdrawalFlutterwave,
  getWithdrawalById,
  getWithdrawalsByStatus,
  getAllTransactions,
  countTransactions,
  getStats,
  updateUser,
  addTransaction,
  getRecentWithdrawals,
  getAll,
  getOne,
  createPromoCode,
  getAllPromoCodes,
  deactivatePromoCode,
  backupDatabase,
  logAudit,
  run,
} from '../db.js';
import { requireAdmin, requirePermission, isSuperAdmin, MOD_PERMISSIONS } from '../middleware/adminAuth.js';
import { ORL_TO_NGN, ORL_PER_USD, MANUAL_APPROVAL_THRESHOLD_ORL } from '../economy.js';
import {
  createTransfer,
  purchaseAirtime,
  generateTransferReference,
  generateAirtimeReference,
  getTransferStatus,
} from '../services/flutterwave.js';
import {
  notifyWithdrawalCompleted,
  notifyWithdrawalFailed,
} from '../services/notifications.js';

const router = Router();

// All admin routes require admin auth
router.use(requireAdmin);

/* ─── GET /api/admin/stats ─────────────────────────────────────── */

router.get('/stats', (req, res) => {
  try {
    const stats = getStats();
    return res.json({
      ...stats,
      totalBalanceUsd: stats.totalBalance / ORL_PER_USD,
      totalMinedUsd: stats.totalMined / ORL_PER_USD,
      totalAdsUsd: stats.totalAds / ORL_PER_USD,
      totalWithdrawalsUsd: stats.totalWithdrawals / ORL_PER_USD,
    });
  } catch (err) {
    console.error('GET /admin/stats error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/* ─── GET /api/admin/users ─────────────────────────────────────── */

router.get('/users', requirePermission('view_users'), (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const search = req.query.search;

    let users;
    let total;
    if (search) {
      const pattern = `%${search}%`;
      // sql.js doesn't support LIKE with params easily, do manual filter
      const allUsers = getAllUsers(100000, 0);
      users = allUsers.filter(u =>
        String(u.telegram_id).includes(search) ||
        (u.username || '').toLowerCase().includes(search.toLowerCase()) ||
        (u.first_name || '').toLowerCase().includes(search.toLowerCase())
      ).slice(offset, offset + limit);
      total = allUsers.length;
    } else {
      users = getAllUsers(limit, offset);
      total = countUsers();
    }

    return res.json({
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      }
    });
  } catch (err) {
    console.error('GET /admin/users error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/* ─── GET /api/admin/users/:id ─────────────────────────────────── */

router.get('/users/:id', requirePermission('view_users'), (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const user = getUserById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const recentWithdrawals = getRecentWithdrawals(userId, 10);
    const transactions = getAll('SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 20', [userId]);

    return res.json({
      user: {
        ...user,
        isSuperAdmin: isSuperAdmin(user.telegram_id),
      },
      transactions,
      withdrawals: recentWithdrawals
    });
  } catch (err) {
    console.error('GET /admin/users/:id error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/* ─── POST /api/admin/users/:id/ban ────────────────────────────── */

router.post('/users/:id/ban', requirePermission('ban_users'), (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { banned } = req.body;
    const user = getUserById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Can't ban super admins
    if (isSuperAdmin(user.telegram_id)) {
      return res.status(403).json({ error: 'Cannot ban a super admin' });
    }

    updateUser(userId, { banned: banned ? 1 : 0 });
    addTransaction(userId, 'admin_action', 0, banned ? 'Banned by admin' : 'Unbanned by admin');

    return res.json({ success: true, banned: !!banned });
  } catch (err) {
    console.error('POST /admin/users/:id/ban error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/* ─── POST /api/admin/users/:id/balance ────────────────────────── */

router.post('/users/:id/balance', requirePermission('adjust_balance'), (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { amount, reason } = req.body;
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || isNaN(parsedAmount)) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const user = getUserById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const newBalance = Math.max(0, user.balance + parsedAmount);
    updateUser(userId, { balance: newBalance });
    addTransaction(userId, 'admin_adjust', parsedAmount, `Admin adjustment: ${reason || 'no reason'}`);

    return res.json({ success: true, newBalance });
  } catch (err) {
    console.error('POST /admin/users/:id/balance error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/* ─── POST /api/admin/users/:id/role ───────────────────────────── */

router.post('/users/:id/role', requirePermission('manage_mods'), (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { role, permissions } = req.body;

    if (!['user', 'mod', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const user = getUserById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Can't modify super admins
    if (isSuperAdmin(user.telegram_id)) {
      return res.status(403).json({ error: 'Cannot modify a super admin' });
    }

    // Only super admins can create admins
    if (role === 'admin' && !req.isAdmin) {
      return res.status(403).json({ error: 'Only super admins can promote to admin' });
    }

    const permsStr = Array.isArray(permissions) ? permissions.join(',') : (permissions || '');
    updateUser(userId, { role, permissions: permsStr });

    return res.json({ success: true, role, permissions: permsStr });
  } catch (err) {
    console.error('POST /admin/users/:id/role error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/* ─── GET /api/admin/withdrawals ───────────────────────────────── */

router.get('/withdrawals', requirePermission('process_withdrawals'), (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const status = req.query.status || 'needs_approval'; // default to needs_approval first

    let withdrawals;
    let total;
    if (status === 'pending') {
      // Include both pending and needs_approval for backwards compat
      withdrawals = getAll(`
        SELECT w.*, u.telegram_id, u.first_name, u.username, u.country
        FROM withdrawals w
        JOIN users u ON w.user_id = u.id
        WHERE w.status IN ('pending', 'needs_approval')
        ORDER BY w.created_at ASC
        LIMIT ? OFFSET ?
      `, [limit, offset]);
      total = getOne("SELECT COUNT(*) AS cnt FROM withdrawals WHERE status IN ('pending', 'needs_approval')")?.cnt || 0;
    } else if (status === 'needs_approval') {
      withdrawals = getAll(`
        SELECT w.*, u.telegram_id, u.first_name, u.username, u.country
        FROM withdrawals w
        JOIN users u ON w.user_id = u.id
        WHERE w.status = 'needs_approval'
        ORDER BY w.amount_orl DESC
      `, []);
      total = withdrawals.length;
      withdrawals = withdrawals.slice(offset, offset + limit);
    } else {
      withdrawals = getAll(`
        SELECT w.*, u.telegram_id, u.first_name, u.username, u.country
        FROM withdrawals w
        JOIN users u ON w.user_id = u.id
        WHERE w.status = ?
        ORDER BY w.created_at DESC
        LIMIT ? OFFSET ?
      `, [status, limit, offset]);
      total = getOne('SELECT COUNT(*) AS cnt FROM withdrawals WHERE status = ?', [status])?.cnt || 0;
    }

    return res.json({
      withdrawals,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (err) {
    console.error('GET /admin/withdrawals error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/* ─── POST /api/admin/withdrawals/:id/process ──────────────────── */
// Approve or reject a withdrawal. For needs_approval withdrawals,
// approving triggers the actual Flutterwave transfer.

router.post('/withdrawals/:id/process', requirePermission('process_withdrawals'), async (req, res) => {
  try {
    const wid = parseInt(req.params.id);
    const { status } = req.body;
    if (!['completed', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const withdrawal = getWithdrawalById(wid);
    if (!withdrawal) return res.status(404).json({ error: 'Withdrawal not found' });

    // If already processed, don't double-process
    if (withdrawal.status === 'completed' || withdrawal.status === 'rejected') {
      return res.status(400).json({ error: `Withdrawal already ${withdrawal.status}` });
    }

    const user = getUserById(withdrawal.user_id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    /* ── REJECT: refund user ── */
    if (status === 'rejected') {
      updateWithdrawalStatusById(wid, 'rejected', 'Rejected by admin');
      updateUser(user.id, { balance: user.balance + withdrawal.amount_orl });
      addTransaction(user.id, 'withdraw_refund', withdrawal.amount_orl, `Withdrawal #${wid} rejected — refunded`);
      await notifyWithdrawalFailed(user.telegram_id, withdrawal.amount_orl, 'Rejected by admin');
      logAudit(req.adminUser.id, req.adminUser.role, 'withdrawal_rejected', withdrawal.user_id, {
        withdrawal_id: wid,
        amount: withdrawal.amount_orl,
      }, req.ip);
      return res.json({ success: true, status: 'rejected' });
    }

    /* ── APPROVE: process Flutterwave transfer if not already done ── */
    // If withdrawal was needs_approval and has no flw_transfer_id yet, initiate the transfer now
    if (!withdrawal.flw_transfer_id && (withdrawal.method === 'bank' || withdrawal.method === 'airtime')) {
      try {
        // Parse wallet_info
        // Bank: "BankName • 0123456789 • Account Name"
        // Airtime: phone number string
        if (withdrawal.method === 'bank') {
          const parts = withdrawal.wallet_info.split(' • ');
          if (parts.length < 3) {
            return res.status(400).json({ error: 'Invalid bank details stored' });
          }
          const bankName = parts[0];
          const accountNumber = parts[1];
          const accountName = parts[2];

          // Find bank code from bank name
          const { listBanks } = await import('../services/flutterwave.js');
          const banks = await listBanks('NG');
          const bank = banks.find(b => b.name === bankName);
          if (!bank) {
            return res.status(400).json({ error: `Bank "${bankName}" not found in Flutterwave` });
          }

          const netNgn = Math.floor(withdrawal.net_amount * ORL_TO_NGN);
          const flwReference = generateTransferReference(user.id);

          const flwResult = await createTransfer({
            account_bank: bank.code,
            account_number: accountNumber,
            amount: netNgn,
            narration: `Orael payout — ${user.first_name || 'User'} ${user.id}`,
            reference: flwReference,
            beneficiary_name: accountName,
            callback_url: `${process.env.DOMAIN}/api/flutterwave-webhook`,
          });

          updateWithdrawalFlutterwave(wid, flwResult.id, flwReference, flwResult.status);
          updateWithdrawalStatusById(wid, 'pending', null); // pending until webhook confirms
          logAudit(req.adminUser.id, req.adminUser.role, 'withdrawal_approved_initiated', withdrawal.user_id, {
            withdrawal_id: wid,
            flw_reference: flwReference,
            flw_transfer_id: flwResult.id,
          }, req.ip);

          return res.json({ success: true, status: 'pending', message: 'Transfer initiated. Webhook will confirm completion.' });
        } else if (withdrawal.method === 'airtime') {
          const phone = withdrawal.wallet_info;
          const netNgn = Math.floor(withdrawal.net_amount * ORL_TO_NGN);
          const flwReference = generateAirtimeReference(user.id);

          const flwResult = await purchaseAirtime({
            phone,
            amount: netNgn,
            reference: flwReference,
          });

          updateWithdrawalFlutterwave(wid, null, flwReference, flwResult.status);
          const finalStatus = (flwResult.status === 'success') ? 'completed' : 'pending';
          updateWithdrawalStatusById(wid, finalStatus, null);

          if (finalStatus === 'completed') {
            await notifyWithdrawalCompleted(user.telegram_id, withdrawal.amount_orl, 'airtime', withdrawal.net_fiat || '');
          }

          logAudit(req.adminUser.id, req.adminUser.role, 'withdrawal_approved_airtime', withdrawal.user_id, {
            withdrawal_id: wid,
            flw_reference: flwReference,
          }, req.ip);

          return res.json({ success: true, status: finalStatus, message: 'Airtime processed.' });
        }
      } catch (flwErr) {
        console.error('[admin] Flutterwave call failed:', flwErr.message);
        return res.status(400).json({ error: `Flutterwave failed: ${flwErr.message}` });
      }
    }

    /* ── USDT or already-initiated bank transfer: just mark completed ── */
    updateWithdrawalStatusById(wid, 'completed', null);
    await notifyWithdrawalCompleted(user.telegram_id, withdrawal.amount_orl, withdrawal.method, withdrawal.net_fiat || '');
    logAudit(req.adminUser.id, req.adminUser.role, 'withdrawal_completed', withdrawal.user_id, {
      withdrawal_id: wid,
    }, req.ip);

    return res.json({ success: true, status: 'completed' });
  } catch (err) {
    console.error('POST /admin/withdrawals/:id/process error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/* ─── POST /api/admin/withdrawals/:id/requery — poll Flutterwave ── */

router.post('/withdrawals/:id/requery', requirePermission('process_withdrawals'), async (req, res) => {
  try {
    const wid = parseInt(req.params.id);
    const withdrawal = getWithdrawalById(wid);
    if (!withdrawal) return res.status(404).json({ error: 'Withdrawal not found' });

    if (!withdrawal.flw_transfer_id) {
      return res.status(400).json({ error: 'No Flutterwave transfer ID for this withdrawal' });
    }

    const status = await getTransferStatus(withdrawal.flw_transfer_id);

    // Update our records
    if (status.status === 'SUCCESSFUL' && withdrawal.status !== 'completed') {
      updateWithdrawalStatusById(wid, 'completed', status.complete_message);
      addTransaction(withdrawal.user_id, 'withdraw_completed', 0, `Withdrawal #${wid} completed (admin re-query)`);
      const user = getUserById(withdrawal.user_id);
      if (user) {
        await notifyWithdrawalCompleted(user.telegram_id, withdrawal.amount_orl, withdrawal.method, withdrawal.net_fiat || '');
      }
    } else if (status.status === 'FAILED' && withdrawal.status !== 'rejected') {
      updateWithdrawalStatusById(wid, 'rejected', status.complete_message);
      const user = getUserById(withdrawal.user_id);
      if (user) {
        updateUser(user.id, { balance: user.balance + withdrawal.amount_orl });
        addTransaction(user.id, 'withdraw_refund', withdrawal.amount_orl, `Withdrawal #${wid} failed (re-query) — refunded`);
        await notifyWithdrawalFailed(user.telegram_id, withdrawal.amount_orl, status.complete_message);
      }
    }

    return res.json({
      success: true,
      flw_status: status.status,
      local_status: withdrawal.status,
      complete_message: status.complete_message,
    });
  } catch (err) {
    console.error('POST /admin/withdrawals/:id/requery error:', err);
    return res.status(500).json({ error: err.message || 'Failed to re-query Flutterwave' });
  }
});

/* ─── POST /api/admin/withdrawals/bulk-process ─────────────────── */

router.post('/withdrawals/bulk-process', requirePermission('process_withdrawals'), async (req, res) => {
  try {
    const { ids, action } = req.body;
    if (!Array.isArray(ids) || !['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'ids array and action (approve/reject) required' });
    }

    const results = [];
    for (const wid of ids) {
      try {
        const withdrawal = getWithdrawalById(wid);
        if (!withdrawal) {
          results.push({ id: wid, status: 'error', error: 'Not found' });
          continue;
        }

        const status = action === 'approve' ? 'completed' : 'rejected';

        if (status === 'rejected') {
          updateWithdrawalStatusById(wid, 'rejected', 'Bulk rejected by admin');
          const user = getUserById(withdrawal.user_id);
          if (user) {
            updateUser(user.id, { balance: user.balance + withdrawal.amount_orl });
            addTransaction(user.id, 'withdraw_refund', withdrawal.amount_orl, `Withdrawal #${wid} bulk rejected — refunded`);
          }
        } else {
          // For bulk approve, only mark completed (admin should use individual approve
          // for large withdrawals that need Flutterwave initiation)
          updateWithdrawalStatusById(wid, 'completed', 'Bulk approved by admin');
          const user = getUserById(withdrawal.user_id);
          if (user) {
            await notifyWithdrawalCompleted(user.telegram_id, withdrawal.amount_orl, withdrawal.method, withdrawal.net_fiat || '');
          }
        }

        results.push({ id: wid, status: 'success' });
      } catch (e) {
        results.push({ id: wid, status: 'error', error: e.message });
      }
    }

    logAudit(req.adminUser.id, req.adminUser.role, 'bulk_withdrawal_process', null, {
      action,
      ids,
      results,
    }, req.ip);

    return res.json({ success: true, results });
  } catch (err) {
    console.error('POST /admin/withdrawals/bulk-process error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/* ─── POST /api/admin/backup-db — manual DB backup ─────────────── */

router.post('/backup-db', requireAdmin, (req, res) => {
  try {
    const backupPath = backupDatabase();
    if (!backupPath) return res.status(500).json({ error: 'Backup failed' });
    logAudit(req.adminUser.id, req.adminUser.role, 'manual_backup', null, { path: backupPath }, req.ip);
    return res.json({ success: true, path: backupPath });
  } catch (err) {
    console.error('POST /admin/backup-db error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/* ─── GET /api/admin/promo-codes — list all promo codes ─────────── */

router.get('/promo-codes', requireAdmin, (req, res) => {
  try {
    const codes = getAllPromoCodes();
    return res.json({ codes });
  } catch (err) {
    console.error('GET /admin/promo-codes error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/* ─── POST /api/admin/promo-codes — create promo code ───────────── */

router.post('/promo-codes', requireAdmin, (req, res) => {
  try {
    const { code, rewardOrl, maxUses, expiresAt } = req.body;
    if (!code || !rewardOrl) {
      return res.status(400).json({ error: 'code and rewardOrl are required' });
    }
    createPromoCode(code, parseFloat(rewardOrl), parseInt(maxUses) || 0, expiresAt ? parseInt(expiresAt) : null);
    logAudit(req.adminUser.id, req.adminUser.role, 'create_promo_code', null, { code, rewardOrl }, req.ip);
    return res.json({ success: true });
  } catch (err) {
    console.error('POST /admin/promo-codes error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/* ─── DELETE /api/admin/promo-codes/:code — deactivate ──────────── */

router.delete('/promo-codes/:code', requireAdmin, (req, res) => {
  try {
    deactivatePromoCode(req.params.code);
    logAudit(req.adminUser.id, req.adminUser.role, 'deactivate_promo_code', null, { code: req.params.code }, req.ip);
    return res.json({ success: true });
  } catch (err) {
    console.error('DELETE /admin/promo-codes/:code error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/* ─── GET /api/admin/transactions ──────────────────────────────── */

router.get('/transactions', requirePermission('view_transactions'), (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    const transactions = getAllTransactions(limit, offset);
    const total = countTransactions();

    return res.json({
      transactions,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (err) {
    console.error('GET /admin/transactions error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/* ─── GET /api/admin/permissions ───────────────────────────────── */

router.get('/permissions', (req, res) => {
  return res.json({
    permissions: MOD_PERMISSIONS,
    myPermissions: req.permissions,
    isSuperAdmin: req.isAdmin && isSuperAdmin(req.adminUser?.telegram_id),
  });
});

export default router;
