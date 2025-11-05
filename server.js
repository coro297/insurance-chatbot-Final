// server.js
const express = require('express');
const cors = require('cors');
const fs = require('fs'); // Keep for local CSV, but remove for R2 uploads
const path = require('path');
const crypto = require('crypto');
const CONFIG = require('./config');
require('dotenv').config();

const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { pool } = require('./db');

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Configure S3 Client for Cloudflare R2
const R2 = new S3Client({
  region: 'auto', // Required for Cloudflare R2
  endpoint: process.env.R2_ENDPOINT, // e.g., https://<ACCOUNT_ID>.r2.cloudflarestorage.com
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;

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

// NEW: document upload → save to R2 → upsert lead_documents
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

    // R2 object key (path within the bucket)
    const objectKey = `${safeId}/${safeType}.${safeExt || 'bin'}`;
    const finalMime = mime || 'application/octet-stream';

    // Upload to R2
    const uploadParams = {
      Bucket: R2_BUCKET_NAME,
      Key: objectKey,
      Body: buffer,
      ContentType: finalMime,
    };
    await R2.send(new PutObjectCommand(uploadParams));

    // Construct the public URL for the R2 object (Cloudflare R2 public access requires a custom domain or a specific endpoint format)
    // For simplicity, we'll store the objectKey and assume the frontend knows how to construct the public URL
    // or that the Python bot will download it. If public access is needed, R2_PUBLIC_URL_BASE should be set.
    const r2ObjectUrl = process.env.R2_PUBLIC_URL_BASE ? `${process.env.R2_PUBLIC_URL_BASE}/${objectKey}` : objectKey;


    // upsert without schema change
    const conn = await pool.getConnection();
    try {
      // 1. Ensure the parent lead record exists to satisfy the foreign key constraint.
      await conn.execute(
        'INSERT IGNORE INTO leads (id, insurer, status) VALUES (?, ?, ?)',
        [safeId, 'UNKNOWN', 'GATHERING_DATA']
      );

      // 2. Now, upsert the document record.
      const [upd] = await conn.execute(
        'UPDATE lead_documents SET path=?, mime=?, checksum=? WHERE id=? AND doc_type=?',
        [r2ObjectUrl, finalMime, checksum, safeId, safeType]
      );

      if (upd.affectedRows === 0) {
        await conn.execute(
          'INSERT INTO lead_documents (id, doc_type, path, mime, checksum) VALUES (?,?,?,?,?)',
          [safeId, safeType, r2ObjectUrl, finalMime, checksum]
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

    return res.status(200).json({ ok: true, path: r2ObjectUrl, checksum });
  } catch (err) {
    console.error('Upload error:', err);
    return res.status(500).json({ ok: false, error: String(err && err.message || err) });
  }
});

// This endpoint will now check R2 for the quote PDF
app.get('/quotes/status/:id', async (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ status: 'error', message: 'Missing ID' });
  }

  try {
    // The Python bot will upload the quote PDF directly to R2 with a predictable name
    // e.g., <lead_id>_quote.pdf
    const expectedQuoteKey = `${id}_quote.pdf`; // Assuming a generic name for the final quote PDF

    // Check if the object exists in R2
    try {
      await R2.send(new GetObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: expectedQuoteKey,
      }));
      // If no error, the object exists
      const publicQuoteUrl = process.env.R2_PUBLIC_URL_BASE ? `${process.env.R2_PUBLIC_URL_BASE}/${expectedQuoteKey}` : expectedQuoteKey;
      return res.json({ status: 'ready', path: publicQuoteUrl });
    } catch (error) {
      if (error.name === 'NoSuchKey') {
        return res.json({ status: 'pending' }); // File not found, still pending
      }
      throw error; // Other S3 errors
    }
  } catch (error) {
    console.error('Error checking for quote in R2:', error);
    res.status(500).json({ status: 'error', message: 'Error checking for quote' });
  }
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});

