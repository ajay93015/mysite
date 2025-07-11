const sqlite3 = require('sqlite3').verbose();
const adb = new sqlite3.Database('./payme.db');

adb.serialize(() => {
  adb.run(`CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    amount REAL,
    txn_id TEXT,
    status TEXT DEFAULT 'pending',
    queue_position INTEGER DEFAULT 0,
    created_at INTEGER,
    updated_at INTEGER,
    expires_at INTEGER,
    user_ip TEXT
  )`);
});

// In-memory queue management for same amounts
const amountQueues = new Map(); // amount -> array of payment records
const processingAmounts = new Set(); // amounts currently being processed

function getQueuePosition(amount) {
  const queue = amountQueues.get(amount) || [];
  return queue.length;
}

function addToQueue(amount, paymentData) {
  if (!amountQueues.has(amount)) {
    amountQueues.set(amount, []);
  }
  amountQueues.get(amount).push(paymentData);
}

function removeFromQueue(amount, paymentId) {
  const queue = amountQueues.get(amount);
  if (queue) {
    const index = queue.findIndex(p => p.id === paymentId);
    if (index > -1) {
      queue.splice(index, 1);
    }
    if (queue.length === 0) {
      amountQueues.delete(amount);
      processingAmounts.delete(amount);
    }
  }
}

function createPayment(amount, userIp = null) {
  return new Promise((resolve, reject) => {
    const now = Date.now();
    const queuePosition = getQueuePosition(amount);
    const isFirstInQueue = queuePosition === 0;
    
    // Longer expiry for queued payments
    const expiryMinutes = isFirstInQueue ? 10 : 15;
    const expiresAt = now + (expiryMinutes * 60 * 1000);
    
    adb.run(
      `INSERT INTO transactions (amount, status, queue_position, created_at, expires_at, user_ip) 
       VALUES (?, 'pending', ?, ?, ?, ?)`,
      [amount, queuePosition, now, expiresAt, userIp],
      function (err) {
        if (err) return reject(err);
        
        const paymentData = {
          id: this.lastID,
          amount,
          queuePosition,
          isFirstInQueue,
          estimatedWaitTime: queuePosition * 2 * 60 * 1000, // 2 minutes per position
          expiresAt
        };
        
        // Add to in-memory queue
        addToQueue(amount, paymentData);
        
        resolve(paymentData);
      }
    );
  });
}

function markPaymentSuccess(amount, txnId) {
  return new Promise((resolve, reject) => {
    const now = Date.now();
    
    // Get the first pending payment for this amount (queue order)
    adb.get(
      `SELECT id FROM transactions 
       WHERE amount = ? AND status = 'pending' AND expires_at > ?
       ORDER BY queue_position ASC, created_at ASC LIMIT 1`,
      [amount, now],
      (err, row) => {
        if (err) return reject(err);
        if (!row) return reject(new Error('No pending payment found for this amount'));
        
        const paymentId = row.id;
        
        // Update the payment
        adb.run(
          `UPDATE transactions 
           SET status = 'success', txn_id = ?, updated_at = ? 
           WHERE id = ?`,
          [txnId, now, paymentId],
          function (err) {
            if (err) return reject(err);
            
            // Remove from queue
            removeFromQueue(amount, paymentId);
            
            // Update queue positions for remaining payments of this amount
            updateQueuePositions(amount);
            
            resolve({ paymentId, amount });
          }
        );
      }
    );
  });
}

function updateQueuePositions(amount) {
  const now = Date.now();
  adb.all(
    `SELECT id FROM transactions 
     WHERE amount = ? AND status = 'pending' AND expires_at > ?
     ORDER BY created_at ASC`,
    [amount, now],
    (err, rows) => {
      if (err) return;
      
      // Update queue positions in database and memory
      rows.forEach((row, index) => {
        adb.run(
          `UPDATE transactions SET queue_position = ? WHERE id = ?`,
          [index, row.id]
        );
      });
      
      // Update in-memory queue
      const queue = amountQueues.get(amount) || [];
      queue.forEach((payment, index) => {
        payment.queuePosition = index;
      });
    }
  );
}

function getPaymentStatus(amount, userIp) {
  return new Promise((resolve, reject) => {
    const now = Date.now();
    
    // Get user's payment for this amount
    adb.get(
      `SELECT id, amount, status, queue_position, created_at, expires_at, txn_id 
       FROM transactions 
       WHERE amount = ? AND user_ip = ? AND status != 'failed'
       ORDER BY created_at DESC LIMIT 1`,
      [amount, userIp],
      (err, row) => {
        if (err) return reject(err);
        if (!row) return reject(new Error('Payment not found'));
        
        // Auto-expire if past expiry time
        if (row.status === 'pending' && now > row.expires_at) {
          markPaymentFailed(row.id).then(() => {
            resolve({ ...row, status: 'failed' });
          });
        } else {
          // Get current queue position
          const currentQueuePosition = getCurrentQueuePosition(amount, row.id);
          resolve({ ...row, currentQueuePosition });
        }
      }
    );
  });
}

function getCurrentQueuePosition(amount, paymentId) {
  const queue = amountQueues.get(amount) || [];
  const position = queue.findIndex(p => p.id === paymentId);
  return position === -1 ? 0 : position;
}

function markPaymentFailed(paymentId) {
  return new Promise((resolve, reject) => {
    const now = Date.now();
    
    // Get payment details first
    adb.get(
      `SELECT amount FROM transactions WHERE id = ?`,
      [paymentId],
      (err, row) => {
        if (err) return reject(err);
        if (!row) return reject(new Error('Payment not found'));
        
        const amount = row.amount;
        
        adb.run(
          `UPDATE transactions SET status = 'failed', updated_at = ? WHERE id = ?`,
          [now, paymentId],
          (err) => {
            if (err) return reject(err);
            
            // Remove from queue and update positions
            removeFromQueue(amount, paymentId);
            updateQueuePositions(amount);
            
            resolve();
          }
        );
      }
    );
  });
}

function expireOldPayments() {
  const now = Date.now();
  
  // Get expired payments first
  adb.all(
    `SELECT id, amount FROM transactions 
     WHERE status = 'pending' AND expires_at < ?`,
    [now],
    (err, rows) => {
      if (err) return;
      
      // Remove from queues
      rows.forEach(row => {
        removeFromQueue(row.amount, row.id);
      });
      
      // Update database
      adb.run(
        `UPDATE transactions 
         SET status = 'failed', updated_at = ? 
         WHERE status = 'pending' AND expires_at < ?`,
        [now, now]
      );
      
      // Update queue positions for affected amounts
      const affectedAmounts = [...new Set(rows.map(row => row.amount))];
      affectedAmounts.forEach(amount => updateQueuePositions(amount));
    }
  );
}

function getQueueInfo(amount) {
  const queue = amountQueues.get(amount) || [];
  return {
    queueLength: queue.length,
    isProcessing: processingAmounts.has(amount)
  };
}

module.exports = {
  adb,
  createPayment,
  markPaymentSuccess,
  markPaymentFailed,
  getPaymentStatus,
  expireOldPayments,
  getQueueInfo
};
