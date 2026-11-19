require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

app.use(express.json());
app.use(cors());

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

const trademarkSchema = new mongoose.Schema({
  certificate_no: { type: String, required: true, unique: true },
  serial_no: { type: String, default: '' },
  registration_no: { type: String, default: '' },
  owner_name: { type: String, required: true },
  trademark_name: { type: String, required: true },
  status: { type: String, default: 'Active' },
  organization_name: { type: String, default: '' },
  logo_url: { type: String, default: '' },
  custom_notice: { type: String, default: '' },
  verified_by_sign: { type: String, default: '' },
  authorized_sign: { type: String, default: '' },
  issue_date: { type: Date, default: Date.now }
});

const Trademark = mongoose.model('Trademark', trademarkSchema);

function isValidAdminPassword(req) {
  const expectedPassword = process.env.ADMIN_PASSWORD;
  if (!expectedPassword) return true;

  const providedPassword =
    req.headers['x-admin-password'] || (req.body && req.body.adminPassword);
  return providedPassword === expectedPassword;
}

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
            <input type="text" id="certNo" placeholder="যেমন: TM-762 বা 193377" required>

            <label for="serialNo">সিরিয়াল নং / Serial No. (ঐচ্ছিক)</label>
            <input type="text" id="serialNo" placeholder="যেমন: 57266 (ফাঁকা রাখলে স্বয়ংক্রিয়ভাবে বসবে)">

            <label for="regNo">রেজিস্ট্রেশন নং / Registration No. (ঐচ্ছিক)</label>
            <input type="text" id="regNo" placeholder="যেমন: REG-193377 (ফাঁকা রাখলে স্বয়ংক্রিয়ভাবে বসবে)">

            <label for="ownerName">মালিকের নাম / স্বত্বাধিকারী *</label>
            <input type="text" id="ownerName" placeholder="যেমন: Shaikat Hasan" required>

            <label for="tmName">ট্রেডমার্ক / ব্র্যান্ডের নাম *</label>
            <input type="text" id="tmName" placeholder="যেমন: Bongodb" required>

            <label for="orgName">প্রতিষ্ঠানের নাম / অথরিটি হেডার (ঐচ্ছিক)</label>
            <input type="text" id="orgName" placeholder="যেমন: Brand & Trademark Registry Record">
            <span class="hint-text">ফাঁকা রাখলে ডিফল্ট হেডার ব্যবহৃত হবে।</span>

            <label for="logoUrl">লোগো লিংক (Logo URL - ঐচ্ছিক)</label>
            <input type="url" id="logoUrl" placeholder="https://example.com/logo.png">
            <span class="hint-text">সরাসরি ছবির লিংক দিন (.png, .jpg)। পেজের মাঝে বড় লোগো হিসেবে দেখাবে।</span>

            <label for="verifiedSign">বাম পাশের সাইন / নাম (Verified By - ঐচ্ছিক)</label>
            <input type="text" id="verifiedSign" placeholder="যেমন: Shaikat Hasan (ফাঁকা রাখলে চিকন কলমের সাইন বসবে)">

            <label for="authSign">ডান পাশের স্বাক্ষর (Authorized Sign - ঐচ্ছিক)</label>
            <input type="text" id="authSign" placeholder="যেমন: Authorized Officer (ফাঁকা রাখলে চিকন কলমের সাইন বসবে)">

            <label for="status">স্ট্যাটাস:</label>
            <select id="status">
                <option value="Active">Active (সক্রিয়)</option>
                <option value="Pending">Pending (অপেক্ষমাণ)</option>
                <option value="Expired">Expired (মেয়াদোত্তীর্ণ)</option>
            </select>

            <label for="customNotice">কাস্টম সতর্কবার্তা / নোট (ঐচ্ছিক):</label>
            <textarea id="customNotice" placeholder="নোট বা সতর্কবার্তা লিখুন..."></textarea>
            <span class="hint-text">ফাঁকা রাখলে সাধারণ স্বত্ব সংরক্ষণ ও নোট প্রদর্শিত হবে।</span>

            <button type="submit" id="submitBtn">ডাটাবেইজে সেভ করুন</button>
            <div id="viewCertLink" style="display:none;"></div>
            <button type="button" id="logoutBtn" class="logout-btn">লগআউট</button>
        </form>
        <div id="message"></div>
    </div>
