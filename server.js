const express = require("express");
const sqlite3 = require("sqlite3").verbose();

const ejs = require("ejs");
const bodyParser = require("body-parser");
const session = require("express-session");
const fs = require("fs");
const bcrypt = require("bcrypt");
const https = require("https");
const path = require("path");
const multer = require("multer");
const axios = require("axios");
const socketIo = require('socket.io');

const qrcode = require("qrcode");
const app = express();
const port = 3000;
const http = require('http');
const server = http.createServer(app);
const io = socketIo(server);
app.use(bodyParser.urlencoded({ extended: false }));

app.use(express.json());
app.use(
  session({
    secret: "secret",
    resave: true,
    saveUninitialized: true,
  })
);

// Middleware to serve static files
app.use(express.static(path.join(__dirname, "public")));

let db = new sqlite3.Database("passbook.db");
db.run(`CREATE TABLE IF NOT EXISTS acopen (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gender TEXT,
  relationship_name TEXT,
  full_address TEXT,
  full_address2 TEXT,
  City TEXT,
  full_name TEXT,
  cif_number TEXT,
  account_number TEXT,
  adhar_number TEXT,
  acopen TEXT
  username TEXT
 
)`);
let user = new sqlite3.Database("user.db");
user.run(`CREATE TABLE IF NOT EXISTS acopen (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT
  password TEXT
)`);

const ent = new sqlite3.Database("entry.db");
ent.run(`CREATE TABLE IF NOT EXISTS reg (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT,
  name TEXT,
  accountno TEXT,
  custid TEXT,
  printeddate TEXT
)`);

const pent = new sqlite3.Database("dateentry.db");
pent.run(`CREATE TABLE IF NOT EXISTS reg (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  printeddate TEXT
)`);

// Set EJS as the view engine
app.set("view engine", "ejs");
app.set("views", __dirname + "/views/");

app.get("/", (req, res) => {
  const text = "upi://pay?pa=9301751642ajay@axl&pn=Ajay%20Vishwakarma";

  // Options for QR code generation
  const options = {
    errorCorrectionLevel: "H", // High error correction level
    type: "image/png", // Output type
    rendererOpts: {
      quality: 1, // Quality (0 to 1)
    },
  };

  // Generate QR code as a data URI
  qrcode.toDataURL(text, options, function (err, url) {
    if (err) throw err;
    const user = "ajay";
    if (user != "") {
      res.render("index", {
        user: user,
        url: url,
      });
    } else {
      res.render("home", {
        url: url,
      });

      //console.log(url); // Output the data URI
    }
  });
});
app.get("/agent", (req, res) => {
  res.render("agent");
});
app.get("/scan", (req, res) => {
  res.render("scan");
});
app.get("/process", (req, res) => {
  res.redirect("/");
});
app.get("/passbook", (req, res) => {
  db.all(`SELECT * FROM acopen`, (err, rows) => {
    if (rows != undefined) {
      res.render("fetch", {
        data: rows,
      });
    } else {
      res.redirect("/");
    }
  });
});

const sites = ["https://pnbwork.onrender.com/"];

const utcNow = new Date();

// Add 5 hours and 30 minutes manually (for IST)
const newHour = utcNow.getUTCHours() + 5;
const newMinute = utcNow.getUTCMinutes() + 30;

// Handle minute overflow
let istHour = newHour;
let istMinute = newMinute;
if (istMinute >= 60) {
  istMinute -= 60;
  istHour += 1;
}

// Optional: handle 24-hour overflow
if (istHour >= 24) {
  istHour -= 24;
}
/*
function checkup() {
  // Ping every 4 minutes (less than Glitch's 5-minute sleep)
  setInterval(() => {
    sites.forEach((site) => {
      axios
        .get(site)

        .catch((err) => console.log(`❌ Error pinging ${site}:`, err.message));
    });
  }, 240000); // every 4 minutes
}

// Call checkup only if IST hour is between 8 and 20
if (istHour >= 9 && istHour < 19) {
  checkup();
}
*/
// Ping every 4 minutes (less than Glitch's 5-minute sleep)
setInterval(() => {
  sites.forEach((site) => {
    axios
      .get(site)

      .catch((err) => console.log(`❌ Error pinging ${site}:`, err.message));
  });
}, 40000); // every 4 minutes


const payDb = new sqlite3.Database('./pay.db');

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');

