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

// আপগ্রেডেড স্কিমা
const trademarkSchema = new mongoose.Schema({
  certificate_no: { type: String, required: true, unique: true },
  owner_name: { type: String, required: true },
  trademark_name: { type: String, required: true },
  status: { type: String, default: 'Active' },
  organization_name: { type: String, default: '' },
  logo_url: { type: String, default: '' },
  custom_notice: { type: String, default: '' },
  issue_date: { type: Date, default: Date.now }
});

const Trademark = mongoose.model('Trademark', trademarkSchema);

// অ্যাডমিন পাসওয়ার্ড যাচাই হেল্পার
function isValidAdminPassword(req) {
  const expectedPassword = process.env.ADMIN_PASSWORD;
  if (!expectedPassword) return true;

  const providedPassword =
    req.headers['x-admin-password'] || (req.body && req.body.adminPassword);
  return providedPassword === expectedPassword;
}

// অ্যাডমিন প্যানেল HTML (নির্দেশনাসহ)
const adminHtml = `<!DOCTYPE html>
<html lang="bn">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>অ্যাডমিন প্যানেল - ট্রেডমার্ক এন্ট্রি ও এডিটর</title>
    <style>
        body { font-family: 'SolaimanLipi', 'Kalpurush', Arial, sans-serif; background-color: #f0f3f6; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 25px 0; }
        .container { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.08); width: 100%; max-width: 500px; box-sizing: border-box; }
        h2 { text-align: center; color: #1a365d; margin-top: 0; margin-bottom: 20px; }
        label { font-weight: bold; font-size: 13.5px; color: #2d3748; display: block; margin-top: 10px; }
        input, select, textarea, button { width: 100%; padding: 10px; margin: 6px 0 6px 0; border: 1px solid #cbd5e0; border-radius: 5px; box-sizing: border-box; font-size: 14.5px; font-family: inherit; }
        .hint-text { font-size: 11.5px; color: #718096; margin-bottom: 10px; display: block; }
        textarea { resize: vertical; min-height: 75px; }
        button { background-color: #1a365d; color: white; border: none; cursor: pointer; font-size: 16px; font-weight: bold; margin-top: 12px; }
        button:hover { background-color: #2b6cb0; }
        button:disabled { background-color: #a0aec0; cursor: not-allowed; }
        .logout-btn { background-color: #e53e3e; margin-top: 8px; }
        .logout-btn:hover { background-color: #c53030; }
        .view-btn { display: inline-block; width: 100%; text-align: center; padding: 10px; background-color: #b7791f; color: white; text-decoration: none; border-radius: 5px; margin-top: 10px; font-weight: bold; box-sizing: border-box; }
        .view-btn:hover { background-color: #975a16; }
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
        <h2>ট্রেডমার্ক এন্ট্রি ও কাস্টমাইজেশন</h2>
        <form id="addCertificateForm">
            <label for="certNo">সার্টিফিকেট নাম্বার *</label>
            <input type="text" id="certNo" placeholder="যেমন: TM-762 বা TM-2026-001" required>

            <label for="ownerName">মালিকের নাম / স্বত্বাধিকারী *</label>
            <input type="text" id="ownerName" placeholder="যেমন: Shaikat Hasan" required>

            <label for="tmName">ট্রেডমার্ক / ব্র্যান্ডের নাম *</label>
            <input type="text" id="tmName" placeholder="যেমন: Bongodb" required>

            <label for="orgName">প্রতিষ্ঠানের নাম / অথরিটি হেডার (ঐচ্ছিক)</label>
            <input type="text" id="orgName" placeholder="যেমন: Intellectual Property Verification Registry">
            <span class="hint-text">ফাঁকা রাখলে ডিফল্ট অফিসিয়াল হেডার ব্যবহৃত হবে।</span>

            <label for="logoUrl">লোগো লিংক (Logo URL - ঐচ্ছিক)</label>
            <input type="url" id="logoUrl" placeholder="https://example.com/logo.png">
            <span class="hint-text">সরাসরি ছবির লিংক দিন (.png, .jpg)। না থাকলে ফাঁকা রাখুন, স্বয়ংক্রিয়ভাবে আসল সিল ব্যবহৃত হবে।</span>

            <label for="status">স্ট্যাটাস:</label>
            <select id="status">
                <option value="Active">Active (সক্রিয়)</option>
                <option value="Pending">Pending (অপেক্ষমাণ)</option>
                <option value="Expired">Expired (মেয়াদোত্তীর্ণ)</option>
            </select>

            <label for="customNotice">কাস্টম সতর্কবার্তা / নোটিশ (ঐচ্ছিক):</label>
            <textarea id="customNotice" placeholder="অননুমোদিত নাম বা লোগো ব্যবহার রোধের জন্য নিজস্ব বার্তা লিখুন..."></textarea>
            <span class="hint-text">ফাঁকা রাখলে সাধারণ স্বত্ব সংরক্ষণ ও আইনি সতর্কবার্তা প্রদর্শিত হবে।</span>

            <button type="submit" id="submitBtn">ডাটাবেইজে সেভ করুন</button>
            <div id="viewCertLink" style="display:none;"></div>
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
    const viewCertLink = document.getElementById('viewCertLink');

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
        viewCertLink.style.display = 'none';
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
        viewCertLink.style.display = 'none';

        const certVal = document.getElementById('certNo').value.trim();
        const data = {
            certificate_no: certVal,
            owner_name: document.getElementById('ownerName').value.trim(),
            trademark_name: document.getElementById('tmName').value.trim(),
            status: document.getElementById('status').value,
            organization_name: document.getElementById('orgName').value.trim(),
            logo_url: document.getElementById('logoUrl').value.trim(),
            custom_notice: document.getElementById('customNotice').value.trim()
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
                viewCertLink.innerHTML = \`<a href="/certificate/\${encodeURIComponent(certVal)}" target="_blank" class="view-btn">📄 সার্টিফিকেট দেখুন ও প্রিন্ট করুন</a>\`;
                viewCertLink.style.display = 'block';
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

// হোম রাউট
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

// সুরক্ষিত ও ফলব্যাক সমৃদ্ধ সার্টিফিকেট ভিউ রাউট
app.get('/certificate/:certificate_no', async (req, res) => {
  try {
    await connectDB();
    const cert = await Trademark.findOne({
      certificate_no: req.params.certificate_no
    });

    if (!cert) {
      return res.status(404).send(`
        <div style="text-align: center; margin-top: 50px; font-family: Arial, sans-serif;">
          <h2>❌ সার্টিফিকেট পাওয়া যায়নি / Certificate Not Found</h2>
          <p>আপনার দেওয়া সার্টিফিকেট নম্বরটি ডাটাবেইজে নেই।</p>
          <a href="/admin" style="color: #007bff; text-decoration: none;">অ্যাডমিন প্যানেলে ফিরে যান</a>
        </div>
      `);
    }

    const formattedDate = new Date(cert.issue_date).toLocaleDateString('bn-BD', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    const formattedDateEn = new Date(cert.issue_date).toLocaleDateString('en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });

    // শীর্ষ লোগো: লিঙ্ক থাকলে দেখাবে, আর লিঙ্ক নষ্ট হলে চুপচাপ হাইড হবে (সার্টিফিকেট নষ্ট করবে না)
    const topLogoHtml = cert.logo_url
      ? `<div style="text-align: center; margin-bottom: 10px;">
           <img src="${cert.logo_url}" alt="Logo" style="max-height: 70px; max-width: 160px; object-fit: contain;" onerror="this.style.display='none';">
         </div>`
      : '';

    // ডিফল্ট গোল্ডেন সিলের HTML
    const defaultGoldSealHtml = `
      <div class="official-gold-seal">
        <div class="seal-inner">
          <span>OFFICIAL</span>
          <strong>VERIFIED</strong>
          <span>SEAL</span>
        </div>
      </div>
    `;

    // নিচের সিল: লিঙ্ক থাকলে লোগো দেখাবে; যদি ইমেজ ভাঙা থাকে তবে স্বয়ংক্রিয়ভাবে গোল্ডেন সিলে ফিরে যাবে
    const bottomSealHtml = cert.logo_url
      ? `<div style="position: relative; display: inline-block;">
           <img src="${cert.logo_url}" alt="Seal" style="max-height: 82px; max-width: 82px; object-fit: contain; border-radius: 50%; border: 3px double #c59b27; padding: 3px; background: #fff;" onerror="this.style.display='none'; document.getElementById('fallback-seal').style.display='flex';">
           <div id="fallback-seal" style="display: none;">${defaultGoldSealHtml}</div>
         </div>`
      : defaultGoldSealHtml;

    // সতর্কবার্তা / নোটিশ লজিক
    const warningNoticeHtml = cert.custom_notice
      ? `<div class="warning-box">
            <strong>সতর্কতা / Proprietary Warning Notice:</strong><br>
            ${cert.custom_notice.replace(/\n/g, '<br>')}
         </div>`
      : `<div class="warning-box">
            <strong>স্বত্ব ও আইনি সতর্কতা / Legal Warning & Notice:</strong><br>
            এই নথিতে উল্লিখিত নাম, ট্রেডমার্ক ও সংশ্লিষ্ট লোগো স্বত্বাধিকারী কর্তৃক সংরক্ষিত। পূর্বানুমোদন ব্যতিরেকে কোনো ব্যক্তি বা প্রতিষ্ঠান কর্তৃক এর অননুমোদিত ব্যবহার, অনুকরণ বা নকল করা সম্পূর্ণ নিষিদ্ধ এবং আইনগত লঙ্ঘনমূলক আচরণ বলে গণ্য হবে।<br>
            <em>Unauthorized copying, reproduction, imitation, or misuse of this brand identity is strictly prohibited.</em>
         </div>`;

    const orgHeader = cert.organization_name || 'AUTHENTIC REGISTERED PROPOSAL & RECORD';

    const certHtml = `<!DOCTYPE html>
