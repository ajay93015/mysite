const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./payments.db');

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    amount REAL,
    txn_id TEXT UNIQUE,
    status TEXT,
    created_at INTEGER
  )`);
});

function wasPaymentSuccessful(amount, callback) {
  const cutoff = Date.now() - 6 * 60 * 1000; // 6 minutes ago
  db.get(
    `SELECT * FROM transactions WHERE amount = ? AND status = 'success' AND created_at > ? ORDER BY id DESC LIMIT 1`,
    [amount, cutoff],
    callback
  );
}
function createPayment(amount) {
  return new Promise((resolve, reject) => {
    db.run(`INSERT INTO transactions (amount, txn_id, status, created_at) VALUES (?, NULL, 'pending', ?)`,
      [amount, Date.now()],
      function (err) {
        if (err) return reject(err);
        resolve(this.lastID);
      });
  });
}

function markPaymentSuccess(amount, txnId) {
  return new Promise((resolve, reject) => {
    db.run(`UPDATE transactions SET status = 'success', txn_id = ? WHERE amount = ? AND status = 'pending'`,
      [txnId, amount],
      function (err) {
        if (err) return reject(err);
        resolve();
      });
  });
}

function expireOldPayments() {
  const limit = Date.now() - 6 * 60 * 1000;
  db.run(`UPDATE transactions SET status = 'failed' WHERE status = 'pending' AND created_at < ?`, [limit]);
}

function getStatus(amount, callback) {
  db.get(`SELECT status FROM transactions WHERE amount = ? ORDER BY id DESC LIMIT 1`, [amount], callback);
}

module.exports = { db, createPayment, markPaymentSuccess, expireOldPayments, getStatus };
