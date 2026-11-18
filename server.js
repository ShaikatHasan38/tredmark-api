require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

// মিডলওয়্যার (Middleware)
app.use(express.json());
app.use(cors());

// ডাটাবেইজ কানেকশন (MongoDB)
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB Connected Successfully!'))
  .catch((err) => console.log('Database connection failed:', err));

// ট্রেডমার্ক স্কিমা (Schema)
const trademarkSchema = new mongoose.Schema({
  certificate_no: { type: String, required: true, unique: true },
  owner_name: { type: String, required: true },
  trademark_name: { type: String, required: true },
  status: { type: String, default: 'Active' },
  issue_date: { type: Date, default: Date.now }
});

const Trademark = mongoose.model('Trademark', trademarkSchema);

// হোম রাউট (টেস্ট করার জন্য)
app.get('/', (req, res) => {
  res.send('Trademark API is running smoothly!');
});

// নতুন সার্টিফিকেট অ্যাড করার API
app.post('/api/add-certificate', async (req, res) => {
  try {
    const newCertificate = new Trademark(req.body);
    await newCertificate.save();
    res.status(201).json({ message: 'Certificate saved successfully', data: newCertificate });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// সার্ভার পোর্ট চালু করা
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});