require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ limit: '15mb', extended: true }));
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

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const trademarkSchema = new mongoose.Schema({
  certificate_no: { type: String, required: true, unique: true },
  trademark_name: { type: String, required: true },
  owner_name: { type: String, default: '' },
  status: { type: String, default: 'Registered & Active' },
  document_file: { type: String, default: '' },
  document_mime_type: { type: String, default: '' },
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
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Admin Panel - Brand Registry Portal</title>
    <style>
        body { font-family: Arial, sans-serif; background-color: #f1f5f9; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 20px; }
        .container { background: white; padding: 28px; border-radius: 10px; box-shadow: 0 6px 20px rgba(0,0,0,0.08); width: 100%; max-width: 450px; box-sizing: border-box; }
        h2 { text-align: center; color: #14532d; margin-top: 0; margin-bottom: 20px; }
        label { font-weight: bold; font-size: 13.5px; color: #1e293b; display: block; margin-top: 12px; }
        input, select, button { width: 100%; padding: 10px; margin: 6px 0; border: 1px solid #cbd5e1; border-radius: 6px; box-sizing: border-box; font-size: 14.5px; font-family: inherit; }
        .file-box { background: #f8fafc; border: 1.5px dashed #94a3b8; padding: 12px; border-radius: 6px; margin-top: 8px; }
        button { background-color: #15803d; color: white; border: none; cursor: pointer; font-size: 15.5px; font-weight: bold; margin-top: 16px; }
        button:hover { background-color: #166534; }
        button:disabled { background-color: #94a3b8; cursor: not-allowed; }
        .logout-btn { background-color: #dc2626; margin-top: 8px; }
        .logout-btn:hover { background-color: #b91c1c; }
        .view-btn { display: inline-block; width: 100%; text-align: center; padding: 10px; background-color: #0f172a; color: white; text-decoration: none; border-radius: 6px; margin-top: 12px; font-weight: bold; box-sizing: border-box; }
        #message, #loginMessage { text-align: center; margin-top: 14px; font-weight: bold; }
    </style>
</head>
<body>
<div class="container">
    <div id="loginSection">
        <h2>Portal Admin Login</h2>
        <form id="loginForm">
            <label for="adminPassword">Admin Password</label>
            <input type="password" id="adminPassword" placeholder="Enter admin password" required>
            <button type="submit" id="loginBtn">Login</button>
        </form>
        <div id="loginMessage"></div>
    </div>

    <div id="adminSection" style="display: none;">
        <h2>Add Trademark Record</h2>
        <form id="addCertificateForm">
            <label for="certNo">Serial / Trademark Number *</label>
            <input type="text" id="certNo" placeholder="e.g. 193490 or TM-101" required>

            <label for="tmName">Trademark / Record Name *</label>
            <input type="text" id="tmName" placeholder="e.g. Brand Name" required>

            <label for="ownerName">Proprietor / Owner (Optional)</label>
            <input type="text" id="ownerName" placeholder="e.g. Owner Name">

            <label for="status">Status</label>
            <select id="status">
                <option value="Registered & Active">Registered & Active</option>
                <option value="Pending Verification">Pending Verification</option>
                <option value="Archived">Archived</option>
            </select>

            <div class="file-box">
                <label for="certFile" style="margin-top:0;">Choose Certificate File (Image / PDF) *</label>
                <input type="file" id="certFile" accept="image/*,application/pdf" required>
            </div>

            <button type="submit" id="submitBtn">Save to Portal Database</button>
            <div id="viewCertLink" style="display:none;"></div>
            <button type="button" id="logoutBtn" class="logout-btn">Logout</button>
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
            loginMessage.innerText = 'Please enter the admin password';
            return;
        }

        loginBtn.disabled = true;
        loginMessage.style.color = 'blue';
        loginMessage.innerText = 'Verifying...';

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
                    showLoginPanel((data.result && data.result.error) || 'Invalid password!', 'red');
                }
            })
            .catch(function() {
                loginMessage.style.color = 'red';
                loginMessage.innerText = 'Connection failed!';
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

    function compressImage(file) {
        return new Promise(function(resolve, reject) {
            var img = new Image();
            var reader = new FileReader();
            reader.onload = function(e) { img.src = e.target.result; };
            reader.onerror = reject;
            img.onload = function() {
                var maxWidth = 1400;
                var width = img.width;
                var height = img.height;
                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }
                var canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                var ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve({ base64: canvas.toDataURL('image/jpeg', 0.8), mimeType: 'image/jpeg' });
            };
            img.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    function readFile(file) {
        return new Promise(function(resolve, reject) {
            if (!file) {
                reject(new Error('Please choose a certificate file'));
                return;
            }
            if (file.type && file.type.startsWith('image/')) {
                compressImage(file).then(resolve).catch(reject);
                return;
            }
            if (file.size > 2.5 * 1024 * 1024) {
                reject(new Error('PDF file must be under 2.5 MB'));
                return;
            }
            var reader = new FileReader();
            reader.onload = function() {
                resolve({ base64: reader.result, mimeType: file.type });
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    addCertificateForm.addEventListener('submit', function(e) {
        e.preventDefault();

        var currentPassword = sessionStorage.getItem(PASS_STORAGE_KEY) || '';
        if (!currentPassword) {
            showLoginPanel('Session expired. Please log in again.', 'red');
            return;
        }

        var fileInput = document.getElementById('certFile');
        var selectedFile = fileInput.files && fileInput.files[0];
        var certVal = document.getElementById('certNo').value.trim();
        var tmVal = document.getElementById('tmName').value.trim();
        var ownerVal = document.getElementById('ownerName').value.trim() || tmVal;
        var statusVal = document.getElementById('status').value;

        submitBtn.disabled = true;
        messageDiv.style.color = 'blue';
        messageDiv.innerText = 'Uploading...';
        viewCertLink.style.display = 'none';

        readFile(selectedFile)
            .then(function(fileData) {
                return fetch(API_BASE_URL + '/api/add-certificate', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-admin-password': currentPassword
                    },
                    body: JSON.stringify({
                        certificate_no: certVal,
                        trademark_name: tmVal,
                        owner_name: ownerVal,
                        status: statusVal,
                        document_file: fileData.base64,
                        document_mime_type: fileData.mimeType
                    })
                });
            })
            .then(function(response) {
                return response.json().then(function(result) {
                    return { status: response.status, ok: response.ok, result: result };
                });
            })
            .then(function(resData) {
                if (resData.ok) {
                    messageDiv.style.color = 'green';
                    messageDiv.innerText = 'Saved to portal database!';
                    var certUrl = API_BASE_URL + '/certificate/' + encodeURIComponent(certVal);
                    viewCertLink.innerHTML = '<a href="/certificate/' + encodeURIComponent(certVal) + '" target="_blank" class="view-btn">Open Record: ' + certUrl + '</a>';
                    viewCertLink.style.display = 'block';
                    addCertificateForm.reset();
                } else if (resData.status === 401) {
                    showLoginPanel('Invalid password!', 'red');
                } else {
                    messageDiv.style.color = 'red';
                    messageDiv.innerText = 'Error: ' + ((resData.result && resData.result.error) || 'Failed to save');
                }
            })
            .catch(function(err) {
                messageDiv.style.color = 'red';
                messageDiv.innerText = err.message || 'Upload failed';
            })
            .finally(function() {
                submitBtn.disabled = false;
            });
    });
</script>
</body>
</html>`;

function buildPortalPage(initialSerial, recordData) {
  const safeInitial = escapeHtml(initialSerial || '');
  let resultCardHtml = '';

  if (recordData) {
    const cNo = escapeHtml(recordData.certificate_no);
    const tName = escapeHtml(recordData.trademark_name);
    const oName = escapeHtml(recordData.owner_name || recordData.trademark_name);
    const stText = escapeHtml(recordData.status || 'Registered & Active');

    let docSection = '';
    if (recordData.document_file) {
      if (recordData.document_mime_type === 'application/pdf') {
        docSection = `
          <div id="docViewer" class="doc-viewer">
            <embed src="${recordData.document_file}" type="application/pdf" width="100%" height="520px" />
          </div>
        `;
      } else {
        docSection = `
          <div id="docViewer" class="doc-viewer">
            <img src="${recordData.document_file}" alt="${tName}" class="doc-viewer-img" />
          </div>
        `;
      }
    }

    resultCardHtml = `
      <div class="result-card" id="resultCard">
        <div class="result-banner">
          <div>
            <div class="result-banner-title">${stText}</div>
            <div class="result-banner-sub">Brand & Trademark Registry Record</div>
          </div>
          <button type="button" class="close-btn" onclick="document.getElementById('resultCard').style.display='none'">&times;</button>
        </div>

        <div class="detail-rows">
          <div class="detail-row">
            <span class="detail-label">Serial Number</span>
            <span class="detail-value">${cNo}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Trademark Name</span>
            <span class="detail-value">${tName}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Registered Owner</span>
            <span class="detail-value">${oName}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Current Status</span>
            <span class="status-pill">${stText}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Registered By</span>
            <span class="detail-value">Brand Registry Portal</span>
          </div>
        </div>

        <div class="doc-section">
          <div class="doc-heading">STORED CERTIFICATE DOCUMENT</div>
          ${recordData.document_file ? '<button type="button" class="view-cert-btn" onclick="toggleDoc()">View Stored Certificate</button>' : '<div class="no-doc-note">No document file attached to this record.</div>'}
          ${docSection}
        </div>

        <div class="record-footer-note">
          This record is maintained in the custom trademark registry database for brand protection and verification.
        </div>

        <button type="button" class="search-another-btn" onclick="focusSearch()">Search Another Trademark</button>
      </div>
    `;
  } else if (initialSerial) {
    resultCardHtml = `
      <div class="not-found-box">
        No trademark record found for <strong>${safeInitial}</strong>.
      </div>
    `;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Trademark Verification Portal</title>
    <style>
        body { margin: 0; font-family: Arial, sans-serif; background: #f3f6f4; color: #1e293b; }
        .top-strip { background: #0f172a; color: #e2e8f0; text-align: center; padding: 7px 12px; font-size: 12.5px; }
        .navbar { background: #ffffff; border-bottom: 1px solid #e2e8f0; padding: 14px 18px; display: flex; justify-content: space-between; align-items: center; }
        .brand-wrap { display: flex; align-items: center; gap: 10px; }
        .brand-badge { width: 34px; height: 34px; border-radius: 50%; background: #15803d; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 15px; }
        .brand-title { font-weight: bold; font-size: 17px; color: #0f172a; }
        .brand-sub { font-size: 12px; color: #64748b; }
        .admin-link { text-decoration: none; font-size: 13px; color: #15803d; font-weight: bold; }

        .hero-banner { background: #15803d; color: #ffffff; padding: 34px 18px; text-align: center; }
        .hero-logo-circle { width: 52px; height: 52px; border-radius: 50%; background: #ffffff; color: #15803d; font-weight: bold; font-size: 20px; display: flex; align-items: center; justify-content: center; margin: 0 auto 12px auto; }
        .hero-title { margin: 0; font-size: 22px; }
        .hero-sub { margin: 6px 0 0 0; font-size: 14px; opacity: 0.92; }

        .main-wrap { max-width: 540px; margin: -18px auto 32px auto; padding: 0 14px; box-sizing: border-box; }
        .search-card { background: #ffffff; border-radius: 12px; padding: 22px; box-shadow: 0 8px 24px rgba(15,23,42,0.08); text-align: center; }
        .search-label { font-size: 12px; font-weight: bold; letter-spacing: 1px; color: #475569; margin-bottom: 12px; }
        .search-input { width: 100%; padding: 12px 14px; border: 1.5px solid #cbd5e1; border-radius: 8px; font-size: 15px; box-sizing: border-box; margin-bottom: 12px; }
        .search-btn { width: 100%; padding: 12px; background: #16a34a; color: #fff; border: none; border-radius: 8px; font-size: 16px; font-weight: bold; cursor: pointer; }
        .search-btn:hover { background: #15803d; }
        .badges-row { display: flex; justify-content: center; flex-wrap: wrap; gap: 14px; margin-top: 16px; font-size: 12.5px; color: #475569; }

        .result-card { background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 8px 24px rgba(15,23,42,0.08); margin-top: 20px; text-align: left; }
        .result-banner { background: #15803d; color: #ffffff; padding: 16px 18px; display: flex; justify-content: space-between; align-items: center; }
        .result-banner-title { font-size: 18px; font-weight: bold; }
        .result-banner-sub { font-size: 12.5px; opacity: 0.9; margin-top: 2px; }
        .close-btn { background: transparent; border: none; color: #fff; font-size: 22px; cursor: pointer; line-height: 1; }

        .detail-rows { padding: 8px 18px; }
        .detail-row { display: flex; justify-content: space-between; align-items: center; padding: 13px 0; border-bottom: 1px solid #f1f5f9; gap: 12px; }
        .detail-label { color: #64748b; font-size: 14px; }
        .detail-value { font-weight: bold; color: #0f172a; font-size: 14.5px; text-align: right; }
        .status-pill { background: #dcfce7; color: #166534; padding: 5px 12px; border-radius: 999px; font-size: 12.5px; font-weight: bold; }

        .doc-section { padding: 14px 18px; background: #f8fafc; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; text-align: center; }
        .doc-heading { font-size: 11.5px; font-weight: bold; letter-spacing: 0.8px; color: #64748b; margin-bottom: 10px; }
        .view-cert-btn { width: 100%; padding: 12px; background: #15803d; color: #fff; border: none; border-radius: 8px; font-size: 15px; font-weight: bold; cursor: pointer; }
        .view-cert-btn:hover { background: #166534; }
        .doc-viewer { display: none; margin-top: 14px; background: #fff; padding: 8px; border: 1px solid #cbd5e1; border-radius: 8px; }
        .doc-viewer-img { max-width: 100%; height: auto; display: block; margin: 0 auto; border-radius: 4px; }
        .no-doc-note { font-size: 13px; color: #64748b; }

        .record-footer-note { padding: 14px 18px; font-size: 13px; color: #64748b; line-height: 1.5; }
        .search-another-btn { display: block; width: calc(100% - 36px); margin: 0 18px 18px 18px; padding: 11px; background: #f1f5f9; color: #1e293b; border: 1px solid #cbd5e1; border-radius: 8px; font-weight: bold; cursor: pointer; }
        .not-found-box { background: #fff; margin-top: 18px; padding: 16px; border-radius: 10px; text-align: center; color: #b91c1c; font-weight: bold; }

        .footer-dark { background: #0b1324; color: #cbd5e1; padding: 34px 20px; font-size: 14px; }
        .footer-inner { max-width: 900px; margin: 0 auto; }
        .footer-brand { font-size: 18px; font-weight: bold; color: #ffffff; margin-bottom: 8px; }
        .footer-desc { color: #94a3b8; line-height: 1.6; max-width: 460px; margin-bottom: 24px; }
        .footer-col-title { font-weight: bold; color: #ffffff; margin-bottom: 10px; margin-top: 18px; }
        .footer-links { list-style: none; padding: 0; margin: 0 0 18px 0; }
        .footer-links li { margin-bottom: 8px; color: #94a3b8; }
        .footer-links a { color: #94a3b8; text-decoration: none; }
        .footer-bottom { border-top: 1px solid #1e293b; margin-top: 24px; padding-top: 16px; font-size: 12.5px; color: #64748b; text-align: center; }
    </style>
</head>
<body>
<div class="top-strip">Brand & Trademark Verification Portal</div>

<div class="navbar">
    <div class="brand-wrap">
        <div class="brand-badge">TM</div>
        <div>
            <div class="brand-title">Trademark Registry Portal</div>
            <div class="brand-sub">Brand Status & Record Lookup</div>
        </div>
    </div>
    <a href="/admin" class="admin-link">Admin</a>
</div>

<div class="hero-banner">
    <div class="hero-logo-circle">TM</div>
    <h1 class="hero-title">TrademarkRegistryPortal</h1>
    <p class="hero-sub">Brand Status & Record Lookup</p>
</div>

<div class="main-wrap">
    <div class="search-card">
        <div class="search-label">ENTER TRADEMARK SERIAL NUMBER</div>
        <form id="searchForm" onsubmit="handleSearch(event)">
            <input type="text" id="serialInput" class="search-input" placeholder="e.g. 193490 or TM-101" value="${safeInitial}" required />
            <button type="submit" class="search-btn">Search</button>
        </form>
        <div class="badges-row">
            <span>Free public access</span>
            <span>Secure &amp; encrypted</span>
            <span>Database record</span>
        </div>
    </div>

    ${resultCardHtml}
</div>

<footer class="footer-dark">
    <div class="footer-inner">
        <div class="footer-brand">TrademarkRegistryPortal</div>
        <div class="footer-desc">
            Maintaining brand registration records and stored certificate verification for trademark protection.
        </div>

        <div class="footer-col-title">Services</div>
        <ul class="footer-links">
            <li><a href="/">Trademark Search</a></li>
            <li><a href="/">Status Verification</a></li>
            <li><a href="/admin">Record Management</a></li>
        </ul>

        <div class="footer-col-title">Legal</div>
        <ul class="footer-links">
            <li><a href="/">Privacy Policy</a></li>
            <li><a href="/">Terms of Service</a></li>
            <li><a href="/">Disclaimer</a></li>
        </ul>

        <div class="footer-bottom">
            &copy; 2026 TrademarkRegistryPortal. All rights reserved.
        </div>
    </div>
</footer>

<script>
    function handleSearch(e) {
        e.preventDefault();
        var val = document.getElementById('serialInput').value.trim();
        if (!val) return;
        window.location.href = '/certificate/' + encodeURIComponent(val);
    }

    function toggleDoc() {
        var viewer = document.getElementById('docViewer');
        if (!viewer) return;
        viewer.style.display = (viewer.style.display === 'block') ? 'none' : 'block';
    }

    function focusSearch() {
        var inp = document.getElementById('serialInput');
        if (inp) {
            inp.focus();
            inp.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
</script>
</body>
</html>`;
}

app.get('/', async (req, res) => {
  try {
    await connectDB();
    res.send(buildPortalPage('', null));
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

    res.send(buildPortalPage(req.params.certificate_no, cert));
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

  return res.status(401).json({ error: 'Invalid password!' });
});

app.post('/api/add-certificate', async (req, res) => {
  try {
    if (!isValidAdminPassword(req)) {
      return res.status(401).json({ error: 'Valid admin password is required' });
    }

    await connectDB();

    const {
      certificate_no,
      trademark_name,
      owner_name,
      status,
      document_file,
      document_mime_type
    } = req.body;

    if (!certificate_no || !trademark_name || !document_file) {
      return res.status(400).json({ error: 'Serial/trademark number, name, and file are required' });
    }

    const newCertificate = new Trademark({
      certificate_no,
      trademark_name,
      owner_name: owner_name || trademark_name,
      status: status || 'Registered & Active',
      document_file,
      document_mime_type
    });

    await newCertificate.save();
    res.status(201).json({ message: 'Saved successfully', data: newCertificate });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'This record number already exists' });
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
      return res.status(404).json({ error: 'Record not found' });
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
