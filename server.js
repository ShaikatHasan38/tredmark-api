require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

// মিডলওয়্যার (Middleware)
app.use(express.json());
app.use(cors());

// Vercel Serverless এর জন্য MongoDB কানেকশন ক্যাশিং
let cached = global.mongoose;
if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function connectDB() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI environment variable is missing');
  }

  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: 10000,
      })
      .then((mongooseInstance) => {
        console.log('MongoDB Connected Successfully!');
        return mongooseInstance;
      })
      .catch((err) => {
        console.error('Database connection failed:', err);
        cached.promise = null;
        throw err;
      });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}

// ট্রেডমার্ক স্কিমা (Schema)
const trademarkSchema = new mongoose.Schema({
  certificate_no: { type: String, required: true, unique: true },
  owner_name: { type: String, required: true },
  trademark_name: { type: String, required: true },
  status: { type: String, default: 'Active' },
  issue_date: { type: Date, default: Date.now }
});

const Trademark = mongoose.model('Trademark', trademarkSchema);

// অ্যাডমিন পাসওয়ার্ড যাচাই করার হেল্পার
function isValidAdminPassword(req) {
  const expectedPassword = process.env.ADMIN_PASSWORD;
  if (!expectedPassword) return true;

  const providedPassword =
    req.headers['x-admin-password'] || (req.body && req.body.adminPassword);
  return providedPassword === expectedPassword;
}

// অ্যাডমিন প্যানেল HTML (সিঙ্গেল ফাইল থেকে সার্ভ করার জন্য)
const adminHtml = `<!DOCTYPE html>
<html lang="bn">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>অ্যাডমিন প্যানেল - ট্রেডমার্ক এন্ট্রি</title>
    <style>
        body { font-family: Arial, sans-serif; background-color: #f4f7f6; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 20px 0; }
        .container { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); width: 100%; max-width: 400px; }
        h2 { text-align: center; color: #333; margin-top: 0; margin-bottom: 20px; }
        input, select, button { width: 100%; padding: 10px; margin: 10px 0; border: 1px solid #ccc; border-radius: 5px; box-sizing: border-box; }
        button { background-color: #28a745; color: white; border: none; cursor: pointer; font-size: 16px; font-weight: bold; }
        button:hover { background-color: #218838; }
        button:disabled { background-color: #6c757d; cursor: not-allowed; }
        .logout-btn { background-color: #dc3545; margin-top: 5px; }
        .logout-btn:hover { background-color: #c82333; }
        #message, #loginMessage { text-align: center; margin-top: 15px; font-weight: bold; }
    </style>
</head>
<body>
<div class="container">
    <div id="loginSection">
        <h2>অ্যাডমিন লগইন</h2>
        <form id="loginForm">
            <label for="adminPassword">অ্যাডমিন পাসওয়ার্ড:</label>
            <input type="password" id="adminPassword" placeholder="পাসওয়ার্ড লিখুন" required>
            <button type="submit" id="loginBtn">প্রবেশ করুন</button>
        </form>
        <div id="loginMessage"></div>
    </div>

    <div id="adminSection" style="display: none;">
        <h2>নতুন ট্রেডমার্ক যোগ করুন</h2>
        <form id="addCertificateForm">
            <label for="certNo">সার্টিফিকেট নাম্বার:</label>
            <input type="text" id="certNo" placeholder="যেমন: TM-2026-001" required>

            <label for="ownerName">মালিকের নাম:</label>
            <input type="text" id="ownerName" placeholder="যেমন: Shaikat Hasan" required>

            <label for="tmName">ট্রেডমার্কের নাম:</label>
            <input type="text" id="tmName" placeholder="যেমন: Smart Brand" required>

            <label for="status">স্ট্যাটাস:</label>
            <select id="status">
                <option value="Active">Active (সক্রিয়)</option>
                <option value="Pending">Pending (অপেক্ষমাণ)</option>
                <option value="Expired">Expired (মেয়াদোত্তীর্ণ)</option>
            </select>

            <button type="submit" id="submitBtn">ডাটাবেইজে সেভ করুন</button>
            <button type="button" id="logoutBtn" class="logout-btn">লগআউট</button>
        </form>
        <div id="message"></div>
    </div>
</div>

<script>
    const API_BASE_URL = window.location.origin;
    const PASS_STORAGE_KEY = 'tredmark_admin_token';

    const loginSection = document.getElementById('loginSection');
    const adminSection = document.getElementById('adminSection');
    const loginForm = document.getElementById('loginForm');
    const loginBtn = document.getElementById('loginBtn');
    const loginMessage = document.getElementById('loginMessage');
    const adminPasswordInput = document.getElementById('adminPassword');
    const addCertificateForm = document.getElementById('addCertificateForm');
    const submitBtn = document.getElementById('submitBtn');
    const messageDiv = document.getElementById('message');
    const logoutBtn = document.getElementById('logoutBtn');

    function showAdminPanel() {
        loginSection.style.display = 'none';
        adminSection.style.display = 'block';
    }

    function showLoginPanel(msg = '', color = 'red') {
        sessionStorage.removeItem(PASS_STORAGE_KEY);
        adminSection.style.display = 'none';
        loginSection.style.display = 'block';
        loginMessage.style.color = color;
        loginMessage.innerText = msg;
    }

    async function verifyPassword(password) {
        return fetch(\`\${API_BASE_URL}/api/admin-login\`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-password': password
            },
            body: JSON.stringify({ password })
        });
    }

    (async function initSession() {
        const savedPass = sessionStorage.getItem(PASS_STORAGE_KEY);
        if (!savedPass) {
            showLoginPanel('');
            return;
        }
        try {
            const res = await verifyPassword(savedPass);
            if (res.ok) {
                showAdminPanel();
            } else {
                showLoginPanel('');
            }
        } catch (err) {
            showLoginPanel('');
        }
    })();

    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        const enteredPassword = adminPasswordInput.value.trim();
        if (!enteredPassword) {
            loginMessage.style.color = 'red';
            loginMessage.innerText = 'অনুগ্রহ করে পাসওয়ার্ড লিখুন';
            return;
        }

        loginBtn.disabled = true;
        loginMessage.style.color = 'blue';
        loginMessage.innerText = 'পাসওয়ার্ড যাচাই হচ্ছে...';

        try {
            const response = await verifyPassword(enteredPassword);
            const result = await response.json();

            if (response.ok) {
                sessionStorage.setItem(PASS_STORAGE_KEY, enteredPassword);
                adminPasswordInput.value = '';
                loginMessage.innerText = '';
                showAdminPanel();
            } else {
                showLoginPanel(result.error || 'ভুল পাসওয়ার্ড! আবার চেষ্টা করুন।', 'red');
            }
        } catch (error) {
            loginMessage.style.color = 'red';
            loginMessage.innerText = '❌ সার্ভারের সাথে কানেক্ট করা যাচ্ছে না!';
        } finally {
            loginBtn.disabled = false;
        }
    });

    logoutBtn.addEventListener('click', function() {
        messageDiv.innerText = '';
        adminPasswordInput.value = '';
        showLoginPanel('');
    });

    addCertificateForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        const currentPassword = sessionStorage.getItem(PASS_STORAGE_KEY) || '';
        if (!currentPassword) {
            showLoginPanel('সেশন শেষ হয়েছে, আবার লগইন করুন।', 'red');
            return;
        }

        submitBtn.disabled = true;
        messageDiv.style.color = 'blue';
        messageDiv.innerText = 'ডাটা সেভ হচ্ছে, অনুগ্রহ করে অপেক্ষা করুন...';

        const data = {
            certificate_no: document.getElementById('certNo').value.trim(),
            owner_name: document.getElementById('ownerName').value.trim(),
            trademark_name: document.getElementById('tmName').value.trim(),
            status: document.getElementById('status').value
        };

        try {
            const response = await fetch(\`\${API_BASE_URL}/api/add-certificate\`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-password': currentPassword
                },
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (response.ok) {
                messageDiv.style.color = 'green';
                messageDiv.innerText = '✅ সফলভাবে ডাটাবেইজে যোগ করা হয়েছে!';
                addCertificateForm.reset();
            } else if (response.status === 401) {
                showLoginPanel('❌ ভুল পাসওয়ার্ড! আবার লগইন করুন।', 'red');
            } else {
                messageDiv.style.color = 'red';
                messageDiv.innerText = '❌ এরর: ' + (result.error || 'সেভ করা যায়নি!');
            }
        } catch (error) {
            messageDiv.style.color = 'red';
            messageDiv.innerText = '❌ সার্ভারের সাথে কানেক্ট করা যাচ্ছে না!';
        } finally {
            submitBtn.disabled = false;
        }
    });
</script>
</body>
</html>`;

