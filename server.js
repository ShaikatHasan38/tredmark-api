require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();

// মিডলওয়্যার (Middleware)
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
  res.sendFile(path.join(__dirname, 'index.html'));
});

// নতুন সার্টিফিকেট অ্যাড করার API
app.post('/api/add-certificate', async (req, res) => {
  try {
    await connectDB();
    const newCertificate = new Trademark(req.body);
    await newCertificate.save();
    res.status(201).json({ message: 'Certificate saved successfully', data: newCertificate });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'এই সার্টিফিকেট নম্বরটি আগে থেকেই রয়েছে' });
    }
    res.status(500).json({ error: error.message });
  }
});

// সার্ভার পোর্ট চালু করা
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

module.exports = app;