<html lang="bn">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Official Trademark Certificate - ${cert.certificate_no}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;800;900&family=Noto+Serif+Bengali:wght@400;600;700&display=swap');

        body {
            background-color: #3b4252;
            margin: 0;
            padding: 25px 0;
            display: flex;
            justify-content: center;
            font-family: 'Noto Serif Bengali', 'SolaimanLipi', 'Kalpurush', Georgia, serif;
        }
        
        .page {
            width: 210mm;
            min-height: 297mm;
            background-color: #fbf9f3;
            background-image: 
                radial-gradient(#eeddb0 0.75px, transparent 0.75px),
                radial-gradient(#eeddb0 0.75px, #fbf9f3 0.75px);
            background-size: 30px 30px;
            background-position: 0 0, 15px 15px;
            padding: 14mm;
            box-sizing: border-box;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            position: relative;
            overflow: hidden;
        }

        .watermark {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) rotate(-30deg);
            font-size: 75px;
            font-family: 'Cinzel', serif;
            font-weight: 900;
            color: rgba(183, 121, 31, 0.05);
            text-transform: uppercase;
            pointer-events: none;
            letter-spacing: 10px;
            white-space: nowrap;
            z-index: 1;
        }

        .outer-border {
            border: 5px solid #0f2b46;
            padding: 5px;
            box-sizing: border-box;
            position: relative;
            z-index: 2;
            background: rgba(251, 249, 243, 0.94);
        }

        .inner-border {
            border: 2px solid #c59b27;
            outline: 1px dashed #c59b27;
            outline-offset: -5px;
            padding: 24px 28px;
            box-sizing: border-box;
            text-align: center;
            position: relative;
        }

        .corner-accent {
            position: absolute;
            width: 18px;
            height: 18px;
            border: 3px solid #c59b27;
        }
        .tl { top: -2px; left: -2px; border-right: none; border-bottom: none; }
        .tr { top: -2px; right: -2px; border-left: none; border-bottom: none; }
        .bl { bottom: -2px; left: -2px; border-right: none; border-top: none; }
        .br { bottom: -2px; right: -2px; border-left: none; border-top: none; }

        .header-top {
            font-family: 'Cinzel', serif;
            letter-spacing: 3px;
            font-size: 11.5px;
            color: #718096;
            margin-bottom: 4px;
            text-transform: uppercase;
            font-weight: 800;
        }
        .main-title-bn {
            font-size: 26px;
            font-weight: 700;
            color: #0f2b46;
            margin: 0;
            letter-spacing: 0.5px;
        }
        .main-title-en {
            font-family: 'Cinzel', serif;
            font-size: 15px;
            font-weight: 700;
            color: #b7791f;
            letter-spacing: 2.5px;
            margin: 4px 0 16px 0;
            text-transform: uppercase;
        }
        .proposal-lead {
            font-size: 13.5px;
            line-height: 1.7;
            color: #2d3748;
            margin: 12px 0;
            text-align: justify;
        }
        
        .details-table {
            width: 100%;
            border-collapse: collapse;
            margin: 16px 0;
            text-align: left;
            background: #fff;
            box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }
        .details-table th, .details-table td {
            border: 1px solid #d2d6dc;
            padding: 9px 12px;
            font-size: 13.5px;
        }
        .details-table th {
            background-color: #f1f5f9;
            color: #0f2b46;
            width: 38%;
            font-weight: 600;
        }
        .status-badge {
            display: inline-block;
            padding: 2px 10px;
            background-color: #def7ec;
            color: #03543f;
            border: 1px solid #84e1bc;
            border-radius: 4px;
            font-weight: bold;
            font-size: 12.5px;
            letter-spacing: 0.5px;
        }
        .warning-box {
            border: 1px solid #fbd38d;
            background-color: #fffaf0;
            border-left: 4px solid #dd6b20;
            padding: 10px 14px;
            margin-top: 14px;
            text-align: justify;
            font-size: 12px;
            color: #7b341e;
            line-height: 1.6;
            border-radius: 2px;
        }
        .statement-text {
            font-size: 12px;
            color: #4a5568;
            line-height: 1.6;
            margin-top: 12px;
            text-align: justify;
        }
        
        .official-gold-seal {
            width: 82px;
            height: 82px;
            background: radial-gradient(circle, #f6e05e, #d69e2e, #b7791f);
            border-radius: 50%;
            padding: 3px;
            box-shadow: 0 4px 8px rgba(0,0,0,0.2), inset 0 0 4px rgba(255,255,255,0.8);
            margin: 0 auto;
            display: flex;
            align-items: center;
            justify-content: center;
            box-sizing: border-box;
        }
        .seal-inner {
            width: 74px;
            height: 74px;
            border: 1.5px dashed #744210;
            border-radius: 50%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            color: #521b02;
            font-family: 'Cinzel', serif;
            font-size: 9px;
            font-weight: 800;
            letter-spacing: 0.5px;
            line-height: 1.1;
        }
        .seal-inner strong {
            font-size: 10.5px;
            color: #3b1101;
            margin: 2px 0;
            letter-spacing: 1px;
        }

        .footer-section {
            margin-top: 40px;
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            padding: 0 10px;
        }
        .sign-box {
            text-align: center;
            width: 180px;
        }
        .sign-line {
            border-top: 1.5px solid #2d3748;
            margin-bottom: 5px;
        }
        .sign-title {
            font-size: 12px;
            color: #4a5568;
            font-weight: bold;
        }
        
        .no-print-bar {
            position: fixed;
            top: 12px;
            right: 15px;
            z-index: 1000;
        }
        .print-btn {
            background-color: #0f2b46;
            color: #ffd700;
            border: 1px solid #ffd700;
            padding: 10px 18px;
            font-size: 14px;
            font-weight: bold;
            border-radius: 5px;
            cursor: pointer;
            box-shadow: 0 3px 10px rgba(0,0,0,0.4);
        }
        .print-btn:hover { background-color: #1a426c; }

        @media print {
            body { background: none; padding: 0; }
            .page { 
                box-shadow: none; 
                padding: 10mm; 
                width: 100%; 
                height: 100%; 
                background-color: #fff !important; 
                background-image: none !important; 
            }
            .outer-border { background: #fff !important; }
            .no-print-bar { display: none; }
        }
    </style>
</head>
<body>

<div class="no-print-bar">
    <button class="print-btn" onclick="window.print()">🖨️ প্রিন্ট / PDF সংরক্ষণ করুন</button>
</div>

<div class="page">
    <div class="watermark">ORIGINAL RECORD</div>

    <div class="outer-border">
        <div class="inner-border">
            <div class="corner-accent tl"></div>
            <div class="corner-accent tr"></div>
            <div class="corner-accent bl"></div>
            <div class="corner-accent br"></div>

            ${topLogoHtml}
            <div class="header-top">${orgHeader}</div>
            <h1 class="main-title-bn">ট্রেডমার্ক নিবন্ধন ও ভেরিফিকেশন সনদ</h1>
            <div class="main-title-en">Certificate of Trademark Registration</div>

            <div class="proposal-lead">
                এতদ্বারা প্রত্যায়ন ও রেকর্ডভুক্ত করা যাচ্ছে যে, সংশ্লিষ্ট কর্তৃপক্ষের নিয়মাবলী অনুসারে নিম্নবর্ণিত ট্রেডমার্ক ও স্বত্বাধিকারীর বিস্তারিত তথ্য ডাটাবেইজে আনুষ্ঠানিকভাবে যাচাই ও গৃহীত হয়েছে।<br>
                <em>This is to officially certify and record that the following trademark and ownership particulars have been duly verified and documented in the official register.</em>
            </div>

            <table class="details-table">
                <tr>
                    <th>সার্টিফিকেট নম্বর / Certificate No.</th>
                    <td><strong>${cert.certificate_no}</strong></td>
                </tr>
                <tr>
                    <th>মালিকের নাম / Owner Name</th>
                    <td>${cert.owner_name}</td>
                </tr>
                <tr>
                    <th>ট্রেডমার্ক / Trademark Name</th>
                    <td><strong style="font-size: 16px; color: #0f2b46;">${cert.trademark_name}</strong></td>
                </tr>
                <tr>
                    <th>স্ট্যাটাস / Current Status</th>
                    <td><span class="status-badge">${cert.status}</span></td>
                </tr>
                <tr>
                    <th>ইস্যুর তারিখ / Date of Issuance</th>
                    <td>${formattedDate} (${formattedDateEn})</td>
                </tr>
            </table>

            ${warningNoticeHtml}

            <div class="statement-text">
                এই নথিটি একটি সংরক্ষিত অফিশিয়াল রেকর্ড হিসেবে গণ্য হবে। যেকোনো সময় এর বৈধতা যাচাই করতে অনলাইন পোর্টালে সার্টিফিকেট নম্বর দিয়ে অনুসন্ধান করা যাবে।<br>
                <em>This document serves as an authentic official record. The validity and status can be verified online through the registered portal using the certificate number.</em>
            </div>

            <div class="footer-section">
                <div class="sign-box">
                    <div class="sign-line"></div>
                    <div class="sign-title">যাচাইকারী কর্মকর্তা<br>Verified By</div>
                </div>

                <div style="text-align: center;">
                    ${bottomSealHtml}
                </div>

                <div class="sign-box">
                    <div class="sign-line"></div>
                    <div class="sign-title">অনুমোদিত স্বাক্ষরকারী<br>Authorized Signatory</div>
                </div>
            </div>
        </div>
    </div>
</div>

</body>
</html>`;

    res.send(certHtml);
  } catch (error) {
    res.status(500).send(`Server Error: ${error.message}`);
  }
});

// লগইন পাসওয়ার্ড যাচাই API
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

// নতুন সার্টিফিকেট যোগ করার API
app.post('/api/add-certificate', async (req, res) => {
  try {
    if (!isValidAdminPassword(req)) {
      return res.status(401).json({ error: 'সঠিক অ্যাডমিন পাসওয়ার্ড প্রয়োজন' });
    }

    await connectDB();

    const {
      certificate_no,
      owner_name,
      trademark_name,
      status,
      organization_name,
      logo_url,
      custom_notice
    } = req.body;

    const newCertificate = new Trademark({
      certificate_no,
      owner_name,
      trademark_name,
      status,
      organization_name,
      logo_url,
      custom_notice
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

// একক সার্টিফিকেট API
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

// সব সার্টিফিকেটের তালিকা API
app.get('/api/certificates', async (req, res) => {
  try {
    await connectDB();
    const certificates = await Trademark.find().sort({ issue_date: -1 });
    res.status(200).json({ count: certificates.length, data: certificates });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// সার্ভার লিসেনিং
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

module.exports = app;
