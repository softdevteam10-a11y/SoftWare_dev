const express = require('express');
const router = express.Router();
const db = require('../db'); // path to your database connection module

// GET /api/v1/analytics/aggregate
router.get('/aggregate', async (req, res) => {
  try {
    const tokenResult = await db.query('SELECT COALESCE(SUM(quantity), 0)::int AS total_tokens FROM transactions WHERE status = $1', ['completed']);
    const customerResult = await db.query('SELECT COUNT(*)::int AS total_customers FROM customers');

   // Updated to match your exact Neon table name: customer_subscriptions
    const customerResult = await db.query(
      `SELECT COUNT(*)::int AS total_customers FROM customer_subscriptions`
    );


    res.json({
      success: true,
      data: {
        total_tokens_redeemed: tokenResult.rows[0]?.total_tokens || 0,
        total_registered_customers: customerResult.rows[0]?.total_customers || 0,
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { message: err.message }
    });
  }
});

module.exports = router;