</div>

<script>
    var API_BASE_URL = window.location.origin;
    var PASS_STORAGE_KEY = 'tredmark_admin_token';

    var loginSection = document.getElementById('loginSection');
    var adminSection = document.getElementById('adminSection');
    var loginForm = document.getElementById('loginForm');
    var loginBtn = document.getElementById('loginBtn');
    var loginMessage = document.getElementById('loginMessage');
    var adminPasswordInput = document.getElementById('adminPassword');
    var addCertificateForm = document.getElementById('addCertificateForm');
    var submitBtn = document.getElementById('submitBtn');
    var messageDiv = document.getElementById('message');
    var logoutBtn = document.getElementById('logoutBtn');
    var viewCertLink = document.getElementById('viewCertLink');

    function showAdminPanel() {
        loginSection.style.display = 'none';
        adminSection.style.display = 'block';
    }

    function showLoginPanel(msg, color) {
        sessionStorage.removeItem(PASS_STORAGE_KEY);
        adminSection.style.display = 'none';
        loginSection.style.display = 'block';
        loginMessage.style.color = color || 'red';
        loginMessage.innerText = msg || '';
    }

    function verifyPassword(password) {
        return fetch(API_BASE_URL + '/api/admin-login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-password': password
            },
            body: JSON.stringify({ password: password })
        });
    }

    (function initSession() {
        var savedPass = sessionStorage.getItem(PASS_STORAGE_KEY);
        if (!savedPass) {
            showLoginPanel('', 'red');
            return;
        }
        verifyPassword(savedPass)
            .then(function(res) {
                if (res.ok) {
                    showAdminPanel();
                } else {
                    showLoginPanel('', 'red');
                }
            })
            .catch(function() {
                showLoginPanel('', 'red');
            });
    })();

    loginForm.addEventListener('submit', function(e) {
        e.preventDefault();
        var enteredPassword = adminPasswordInput.value.trim();
        if (!enteredPassword) {
            loginMessage.style.color = 'red';
            loginMessage.innerText = 'অনুগ্রহ করে পাসওয়ার্ড লিখুন';
            return;
        }

        loginBtn.disabled = true;
        loginMessage.style.color = 'blue';
        loginMessage.innerText = 'পাসওয়ার্ড যাচাই হচ্ছে...';

        verifyPassword(enteredPassword)
            .then(function(response) {
                return response.json().then(function(result) {
                    return { ok: response.ok, result: result };
                });
            })
            .then(function(data) {
                if (data.ok) {
                    sessionStorage.setItem(PASS_STORAGE_KEY, enteredPassword);
                    adminPasswordInput.value = '';
                    loginMessage.innerText = '';
                    showAdminPanel();
                } else {
                    showLoginPanel((data.result && data.result.error) || 'ভুল পাসওয়ার্ড! আবার চেষ্টা করুন।', 'red');
                }
            })
            .catch(function() {
                loginMessage.style.color = 'red';
                loginMessage.innerText = '❌ সার্ভারের সাথে কানেক্ট করা যাচ্ছে না!';
            })
            .finally(function() {
                loginBtn.disabled = false;
            });
    });

    logoutBtn.addEventListener('click', function() {
        messageDiv.innerText = '';
        viewCertLink.style.display = 'none';
        adminPasswordInput.value = '';
        showLoginPanel('', 'red');
    });

    addCertificateForm.addEventListener('submit', function(e) {
        e.preventDefault();

        var currentPassword = sessionStorage.getItem(PASS_STORAGE_KEY) || '';
        if (!currentPassword) {
            showLoginPanel('সেশন শেষ হয়েছে, আবার লগইন করুন।', 'red');
            return;
        }

        submitBtn.disabled = true;
        messageDiv.style.color = 'blue';
        messageDiv.innerText = 'ডাটা সেভ হচ্ছে, অনুগ্রহ করে অপেক্ষা করুন...';
        viewCertLink.style.display = 'none';

        var certVal = document.getElementById('certNo').value.trim();
        var payload = {
            certificate_no: certVal,
            serial_no: document.getElementById('serialNo').value.trim(),
            registration_no: document.getElementById('regNo').value.trim(),
            owner_name: document.getElementById('ownerName').value.trim(),
            trademark_name: document.getElementById('tmName').value.trim(),
            status: document.getElementById('status').value,
            organization_name: document.getElementById('orgName').value.trim(),
            logo_url: document.getElementById('logoUrl').value.trim(),
            verified_by_sign: document.getElementById('verifiedSign').value.trim(),
            authorized_sign: document.getElementById('authSign').value.trim(),
            custom_notice: document.getElementById('customNotice').value.trim()
        };

        fetch(API_BASE_URL + '/api/add-certificate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-password': currentPassword
            },
            body: JSON.stringify(payload)
        })
            .then(function(response) {
                return response.json().then(function(result) {
                    return { status: response.status, ok: response.ok, result: result };
                });
            })
            .then(function(resData) {
                if (resData.ok) {
                    messageDiv.style.color = 'green';
                    messageDiv.innerText = '✅ সফলভাবে ডাটাবেইজে যোগ করা হয়েছে!';
                    viewCertLink.innerHTML = '<a href="/certificate/' + encodeURIComponent(certVal) + '" target="_blank" class="view-btn">📄 সার্টিফিকেট দেখুন ও প্রিন্ট করুন</a>';
                    viewCertLink.style.display = 'block';
                    addCertificateForm.reset();
                } else if (resData.status === 401) {
                    showLoginPanel('❌ ভুল পাসওয়ার্ড! আবার লগইন করুন।', 'red');
                } else {
                    messageDiv.style.color = 'red';
                    messageDiv.innerText = '❌ এরর: ' + ((resData.result && resData.result.error) || 'সেভ করা যায়নি!');
                }
            })
            .catch(function() {
                messageDiv.style.color = 'red';
                messageDiv.innerText = '❌ সার্ভারের সাথে কানেক্ট করা যাচ্ছে না!';
            })
            .finally(function() {
                submitBtn.disabled = false;
            });
    });
