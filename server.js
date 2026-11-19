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
    <title>Admin Panel - Trademark Upload</title>
    <style>
        body { font-family: Arial, sans-serif; background-color: #f0f3f6; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 20px; }
        .container { background: white; padding: 28px; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.08); width: 100%; max-width: 440px; box-sizing: border-box; }
        h2 { text-align: center; color: #1a365d; margin-top: 0; margin-bottom: 20px; }
        label { font-weight: bold; font-size: 14px; color: #2d3748; display: block; margin-top: 12px; }
        input, button { width: 100%; padding: 10px; margin: 6px 0; border: 1px solid #cbd5e0; border-radius: 5px; box-sizing: border-box; font-size: 14.5px; font-family: inherit; }
        .file-box { background: #f8fafc; border: 1.5px dashed #cbd5e0; padding: 12px; border-radius: 6px; margin-top: 8px; }
        button { background-color: #1a365d; color: white; border: none; cursor: pointer; font-size: 16px; font-weight: bold; margin-top: 16px; }
        button:hover { background-color: #2b6cb0; }
        button:disabled { background-color: #a0aec0; cursor: not-allowed; }
        .logout-btn { background-color: #e53e3e; margin-top: 8px; }
        .logout-btn:hover { background-color: #c53030; }
        .view-btn { display: inline-block; width: 100%; text-align: center; padding: 10px; background-color: #b7791f; color: white; text-decoration: none; border-radius: 5px; margin-top: 12px; font-weight: bold; box-sizing: border-box; }
        .view-btn:hover { background-color: #975a16; }
        #message, #loginMessage { text-align: center; margin-top: 14px; font-weight: bold; }
    </style>
</head>
<body>
<div class="container">
    <div id="loginSection">
        <h2>Admin Login</h2>
        <form id="loginForm">
            <label for="adminPassword">Admin Password</label>
            <input type="password" id="adminPassword" placeholder="Enter admin password" required>
            <button type="submit" id="loginBtn">Login</button>
        </form>
        <div id="loginMessage"></div>
    </div>

    <div id="adminSection" style="display: none;">
        <h2>Upload Trademark Certificate</h2>
        <form id="addCertificateForm">
            <label for="certNo">Trademark Number *</label>
            <input type="text" id="certNo" placeholder="e.g. 193376 or TM-101" required>

            <label for="tmName">Trademark Name *</label>
            <input type="text" id="tmName" placeholder="e.g. Bongodb" required>

            <div class="file-box">
                <label for="certFile" style="margin-top:0;">Choose File (Certificate Image / PDF) *</label>
                <input type="file" id="certFile" accept="image/*,application/pdf" required>
            </div>

            <button type="submit" id="submitBtn">Upload & Save</button>
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
                    messageDiv.innerText = 'Uploaded successfully!';
                    var certUrl = API_BASE_URL + '/certificate/' + encodeURIComponent(certVal);
                    viewCertLink.innerHTML = '<a href="/certificate/' + encodeURIComponent(certVal) + '" target="_blank" class="view-btn">Open Protected Link: ' + certUrl + '</a>';
                    viewCertLink.style.display = 'block';
                    addCertificateForm.reset();
                } else if (resData.status === 401) {
                    showLoginPanel('Invalid password!', 'red');
                } else {
                    messageDiv.style.color = 'red';
                    messageDiv.innerText = 'Error: ' + ((resData.result && resData.result.error) || 'Failed to upload');
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
        <div style="text-align: center; margin-top: 60px; font-family: Arial, sans-serif;">
          <h2>Trademark Record Not Found</h2>
          <p>No record found for this trademark number.</p>
        </div>
      `);
    }

    const safeCertNo = escapeHtml(cert.certificate_no);
    const safeTmName = escapeHtml(cert.trademark_name);

    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.get('host');
    const fullVerifyUrl = protocol + '://' + host + '/certificate/' + encodeURIComponent(cert.certificate_no);
    const qrImageUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=130x130&margin=4&data=' + encodeURIComponent(fullVerifyUrl);

    let filePreviewHtml = '';
    if (cert.document_file) {
      if (cert.document_mime_type === 'application/pdf') {
        filePreviewHtml = `
          <div class="doc-box">
            <embed src="${cert.document_file}" type="application/pdf" width="100%" height="560px" />
          </div>
        `;
      } else {
        filePreviewHtml = `
          <div class="doc-box">
            <img src="${cert.document_file}" alt="${safeTmName}" class="doc-img" />
          </div>
        `;
      }
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${safeTmName} - Trademark Record (${safeCertNo})</title>
    <style>
        body { background: #1e293b; margin: 0; padding: 24px 12px; font-family: Arial, sans-serif; display: flex; justify-content: center; }
        .card { background: #fbf9f3; max-width: 820px; width: 100%; border: 4px solid #0f2b46; border-radius: 8px; padding: 24px; box-sizing: border-box; box-shadow: 0 12px 30px rgba(0,0,0,0.45); }
        .top-bar { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #c59b27; padding-bottom: 12px; margin-bottom: 18px; flex-wrap: wrap; gap: 10px; }
        .tm-title { margin: 0; color: #0f2b46; font-size: 22px; }
        .tm-no { color: #b7791f; font-weight: bold; font-size: 15px; }
        .doc-box { background: #fff; border: 1px solid #cbd5e0; border-radius: 6px; padding: 10px; text-align: center; }
        .doc-img { max-width: 100%; height: auto; display: block; margin: 0 auto; border-radius: 4px; }
        .footer-bar { margin-top: 18px; display: flex; justify-content: space-between; align-items: center; gap: 16px; background: #fffaf0; border-left: 4px solid #dd6b20; padding: 12px 14px; border-radius: 4px; font-size: 13px; color: #7b341e; }
        .qr-img { width: 78px; height: 78px; background: #fff; padding: 4px; border: 1px solid #975a16; border-radius: 4px; display: block; }
        .print-btn { background: #0f2b46; color: #ffd700; border: 1px solid #ffd700; padding: 8px 14px; border-radius: 5px; cursor: pointer; font-weight: bold; }
        @media print {
            body { background: #fff; padding: 0; }
            .card { box-shadow: none; border: 2px solid #0f2b46; max-width: 100%; }
            .print-btn { display: none; }
        }
    </style>
</head>
<body>
<div class="card">
    <div class="top-bar">
        <div>
            <h1 class="tm-title">${safeTmName}</h1>
            <div class="tm-no">Trademark No.: ${safeCertNo}</div>
        </div>
        <button class="print-btn" onclick="window.print()">Print / Save PDF</button>
    </div>

    ${filePreviewHtml}

    <div class="footer-bar">
        <div>
            <strong>Brand & Trademark Verification Record:</strong> This trademark record is stored for brand protection and authenticity verification. Unauthorized copying, imitation, or misuse of <strong>${safeTmName}</strong> is strictly prohibited.
        </div>
        <img src="${escapeHtml(qrImageUrl)}" alt="QR Code" class="qr-img" onerror="this.style.display='none';" />
    </div>
</div>
</body>
</html>`;

    res.send(html);
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
      document_file,
      document_mime_type
    } = req.body;

    if (!certificate_no || !trademark_name || !document_file) {
      return res.status(400).json({ error: 'Trademark number, trademark name, and file are required' });
    }

    const newCertificate = new Trademark({
      certificate_no,
      trademark_name,
      document_file,
      document_mime_type
    });

    await newCertificate.save();
    res.status(201).json({ message: 'Saved successfully', data: newCertificate });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'This trademark number already exists' });
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
      return res.status(404).json({ error: 'Certificate not found' });
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