// হোম রাউট (API টেস্ট করার জন্য)
app.get('/', async (req, res) => {
  try {
    await connectDB();
    res.send('Trademark API is running smoothly!');
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// অ্যাডমিন প্যানেল রাউট
app.get('/admin', (req, res) => {
  res.send(adminHtml);
});

// লগইন পাসওয়ার্ড যাচাই করার API
app.post('/api/admin-login', (req, res) => {
  const expectedPassword = process.env.ADMIN_PASSWORD;
  if (!expectedPassword) {
    return res.status(200).json({ success: true });
  }

  const providedPassword =
    req.headers['x-admin-password'] || (req.body && req.body.password);

  if (providedPassword === expectedPassword) {
    return res.status(200).json({ success: true });
  }

  return res.status(401).json({ error: 'ভুল পাসওয়ার্ড! আবার চেষ্টা করুন।' });
});

// নতুন সার্টিফিকেট অ্যাড করার API (পাসওয়ার্ড সুরক্ষিত)
app.post('/api/add-certificate', async (req, res) => {
  try {
    if (!isValidAdminPassword(req)) {
      return res.status(401).json({ error: 'সঠিক অ্যাডমিন পাসওয়ার্ড প্রয়োজন' });
    }

    await connectDB();

    const { certificate_no, owner_name, trademark_name, status } = req.body;
    const newCertificate = new Trademark({
      certificate_no,
      owner_name,
      trademark_name,
      status
    });

    await newCertificate.save();
    res.status(201).json({ message: 'Certificate saved successfully', data: newCertificate });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'এই সার্টিফিকেট নম্বরটি আগে থেকেই রয়েছে' });
    }
    res.status(500).json({ error: error.message });
  }
});

// সার্টিফিকেট নম্বর দিয়ে নির্দিষ্ট তথ্য খোঁজার API
app.get('/api/certificate/:certificate_no', async (req, res) => {
  try {
    await connectDB();
    const certificate = await Trademark.findOne({
      certificate_no: req.params.certificate_no
    });

    if (!certificate) {
      return res.status(404).json({ error: 'এই সার্টিফিকেট নম্বরটি পাওয়া যায়নি' });
    }

    res.status(200).json({ success: true, data: certificate });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ডেটাবেজের সব ট্রেডমার্ক তালিকা দেখার API
app.get('/api/certificates', async (req, res) => {
  try {
    await connectDB();
    const certificates = await Trademark.find().sort({ issue_date: -1 });
    res.status(200).json({ count: certificates.length, data: certificates });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// সার্ভার পোর্ট চালু করা
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

module.exports = app;