</script>
</body>
</html>`;

app.get('/', async (req, res) => {
  try {
    await connectDB();
    res.send('Trademark API is running smoothly!');
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/admin', (req, res) => {
  res.send(adminHtml);
});

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

    const displaySerialNo = cert.serial_no || ('SL-' + cert.certificate_no);
    const displayRegNo = cert.registration_no || ('REG-' + cert.certificate_no);

    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.get('host');
    const fullVerifyUrl = protocol + '://' + host + '/certificate/' + encodeURIComponent(cert.certificate_no);
    const qrImageUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=140x140&margin=4&data=' + encodeURIComponent(fullVerifyUrl);

    // চিকন কলমের লেখার মতো সাইন
    const verifiedSignatureHtml = cert.verified_by_sign
      ? '<div class="pen-signature">' + cert.verified_by_sign + '</div>'
      : `<svg class="pen-svg" viewBox="0 0 180 45" xmlns="http://www.w3.org/2000/svg">
           <path d="M16 32 C26 14, 38 12, 42 28 C45 36, 55 19, 72 22 C84 25, 88 34, 106 21 C120 12, 135 28, 156 24" fill="none" stroke="#102a56" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
           <path d="M35 35 L140 32" fill="none" stroke="#102a56" stroke-width="0.8" stroke-linecap="round" opacity="0.7"/>
         </svg>`;

    const authorizedSignatureHtml = cert.authorized_sign
      ? '<div class="pen-signature">' + cert.authorized_sign + '</div>'
      : `<svg class="pen-svg" viewBox="0 0 180 45" xmlns="http://www.w3.org/2000/svg">
           <path d="M18 29 C32 10, 46 34, 62 19 C74 8, 84 33, 102 22 C116 15, 128 30, 158 20" fill="none" stroke="#102a56" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>
           <path d="M70 35 C96 32, 124 32, 150 30" fill="none" stroke="#102a56" stroke-width="0.8" stroke-linecap="round" opacity="0.75"/>
         </svg>`;

    // মাঝে বড় করে প্রদর্শিত ব্র্যান্ড লোগো (লোগো লিংক থাকলে দেখাবে, নষ্ট হলে হাইড হবে)
    const centerLogoHtml = cert.logo_url
      ? `<div class="center-logo-box">
           <img src="${cert.logo_url}" alt="${cert.trademark_name}" onerror="this.parentElement.style.display='none';">
         </div>`
      : '';

    const defaultGoldSealHtml = `
      <div class="official-gold-seal">
        <div class="seal-inner">
          <span>OFFICIAL</span>
          <strong>VERIFIED</strong>
          <span>SEAL</span>
        </div>
      </div>
    `;

    const warningNoticeHtml = cert.custom_notice
      ? '<div class="warning-box"><strong>নোট ও সতর্কতা / Note & Warning:</strong><br>' + cert.custom_notice.replace(/\n/g, '<br>') + '</div>'
      : `<div class="warning-box">
            <strong>স্বত্ব ও নোট / Proprietary Note:</strong><br>
            এই নথিতে উল্লিখিত নাম, ট্রেডমার্ক ও সংশ্লিষ্ট লোগো স্বত্বাধিকারী কর্তৃক সংরক্ষিত। পূর্বানুমোদন ব্যতিরেকে এর অননুমোদিত ব্যবহার, অনুকরণ বা নকল করা সম্পূর্ণ নিষিদ্ধ। মালিকানা বা ঠিকানায় কোনো পরিবর্তন হলে যথাযথ কর্তৃপক্ষকে অবহিত করতে হবে।<br>
            <em>Unauthorized copying, reproduction, or misuse of this brand identity is strictly prohibited. Any change of ownership or particulars should be promptly recorded.</em>
         </div>`;

    const orgHeader = cert.organization_name || 'BRAND & TRADEMARK REGISTRY RECORD';

    const certHtml = `<!DOCTYPE html>
