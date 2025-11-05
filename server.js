// server.js
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const { pool } = require('./db');

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(cors({ origin: '*' })); // Allow all origins for testing
app.use(express.json({ limit: '50mb' }));

// Serve the documents folder publicly
app.use('/docs', express.static(path.join(__dirname, 'docs')));


// (kept) CSV save endpoint – unchanged for backward compatibility
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const csvFilePath = 'submissions.csv';

app.post('/save', async (req, res) => {
  const data = req.body;
  console.log('Received data:', data);
  try {
    const headers = Object.keys(data).map(key => ({ id: key, title: key }));
    const records = [data];
    const fileExists = fs.existsSync(csvFilePath);
    const csvWriter = createCsvWriter({
      path: csvFilePath,
      header: headers,
      append: fileExists
    });
    await csvWriter.writeRecords(records);
    console.log('...Data was written to CSV successfully');
    res.status(200).json({ message: 'Submission saved successfully!' });
  } catch (error) {
    console.error('Error writing to CSV:', error);
    res.status(500).json({ message: 'Failed to save submission.' });
  }
});

// MODIFIED: document upload → save to LOCAL DISK → upsert lead_documents with public URL
app.post('/documents/upload', async (req, res) => {
  console.log('\n[+] Received document upload request...');
  try {
    const { id, doc_type, file_b64, file_ext, mime } = req.body || {};

    if (!id || !doc_type || !file_b64 || !file_ext) {
      return res.status(400).json({ ok: false, error: 'Missing required fields (id, doc_type, file_b64, file_ext)' });
    }

    const safeId = String(id).trim();
    const safeType = String(doc_type).trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    const safeExt = String(file_ext).trim().toLowerCase().replace(/[^a-z0-9]/g, '');

    // decode base64 (no data URL prefix expected)
    const buffer = Buffer.from(file_b64, 'base64');

    // compute checksum
    const checksum = crypto.createHash('sha256').update(buffer).digest('hex');

    // ensure folder exists
    const baseDir = 'docs';
    const dir = path.join(__dirname, baseDir, safeId);
    fs.mkdirSync(dir, { recursive: true });

    // write file
    const fileName = `${safeType}.${safeExt || 'bin'}`;
    const fullPath = path.join(dir, fileName);
    fs.writeFileSync(fullPath, buffer);

    // Create the public URL for the file
    const publicUrl = `${process.env.PUBLIC_URL}/docs/${safeId}/${fileName}`;
    const finalMime = mime || 'application/octet-stream';

    // upsert database record with the public URL
    const conn = await pool.getConnection();
    try {
      // 1. Ensure the parent lead record exists to satisfy the foreign key constraint.
      await conn.execute(
        'INSERT IGNORE INTO leads (id, insurer, status) VALUES (?, ?, ?)',
        [safeId, 'UNKNOWN', 'GATHERING_DATA']
      );

      // 2. Now, upsert the document record with the PUBLIC URL
      const [upd] = await conn.execute(
        'UPDATE lead_documents SET path=?, mime=?, checksum=? WHERE id=? AND doc_type=?',
        [publicUrl, finalMime, checksum, safeId, safeType]
      );

      if (upd.affectedRows === 0) {
        await conn.execute(
          'INSERT INTO lead_documents (id, doc_type, path, mime, checksum) VALUES (?,?,?,?,?)',
          [safeId, safeType, publicUrl, finalMime, checksum]
        );
      }

      // Check the number of documents for this lead
      const [rows] = await conn.execute('SELECT COUNT(*) as doc_count FROM lead_documents WHERE id = ?', [safeId]);
      const docCount = rows[0].doc_count;

      if (docCount === 6) {
        await conn.execute('UPDATE leads SET status = ? WHERE id = ?', ['READY', safeId]);
      }
    } finally {
      conn.release();
    }

    return res.status(200).json({ ok: true, path: publicUrl, checksum });
  } catch (err) {
    console.error('Upload error:', err);
    return res.status(500).json({ ok: false, error: String(err && err.message || err) });
  }
});


app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});

// REMOVED /leads/update and /quotes/status endpoints for simplicity