// Initialize payment database with hardcoded schema
payDb.serialize(() => {
  payDb.run(`CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_number TEXT NOT NULL,
    amount REAL NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    processed_at DATETIME,
    txn_id TEXT,
    message TEXT,
    discount_applied REAL DEFAULT 0
  )`);
  
  payDb.run(`CREATE TABLE IF NOT EXISTS payment_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_number TEXT NOT NULL,
    amount REAL NOT NULL,
    original_amount REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    status TEXT DEFAULT 'waiting',
    position INTEGER DEFAULT 0
  )`);
});

// Hardcoded in-memory storage
const paymentQueue = new Map();
const activeUsers = new Map();
const processedPayments = new Set();

// Your existing process route (unchanged)
app.post("/process", (req, res) => {
  const data = req.body;
  const accountNumber = req.body.account_number;
  
  db.get(
    `SELECT * FROM acopen WHERE account_number = ?`,
    [accountNumber],
    (err, rows) => {
      if (rows === undefined) {
        const params = [
          data.acopen,
          data.gender + " " + data.full_name,
          data.account_number,
          data.cif_number,
          "",
        ];
        
        db.run(
          `INSERT INTO reg (date, name, accountno, custid, printeddate) VALUES (?, ?, ?, ?, ?)`,
          params,
          function (err) {
            if (err) {
              res.status(400).json({ error: err.message });
              return console.log(err.message);
            }
          }
        );
        
        db.run(
          `INSERT INTO acopen (acopen, gender, relationship_name, full_address, full_address2, City, full_name, cif_number, account_number, adhar_number) 
          VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [
            data.acopen,
            data.gender,
            data.relationship_name,
            data.full_address,
            data.full_address2,
            data.City,
            data.full_name,
            data.cif_number,
            data.account_number,
            data.adhar_number,
          ],
          function (err) {
            if (err) {
              return console.log(err.message);
            }
          }
        );
        
        res.render("process", {
          data: req.body,
        });
      } else {
        res.redirect(`/passbook/${req.body.account_number}`);
      }
    }
  );
});


// Hardcoded payment form route
app.get('/payment', (req, res) => {
  const hardcodedHTML = `
<!DOCTYPE html>
<html>
<head>
    <title>Payment System</title>
    <script src="/socket.io/socket.io.js"></script>
    <style>
        body { font-family: Arial; margin: 40px; background: #f0f0f0; }
        .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; }
        .form-group { margin-bottom: 20px; }
        label { display: block; margin-bottom: 5px; font-weight: bold; }
        input { width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 5px; font-size: 16px; }
        button { background: #007bff; color: white; padding: 15px 30px; border: none; border-radius: 5px; font-size: 16px; cursor: pointer; width: 100%; }
        button:hover { background: #0056b3; }
        button:disabled { background: #ccc; cursor: not-allowed; }
        .status { margin-top: 20px; padding: 15px; border-radius: 5px; display: none; }
        .waiting { background: #fff3cd; color: #856404; border: 1px solid #ffeaa7; }
        .success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
        .discount { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        .expired { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        .timer { font-weight: bold; color: #dc3545; }
        .queue-info { margin-top: 20px; padding: 15px; background: #e9ecef; border-radius: 5px; }
    </style>
</head>
<body>
    <div class="container">
        <h2>Payment Processing System</h2>
        <form id="paymentForm">
            <div class="form-group">
                <label>Account Number:</label>
                <input type="text" id="accountNumber" required placeholder="Enter account number">
            </div>
            <div class="form-group">
                <label>Amount (₹):</label>
                <input type="number" id="amount" step="0.01" required placeholder="Enter amount">
            </div>
            <button type="submit" id="submitBtn">Submit Payment Request</button>
        </form>
        
        <div id="statusCard" class="status">
            <div id="statusMessage"></div>
            <div id="timerDiv" style="margin-top: 10px;"></div>
        </div>
        
        <div class="queue-info">
            <h4>Queue Status</h4>
            <div id="queueInfo">No active payments</div>
        </div>
    </div>

    <script>
        const socket = io();
        let currentPaymentId = null;
        let timerInterval = null;
        let expiryTime = null;

        document.getElementById('paymentForm').addEventListener('submit', function(e) {
            e.preventDefault();
            
            const accountNumber = document.getElementById('accountNumber').value;
            const amount = parseFloat(document.getElementById('amount').value);
            
            if (!accountNumber || !amount) {
                alert('Please fill all fields');
                return;
            }
            
            fetch('/payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ account_number: accountNumber, amount: amount })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    currentPaymentId = data.payment_id;
                    showStatus('waiting', 'Payment request submitted. Waiting for processing...');
                    startTimer();
                    document.getElementById('submitBtn').disabled = true;
                    socket.emit('join_payment', { account_number: accountNumber });
                } else {
                    alert('Error: ' + data.error);
                }
            })
            .catch(error => {
                console.error('Error:', error);
                alert('Network error occurred');
            });
        });

        function showStatus(type, message) {
            const statusCard = document.getElementById('statusCard');
            const statusMessage = document.getElementById('statusMessage');
            statusCard.className = 'status ' + type;
            statusMessage.textContent = message;
            statusCard.style.display = 'block';
        }

        function startTimer() {
            expiryTime = new Date(Date.now() + 6 * 60 * 1000); // 6 minutes
            updateTimer();
            timerInterval = setInterval(updateTimer, 1000);
        }

        function updateTimer() {
            const now = new Date();
            const remaining = expiryTime - now;
            
            if (remaining <= 0) {
                clearInterval(timerInterval);
                showStatus('expired', 'Payment request expired');
                document.getElementById('timerDiv').innerHTML = '';
                document.getElementById('submitBtn').disabled = false;
                return;
            }
            
            const minutes = Math.floor(remaining / 60000);
            const seconds = Math.floor((remaining % 60000) / 1000);
            document.getElementById('timerDiv').innerHTML = 
                '<span class="timer">Time remaining: ' + minutes + ':' + (seconds < 10 ? '0' : '') + seconds + '</span>';
        }

        // Socket event listeners
        socket.on('payment_success', function(data) {
            if (data.id === currentPaymentId) {
                clearInterval(timerInterval);
                showStatus('success', 'Payment processed successfully! Transaction ID: ' + data.txn_id);
                document.getElementById('timerDiv').innerHTML = '';
                document.getElementById('submitBtn').disabled = false;
            }
        });

        socket.on('payment_discounted', function(data) {
            if (data.id === currentPaymentId) {
                showStatus('discount', 'Amount adjusted due to conflict. New amount: ₹' + data.new_amount.toFixed(2) + ' (Original: ₹' + data.original_amount.toFixed(2) + ')');
            }
        });

        socket.on('queue_update', function(data) {
            document.getElementById('queueInfo').innerHTML = 
                'Active payments in queue: ' + data.count + '<br>' +
                'Your position: ' + (data.position || 'N/A');
        });

        // Request queue status every 2 seconds
        setInterval(function() {
            socket.emit('request_queue_status');
        }, 2000);
    </script>
</body>
</html>`;
  
  res.send(hardcodedHTML);
});

// Hardcoded payment processing
app.post('/payment', (req, res) => {
  const { account_number, amount } = req.body;
  
  if (!account_number || !amount) {
    return res.status(400).json({ error: 'Account number and amount are required' });
  }
  
  const numAmount = parseFloat(amount);
  const currentTime = new Date();
  const expiryTime = new Date(currentTime.getTime() + 6 * 60 * 1000); // 6 minutes
  
  // Insert into database
  payDb.run(
    `INSERT INTO payment_queue (account_number, amount, original_amount, expires_at) VALUES (?, ?, ?, ?)`,
    [account_number, numAmount, numAmount, expiryTime.toISOString()],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      
      const paymentId = this.lastID;
      
      // Add to hardcoded memory queue
      const queueKey = numAmount.toString();
      if (!paymentQueue.has(queueKey)) {
        paymentQueue.set(queueKey, []);
      }
      
      const paymentRequest = {
        id: paymentId,
        account_number: account_number,
        amount: numAmount,
        original_amount: numAmount,
        created_at: currentTime,
        expires_at: expiryTime,
        status: 'waiting'
      };
      
      paymentQueue.get(queueKey).push(paymentRequest);
      
      res.json({ 
        success: true, 
        payment_id: paymentId,
        expires_at: expiryTime.toISOString()
      });
      
      // Emit queue update
      updateQueueStatus();
    }
  );
});

// Hardcoded payment message processing (SMS simulation)
app.post('/payment', (req, res) => {
  const message = req.body.message || req.body.sms_message;
  
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }
  
  console.log('Processing payment message:', message);
  
  // Hardcoded message parsing
  const amountRegex = /Rs\.?(\d+\.?\d*)/i;
  const txnRegex = /(?:Txn|Transaction)\s*(?:ID|Id)?:?\s*(\w+)/i;
  
  const amountMatch = message.match(amountRegex);
  const txnMatch = message.match(txnRegex);
  
  if (!amountMatch) {
    return res.status(400).json({ error: 'Amount not found in message' });
  }
  
  const amount = parseFloat(amountMatch[1]);
  const txnId = txnMatch ? txnMatch[1] : 'TXN' + Date.now();
  
  // Process the payment
  processHardcodedPayment(amount, txnId, message);
  
  res.json({ success: true, amount: amount, txn_id: txnId });
});

// Hardcoded payment processing function
function processHardcodedPayment(amount, txnId, message) {
  const queueKey = amount.toString();
  const queue = paymentQueue.get(queueKey);
  
  if (!queue || queue.length === 0) {
    console.log('No pending requests for amount:', amount);
    return;
  }
  
  // Remove expired requests
  const currentTime = new Date();
  const validRequests = queue.filter(req => req.expires_at > currentTime && req.status === 'waiting');
  
  if (validRequests.length === 0) {
    paymentQueue.delete(queueKey);
    console.log('All requests expired for amount:', amount);
    return;
  }
  
  // Take first valid request
  const selectedRequest = validRequests[0];
  
  // Handle multiple requests with discount
  if (validRequests.length > 1) {
    for (let i = 1; i < validRequests.length; i++) {
      const request = validRequests[i];
      const discountedAmount = amount - 0.01;
      
      // Update request with discount
      request.amount = discountedAmount;
      request.status = 'discounted';
      
      // Move to discounted queue
      const discountedKey = discountedAmount.toString();
      if (!paymentQueue.has(discountedKey)) {
        paymentQueue.set(discountedKey, []);
      }
      paymentQueue.get(discountedKey).push(request);
      
      // Update database
      payDb.run(
        `UPDATE payment_queue SET amount = ?, status = 'discounted' WHERE id = ?`,
        [discountedAmount, request.id]
      );
      
      // Notify client
      io.emit('payment_discounted', {
        id: request.id,
        account_number: request.account_number,
        original_amount: amount,
        new_amount: discountedAmount
      });
    }
  }
  
  // Process selected request
  selectedRequest.status = 'processed';
  
  // Save to payments table
  payDb.run(
    `INSERT INTO payments (account_number, amount, status, txn_id, message, processed_at) 
     VALUES (?, ?, 'success', ?, ?, ?)`,
    [selectedRequest.account_number, amount, txnId, message, new Date().toISOString()],
    function(err) {
      if (err) {
        console.error('Error saving payment:', err);
        return;
      }
      
      // Update queue status
      payDb.run(
        `UPDATE payment_queue SET status = 'processed' WHERE id = ?`,
        [selectedRequest.id]
      );
      
      // Remove from memory
      paymentQueue.set(queueKey, queue.filter(req => req.id !== selectedRequest.id));
      if (paymentQueue.get(queueKey).length === 0) {
        paymentQueue.delete(queueKey);
      }
      
      // Add to processed set
      processedPayments.add(selectedRequest.id);
      
      // Notify success
      io.emit('payment_success', {
        id: selectedRequest.id,
        account_number: selectedRequest.account_number,
        amount: amount,
        txn_id: txnId
      });
      
      console.log('Payment processed:', selectedRequest.account_number, amount, txnId);
      updateQueueStatus();
    }
  );
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('join_payment', (data) => {
    const { account_number } = data;
    socket.join('payment_' + account_number);
    activeUsers.set(socket.id, account_number);
    updateQueueStatus();
  });
  
  socket.on('request_queue_status', () => {
    updateQueueStatus();
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    activeUsers.delete(socket.id);
  });
});

// Update queue status function
function updateQueueStatus() {
  let totalCount = 0;
  for (const [amount, requests] of paymentQueue) {
    totalCount += requests.filter(req => req.status === 'waiting').length;
  }
  
  io.emit('queue_update', { count: totalCount });
}

// Hardcoded cleanup interval (every 30 seconds)
setInterval(() => {
  const currentTime = new Date();
  
  // Clean up expired requests
  for (const [amount, requests] of paymentQueue) {
    const validRequests = requests.filter(req => {
      if (req.expires_at <= currentTime && req.status === 'waiting') {
        req.status = 'expired';
        // Update database
        payDb.run(`UPDATE payment_queue SET status = 'expired' WHERE id = ?`, [req.id]);
        return false;
      }
      return true;
    });
    
    if (validRequests.length === 0) {
      paymentQueue.delete(amount);
    } else {
      paymentQueue.set(amount, validRequests);
    }
  }
  
  updateQueueStatus();
}, 30000);

// Hardcoded test SMS endpoint
app.post('/test-sms', (req, res) => {
  const testMessage = "Airtel Payments Bank a/c is credited with Rs.100.00. Txn ID: 699536637216. Call 180023400 for help";
  processHardcodedPayment(100.00, "699536637216", testMessage);
  res.json({ success: true, message: "Test SMS processed" });
});

// API endpoints
app.get('/api/queue', (req, res) => {
  const queueData = [];
  for (const [amount, requests] of paymentQueue) {
    queueData.push({
      amount: parseFloat(amount),
      count: requests.length,
      requests: requests.map(req => ({
        id: req.id,
        account_number: req.account_number,
        status: req.status,
        created_at: req.created_at,
        expires_at: req.expires_at
      }))
    });
  }
  res.json(queueData);
});

app.get('/api/payments', (req, res) => {
  payDb.all('SELECT * FROM payments ORDER BY created_at DESC LIMIT 20', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

/*
app.post("/process", (req, res) => {
  const data = req.body;

  const accountNumber = req.body.account_number;
  db.get(
    `SELECT * FROM acopen WHERE account_number = ?`,
    [accountNumber],
    (err, rows) => {
      if (rows === undefined) {
        const params = [
          data.acopen,
          data.gender + " " + data.full_name,
          data.account_number,
          data.cif_number,
          "",
        ];

        ent.run(
          `INSERT INTO reg (date, name, accountno, custid,printeddate) VALUES (?, ?, ?, ?, ?)`,
          params,
          function (err) {
            if (err) {
              // console.error(err.message);
              res.status(400).json({ error: err.message });
              return console.log(err.message);
            }
            //console.log('entered')
            //res.redirect('/ent');
          }
        );
        db.run(
          `INSERT INTO acopen (acopen,gender, relationship_name, full_address, full_address2, City, full_name, cif_number, account_number, adhar_number) 
        VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [
            data.acopen,
            data.gender,
            data.relationship_name,
            data.full_address,
            data.full_address2,
            data.City,
            data.full_name,
            data.cif_number,
            data.account_number,
            data.adhar_number,
          ],
          function (err) {
            if (err) {
              return console.log(err.message);
            }

            //console.log(`A row has been inserted with rowid ${this.lastID}`);
          }
        );

        res.render("process", {
          data: req.body,
        });
      } else {
        res.redirect(`/passbook/${req.body.account_number}`);
      }
    }
  );
});
*/
app.post("/passbook", (req, res) => {
  const date = new Date();
  res.render("passbook", {
    print: req.body,
  });
});

app.get("/passbook/:accountNumber", (req, res) => {
  const accountNumber = req.params.accountNumber;

  // Select data from the table based on the account number
  db.get(
    `SELECT * FROM acopen WHERE account_number = ?`,
    [accountNumber],
    (err, rows) => {
      if (rows === undefined) {
        res.redirect("/");
      } else {
        res.render("passbook", {
          print: rows,
        });
      }
    }
  );
});

app.get("/pent", async (req, res) => {
  pent.all("SELECT * FROM reg", [], (err, rows) => {
    res.render("pent", {
      printent: rows,
    });
  });
});
app.get("/pent/:printeddate", (req, res) => {
  const printed = req.params.printeddate;
  ent.all(`SELECT * FROM reg WHERE printeddate = ?`, [printed], (err, rows) => {
    res.render("ppent", {
      printent: rows,
    });
  });
});
app.get("/print/:printeddate", (req, res) => {
  const printed = req.params.printeddate;
  ent.all(`SELECT * FROM reg WHERE printeddate = ?`, [printed], (err, rows) => {
    res.render("print", {
      printent: rows,
    });
  });
});
app.post("/pent", (req, res) => {
  const printeddate = req.body.printeddate;
  const sql = `INSERT INTO reg (printeddate) VALUES (?)`;
  const params = [printeddate];

  pent.run(sql, params, function (err) {
    if (err) {
      // console.error(err.message);
      res.status(400).json({ error: err.message });
      return;
    }
    ent.run(
      "UPDATE reg SET printeddate = ? WHERE printeddate = ?",
      [printeddate, ""],
      (err) => {
        res.redirect(`/pent/${printeddate}`);
      }
    );
  });
});
app.get("/delete/:accountno", (req, res) => {
  const acc = req.params.accountno;
  ent.all("DELETE FROM reg WHERE accountno = ?", [acc], (err) => {
    res.redirect("/ent");
  });
});

app.get("/ent", (req, res) => {
  ent.all(`SELECT * FROM  reg WHERE printeddate = ?`, [""], (err, rows) => {
    //console.log(rows)
    res.render("ent", {
      printent: rows,
    });
  });
  // res.render('ent');
});

app.get("/update/:accountNumber", (req, res) => {
  const accountNumber = req.params.accountNumber;
  console.log(accountNumber);
  // Select data from the table based on the account number
  db.get(
    `SELECT * FROM acopen WHERE account_number = ?`,
    [accountNumber],
    (err, row) => {
      if (err) {
        return res.status(500).send("Database error");
      }

      if (!row) {
        // If no record is found
        return res.redirect("/");
      }
      /*
        if (req.session.userId === undefined) {  // Check if user is authenticated
            return res.redirect('/');
        }
*/
      // Render the update page with the data
      res.render("update", {
        print: row, // Pass the selected row data to the template
        user: req.session.userId, // Pass the user session ID to the template
      });
    }
  );
});
app.post("/update/:accountNumber", (req, res) => {
  const accountNumber = req.params.accountNumber;
  const {
    gender,
    relationship_name,
    full_address,
    full_address2,
    City,
    full_name,
    cif_number,
    adhar_number,
    acopen,
    acno,
  } = req.body;

  // Update the record
  db.run(
    `UPDATE acopen 
            SET gender = ?, relationship_name = ?, full_address = ?, full_address2 = ?, City = ?, full_name = ?, cif_number = ?, adhar_number = ?, acopen = ?,account_number= ?
            WHERE account_number = ?`,
    [
      gender,
      relationship_name,
      full_address,
      full_address2,
      City,
      full_name,
      cif_number,
      adhar_number,
      acopen,
      acno,
      accountNumber,
    ],
    function (err) {
      if (err) {
        return res.status(500).send("Failed to update account");
      }
      res.redirect(`/update/${acno}`);
    }
  );
});

app.post("/ent", (req, res) => {
  const { date, name, accountno, custid } = req.body;

  /*                        when entry printed
function formatDate(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

const formattedDate = formatDate(date);
*/
  const formattedDate = "";
  //const printeddate = '';

  const sql = `INSERT INTO reg (date, name, accountno, custid, printeddate) VALUES (?, ?, ?, ?, ?)`;
  const params = [date, name, accountno, custid, formattedDate];

  ent.run(sql, params, function (err) {
    if (err) {
      // console.error(err.message);
      res.status(400).json({ error: err.message });
      return;
    }
    res.redirect("/ent");
  });
});

app.get("/sbgen", (req, res) => {
  res.render("sbgen", {
    name: undefined,
    acno: undefined,
  });
});

app.post("/sbgen", (req, res) => {
  res.render("sbgen", {
    name: req.body.name,
    acno: req.body.acno,
  });
});

app.get("/adhar", (req, res) => {
  let menu = "";

  res.render("adhar", {
    menu: menu,
    user: req.session.userId,
  });
});
app.post("/adhar", (req, res) => {
  const ekyc = req.body.kyc;
  const newData = `{${ekyc}}`;
  const searchText = "eKYCRespData";
  const replaceText = '"eKYCRespData"';
  const newfixeddata = newData.replace(searchText, replaceText);
  const adhr = JSON.parse(newfixeddata);
  const okdata = adhr.eKYCRespData.EKYCResponse.uidData;
  //console.log(newfixeddata);
  res.render("new", {
    name: okdata,
    user: req.session.userId,
  });
});

app.post("/aadhar", (req, res) => {
  let menu = "";

  const ad = req.body;
  res.render("adhr", {
    menu: menu,
    ad: ad,
    user: req.session.userId,
  });
});

app.get("/deposit", (req, res) => {
  res.render("deposit");
});
app.get("/Terms_&_Conditions", (req, res) => {
  res.send(`
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Terms & Conditions</title>
        </head>
        <body>
            <h1>Terms & Conditions</h1>
            <p>Welcome to PNB Agent!</p>
            <ul>
                <li><strong>Service Use:</strong> Our website provides services related to PNB Agent. All users must use the service in accordance with the law.</li>
                <li><strong>Data Usage:</strong> The data provided by users is secure and will be used solely for the intended purpose.</li>
                <li><strong>Liability:</strong> We are not responsible for any loss or damage caused by the use of the website.</li>
                <li><strong>Modification:</strong> We reserve the right to modify the terms at any time without notice.</li>
            </ul>
        </body>
        </html>
    `);
});

// Refund Policy route
app.get("/Refund_Policy", (req, res) => {
  res.send(`
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Refund Policy</title>
        </head>
        <body>
            <h1>Refund Policy</h1>
            <p>At PNB Agent, we aim to provide the best services. However, if you are not satisfied with our services, the following refund policy applies:</p>
            <ul>
                <li>Refund requests must be made within 30 days of purchase.</li>
                <li>Refunds will only be provided for services not rendered.</li>
                <li>No refunds will be given for completed services or digital products already delivered.</li>
            </ul>
        </body>
        </html>
    `);
});

// About Us route
app.get("/about", (req, res) => {
  res.send(`
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>About Us</title>
        </head>
        <body>
            <h1>About Us</h1>
            <p>Welcome to PNB Agent! We specialize in providing expert assistance for PNB-related services. Our team is dedicated to ensuring you receive reliable and efficient service to meet all your banking needs.</p>
        </body>
        </html>
    `);
});

// Privacy Policy route
app.get("/Privacy_Policy", (req, res) => {
  res.send(`
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Privacy Policy</title>
        </head>
        <body>
            <h1>Privacy Policy</h1>
            <p>Your privacy is important to us at PNB Agent. This policy outlines how we handle your personal data:</p>
            <ul>
                <li>We collect personal information to provide better service.</li>
                <li>Your data will not be shared with third parties without your consent.</li>
                <li>You have the right to access, modify, or delete your data at any time.</li>
            </ul>
        </body>
        </html>
    `);
});

// Contact Us route
app.get("/Contact_Us", (req, res) => {
  res.send(`
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Contact Us</title>
        </head>
        <body>
            <h1>Contact Us</h1>
            <p>If you have any questions or concerns, feel free to contact us:</p>
            <ul>
                <li>Email: ajayvishwakarma9301@gmail.com </li>
                <li>Phone: +91-9301751642</li>
                <li>Address: PNB Agent Office, barhi , Katni(MP)</li>
            </ul>
        </body>
        </html>
    `);
});

app.get("/notify/:type/:id", (req, res) => {
  console.log(req.params.type); // e.g., "sms"
  console.log(req.params.id); // e.g., "500"
  // res.send('OK');
});
/*
app.post('/payment',(req,res)=>{
  const message = req.body.message;
  console.log(message);
})
*/
app.get("/pic", (req, res) => {
  res.render("pic", {
    filename: "na",
    base64: "na",
  });

  //console.log(req.body.url,req.body.filename);
});
const upload = multer({ dest: "./app/uploads/" }); // Temp storage for uploaded files

// Endpoint to handle file upload
app.post("/pic", upload.single("photo"), (req, res) => {
  const filePath = req.file.path;

  // Read the file and convert it to Base64
  fs.readFile(filePath, (err, data) => {
    if (err) {
      return res.status(500).send("Error reading the file");
    }

    // Convert file to Base64
    const base64String = data.toString("base64");

    // Respond with the Base64 string
    /*  res.json({
      filename: req.file.originalname,
      base64: base64String,
    });
*/
    // Optionally delete the file after conversion
    fs.unlink(filePath, (unlinkErr) => {
      if (unlinkErr) console.error("Error deleting file:", unlinkErr);
      //console.log("created");
      else
        fs.writeFile(
          "./views/pic_load.ejs",
          `<a href="data:image/jpeg;base64,${base64String}" download="${req.file.originalname.replace(
            " ",
            ""
          )}">${req.file.originalname.replace(" ", "")}</a>`,
          (err) => {
            if (err) {
              console.log("an error occur");
            }
          }
        );
      res.redirect("/pic");
    });
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  //console.log(`Server is running on http://localhost:${PORT}`);
});