<html lang="bn">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Certificate Record - ${cert.certificate_no}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Caveat:wght@400;500&family=Cinzel:wght@600;700;800;900&family=Noto+Serif+Bengali:wght@400;600;700&display=swap');

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
            padding: 20px 26px;
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

        .top-meta-row {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            margin-bottom: 8px;
            font-size: 12px;
            color: #2d3748;
            font-weight: 600;
        }
        .handwritten-serial-no {
            font-family: 'Caveat', cursive;
            font-size: 19px;
            font-weight: 400;
            color: #102a56;
            letter-spacing: 0.6px;
            transform: rotate(-1.2deg);
            display: inline-block;
            border-bottom: 1px dotted #94a3b8;
            padding: 0 6px;
        }

        .header-top {
            font-family: 'Cinzel', serif;
            letter-spacing: 2.5px;
            font-size: 11.5px;
            color: #718096;
            margin-bottom: 4px;
            text-transform: uppercase;
            font-weight: 800;
        }
        .main-title-bn {
            font-size: 25px;
            font-weight: 700;
            color: #0f2b46;
            margin: 0;
        }
        .main-title-en {
            font-family: 'Cinzel', serif;
            font-size: 14.5px;
            font-weight: 700;
            color: #b7791f;
            letter-spacing: 2px;
            margin: 4px 0 12px 0;
            text-transform: uppercase;
        }

        .ref-date-bar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-top: 1px solid #d2d6dc;
            border-bottom: 1px solid #d2d6dc;
            padding: 7px 4px;
            margin: 10px 0 12px 0;
            font-size: 13px;
            color: #0f2b46;
            font-weight: 600;
        }
        .handwritten-inline-no {
            font-family: 'Caveat', cursive;
            font-size: 19px;
            font-weight: 400;
            color: #102a56;
            letter-spacing: 0.5px;
        }

        .proposal-lead {
            font-size: 13.3px;
            line-height: 1.65;
            color: #2d3748;
            margin: 10px 0;
            text-align: justify;
        }

        /* মাঝে বড় ব্র্যান্ড লোগো শোকেস */
        .center-logo-box {
            margin: 16px auto;
            padding: 12px 20px;
            max-width: 260px;
            background: rgba(255, 255, 255, 0.75);
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .center-logo-box img {
            max-height: 115px;
            max-width: 220px;
            object-fit: contain;
            display: block;
        }

        .details-table {
            width: 100%;
            border-collapse: collapse;
            margin: 12px 0;
            text-align: left;
            background: #fff;
            box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }
        .details-table th, .details-table td {
            border: 1px solid #d2d6dc;
            padding: 7.5px 12px;
            font-size: 13px;
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
            font-size: 12px;
        }

        .warning-box {
            border: 1px solid #fbd38d;
            background-color: #fffaf0;
            border-left: 4px solid #dd6b20;
            padding: 8.5px 12px;
            margin-top: 10px;
            text-align: justify;
            font-size: 11.5px;
            color: #7b341e;
            line-height: 1.5;
            border-radius: 2px;
        }

        .bottom-meta-row {
            margin-top: 14px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 12px;
        }
        .statement-text {
            flex: 1;
            font-size: 11.5px;
            color: #4a5568;
            line-height: 1.5;
            text-align: justify;
        }
        .qr-box {
            text-align: center;
            background: #fff;
            border: 1.5px solid #975a16;
            padding: 4px;
            border-radius: 4px;
            flex-shrink: 0;
        }
        .qr-box img {
            display: block;
            width: 76px;
            height: 76px;
        }

        .official-gold-seal {
            width: 82px;
            height: 82px;
            background: radial-gradient(circle, #d69e2e, #975a16, #744210);
            border: 2px solid #521b02;
            border-radius: 50%;
            padding: 3px;
            box-shadow: 0 4px 10px rgba(0,0,0,0.32), inset 0 0 5px rgba(255,235,170,0.55);
            margin: 0 auto;
            display: flex;
            align-items: center;
            justify-content: center;
            box-sizing: border-box;
        }
        .seal-inner {
            width: 72px;
            height: 72px;
            border: 1.5px dashed #ffecb3;
            border-radius: 50%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            color: #fff8dc;
            font-family: 'Cinzel', serif;
            font-size: 8.8px;
            font-weight: 800;
            letter-spacing: 0.6px;
            line-height: 1.15;
            text-shadow: 0 1px 1px rgba(0,0,0,0.5);
        }
        .seal-inner strong {
            font-size: 10px;
            color: #ffffff;
            margin: 2px 0;
            letter-spacing: 0.9px;
        }

        .footer-section {
            margin-top: 24px;
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            padding: 0 8px;
        }
        .sign-box {
            text-align: center;
            width: 180px;
        }
        .sign-space {
            height: 38px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 3px;
        }
        .pen-signature {
            font-family: 'Caveat', cursive;
            font-size: 20px;
            font-weight: 400;
            color: #102a56;
            transform: rotate(-2deg);
            line-height: 1;
        }
        .pen-svg {
            width: 150px;
            height: 36px;
            display: block;
        }
        .sign-line {
            border-top: 1.5px solid #2d3748;
            margin-bottom: 5px;
        }
        .sign-title {
            font-size: 11.8px;
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

            <div class="top-meta-row">
                <span>RECORD REF: <strong>${cert.certificate_no}</strong></span>
                <span>সিরিয়াল নং / Serial No.: <span class="handwritten-serial-no">${displaySerialNo}</span></span>
            </div>

            <div class="header-top">${orgHeader}</div>
            <h1 class="main-title-bn">ট্রেডমার্ক নিবন্ধন ও ভেরিফিকেশন সনদ</h1>
            <div class="main-title-en">Certificate of Trademark Registration</div>

            <div class="ref-date-bar">
                <span>রেজিস্ট্রেশন নং / Reg. No.: <span class="handwritten-inline-no">${displayRegNo}</span></span>
                <span>তারিখ / Date: <strong>${formattedDateEn}</strong></span>
            </div>

            <div class="proposal-lead">
                এতদ্বারা প্রত্যায়ন ও রেকর্ডভুক্ত করা যাচ্ছে যে, <strong>${cert.owner_name}</strong>-এর নামে <strong>${cert.trademark_name}</strong> ট্রেডমার্ক/ব্র্যান্ডের নিবন্ধন ও সংশ্লিষ্ট তথ্য ডাটাবেইজে আনুষ্ঠানিকভাবে যাচাই ও সংরক্ষণ করা হয়েছে।<br>
                <em>This is to certify that the trademark / brand representation <strong>${cert.trademark_name}</strong> has been recorded and verified in the name of <strong>${cert.owner_name}</strong> under Certificate No. <strong>${cert.certificate_no}</strong> (${displayRegNo}) as of <strong>${formattedDateEn}</strong>.</em>
            </div>

            ${centerLogoHtml}

            <table class="details-table">
                <tr>
                    <th>সার্টিফিকেট নম্বর / Certificate No.</th>
                    <td><span class="handwritten-inline-no">${cert.certificate_no}</span></td>
                </tr>
                <tr>
                    <th>রেজিস্ট্রেশন নং / Registration No.</th>
                    <td><strong>${displayRegNo}</strong></td>
                </tr>
                <tr>
                    <th>মালিকের নাম / Owner Name</th>
                    <td>${cert.owner_name}</td>
                </tr>
                <tr>
                    <th>ট্রেডমার্ক / Trademark Name</th>
                    <td><strong style="color: #0f2b46;">${cert.trademark_name}</strong></td>
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

            <div class="bottom-meta-row">
                <div class="statement-text">
                    এই নথিটি একটি সংরক্ষিত অফিশিয়াল রেকর্ড হিসেবে গণ্য হবে। যেকোনো সময় এর বৈধতা যাচাই করতে অনলাইন পোর্টালে সার্টিফিকেট নম্বর দিয়ে অনুসন্ধান করা যাবে অথবা QR কোড স্ক্যান করা যাবে।<br>
                    <em>This document serves as an authentic record. Validity and status can be verified anytime online using the certificate number or by scanning the QR code.</em>
                </div>
                <div class="qr-box">
                    <img src="${qrImageUrl}" alt="Verification QR Code" onerror="this.parentElement.style.display='none';">
                </div>
            </div>

            <div class="footer-section">
                <div class="sign-box">
                    <div class="sign-space">${verifiedSignatureHtml}</div>
                    <div class="sign-line"></div>
                    <div class="sign-title">যাচাইকারী কর্মকর্তা<br>Verified By</div>
                </div>

                <div style="text-align: center;">
                    ${defaultGoldSealHtml}
                </div>

                <div class="sign-box">
                    <div class="sign-space">${authorizedSignatureHtml}</div>
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

app.post('/api/add-certificate', async (req, res) => {
  try {
    if (!isValidAdminPassword(req)) {
      return res.status(401).json({ error: 'সঠিক অ্যাডমিন পাসওয়ার্ড প্রয়োজন' });
    }

    await connectDB();

    const {
      certificate_no,
      serial_no,
      registration_no,
      owner_name,
      trademark_name,
      status,
      organization_name,
      logo_url,
      verified_by_sign,
      authorized_sign,
      custom_notice
    } = req.body;

    const newCertificate = new Trademark({
      certificate_no,
      serial_no,
      registration_no,
      owner_name,
      trademark_name,
      status,
      organization_name,
      logo_url,
      verified_by_sign,
      authorized_sign,
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

app.get('/api/certificates', async (req, res) => {
  try {
    await connectDB();
    const certificates = await Trademark.find().sort({ issue_date: -1 });
    res.status(200).json({ count: certificates.length, data: certificates });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

module.exports = app;