// NEW: endpoint to receive OCR data from the frontend (forwarded from n8n)
app.post('/leads/update', async (req, res) => {
  console.log('\n[+] Received lead update request with OCR data...');
  const ocrData = req.body;
  console.log('Received OCR Data:', ocrData);

  const leadId = ocrData.id;
  if (!leadId) {
    return res.status(400).json({ ok: false, error: 'Missing "id" in the n8n response.' });
  }

  // To make this robust, only allow keys that are actual columns in the leads table
  const allowedColumns = [
    'insurer', 'status', 'note', 'full_name', 'email', 'mobile', 'dob', 'gender', 'nationality', 'nationality_code',
    'address', 'city', 'po_box', 'emirates_id', 'emirates_id_expiry', 'license_number', 'license_issue_date',
    'license_expiry_date', 'license_issue_place', 'tcf_number', 'policy_type', 'insurance_type', 'claim_free_years',
    'ncb', 'current_insurer', 'policy_start_date', 'dni_scheme', 'source', 'marital_status', 'remark',
    'vehicle_make', 'vehicle_model', 'vehicle_year', 'chassis_no', 'engine_number', 'vehicle_color', 'vehicle_mileage',
    'vehicle_usage', 'passenger_count', 'weight_empty', 'weight_full', 'registration_place', 'registration_issue_place',
    'transaction_type', 'registered_type', 'plate_source', 'plate_code', 'plate_number', 'first_reg_date',
    'previous_policy_type', 'previous_policy_expiry', 'previous_policy_number', 'region', 'emirates_city', 'po_box_location', 'driver_occupation'
  ];

  // Filter ocrData to only include allowed columns and the id
  const filteredOcrData = { id: leadId };
  for (const [key, value] of Object.entries(ocrData)) {
    if (allowedColumns.includes(key)) {
      filteredOcrData[key] = value;
    }
  }

  // This object will hold all data for the INSERT part of the UPSERT
  const dataForInsert = { id: leadId };

  // Populate dataForInsert with values from filteredOcrData or defaults for mandatory fields
  for (const col of allowedColumns) {
    if (filteredOcrData.hasOwnProperty(col)) {
      dataForInsert[col] = filteredOcrData[col];
    } else {
      // Provide defaults for NOT NULL fields if they are missing from OCR data
      if (col === 'insurer') dataForInsert[col] = 'ADAMJEE';
      // Add other NOT NULL fields here if they don't have a default in DB
      // For now, other allowedColumns are assumed to be NULL-able or have DB defaults
    }
  }

  // Dynamically build the INSERT part of the UPSERT query
  const insertColumns = Object.keys(dataForInsert).join(', ');
  const insertPlaceholders = Object.keys(dataForInsert).map(() => '?').join(', ');
  const insertValues = Object.values(dataForInsert).map(value => typeof value === 'string' ? value.trim() : value);

  // Dynamically build the ON DUPLICATE KEY UPDATE part of the UPSERT query
  // Only update fields that were actually present in the filteredOcrData (excluding id)
  const onDuplicateUpdateFields = [];
  for (const [key, value] of Object.entries(filteredOcrData)) {
    if (key !== 'id') {
      onDuplicateUpdateFields.push(`${key} = VALUES(${key})`);
    }
  }

  if (onDuplicateUpdateFields.length === 0) {
    // If no fields from OCR data are meant to be updated, just perform a simple INSERT
    // or handle as a no-op if the record already exists.
    // For UPSERT, we still need to provide the ON DUPLICATE KEY UPDATE clause, even if empty.
    // A common pattern is to update a dummy column or just the primary key if no other fields.
    // For now, we'll make it update 'id' to 'id' if no other fields are present.
    onDuplicateUpdateFields.push(`id = VALUES(id)`);
  }
  const onDuplicateUpdateClause = onDuplicateUpdateFields.join(', ');

  const upsertSql = `INSERT INTO leads (${insertColumns}) VALUES (${insertPlaceholders}) ON DUPLICATE KEY UPDATE ${onDuplicateUpdateClause}`;

  let conn;
  try {
    conn = await pool.getConnection();
    if (CONFIG.debugMode) {
        console.log('DEBUG: insertColumns:', insertColumns);
        console.log('DEBUG: insertValues:', insertValues);
        console.log('Executing UPSERT SQL:', upsertSql);
        console.log('With Values:', insertValues);
    }

    const [result] = await conn.execute(upsertSql, insertValues);

    res.status(200).json({ ok: true, message: `Lead ${leadId} UPSERTED.` });
  } catch (err) {
    console.error('Database UPSERT error:', err);
    res.status(500).json({ ok: false, error: 'Failed to UPSERT lead in database.' });
  } finally {
    if (conn) conn.release();
  }
});