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
const msgdb = new sqlite3.Database("msgDb", (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    //console.log('Connected to SQLite database:', dbPath);
  }
});
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
/* ping okayyy 4min
setInterval(() => {
  sites.forEach((site) => {
    axios
      .get(site)

      .catch((err) => console.log(`❌ Error pinging ${site}:`, err.message));
  });
}, 40000); // every 4 minutes
*/

const {
  createPayment,
  markPaymentSuccess,
  expireOldPayments,
  getStatus
} = require('./mgdb');



// UPI QR Generator Route
app.get('/pay/:amount', async (req, res) => {
  const amount = parseFloat(req.params.amount);
  await createPayment(amount);

  const upiId = '9301751642ajay@ybl'; // Replace with your real UPI ID
  const upiUrl = `upi://pay?pa=${upiId}&pn=Ajay%20Vishwakarma&am=${amount}&cu=INR`;

  const qrImage = await QRCode.toDataURL(upiUrl);

  res.render('pay', { amount, qrImage });
});
// Receive SMS Payment Info

app.post('/payment', async (req, res) => {
  const msg = req.body.message;
  const match = msg.match(/Rs\.([\d.]+).*Txn ID[:\s]+(\d+)/i);
  if (!match) return res.send(" Invalid message format");

  const amount = parseFloat(match[1]);
  const txnId = match[2];

  await markPaymentSuccess(amount, txnId);
  res.send(" Payment updated");
});

// Check Status
app.get('/status/:amount', (req, res) => {
  const amount = parseFloat(req.params.amount);
  expireOldPayments();
  getStatus(amount, (err, row) => {
    if (err || !row) return res.send({ status: 'pending' });
    res.send({ status: row.status });
  });
});
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
