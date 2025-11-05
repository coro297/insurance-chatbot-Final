# Project Guide v3 (Corrected & Complete)

This document provides a complete and up-to-date overview of the AI Insurance Chatbot project. It includes the project's file structure, the **full and unabridged** content of its source files, the database schema it interacts with, and a detailed explanation of its final end-to-end workflow.

---

## 1. Project Architecture Overview

The system is a sophisticated pipeline designed to automate the insurance quotation process:

1.  **Frontend (This Project):** A React-based chatbot that serves as the user-facing interface. It collects user information and documents in a multi-stage process.
2.  **n8n Workflow (External):** An external data automation service that receives data from the chatbot. Its primary roles are to perform OCR on documents and to populate the main `leads` table in the database once all data is processed.
3.  **Node.js Backend (This Project):** A local server whose primary role is to receive documents from the chatbot, save them to the local filesystem, and update the `lead_documents` table in the database with the file paths.
4.  **MySQL Database (External):** The central source of truth for the entire system, containing all lead data, document paths, and run logs.
5.  **Python Automation Bots (External):** A separate project consisting of a master router (`bot.py`) and individual Playwright-based agents (`insurer.py`) that read from the database and perform the final automation on insurer websites.

---

## 2. Project File Structure

Here is the complete folder and file structure. The `node_modules` directory has been omitted for clarity.

```
C:\Users\automated8\Documents\insurance-chatbot/
├───.env
├───assets/
│   ├───css/
│   │   └───style.css
│   ├───images/
│   │   └───logo.png
│   └───js/
│       └───app.js
├───db.js
├───docs/
│   └───TRACK-...
├───node_modules/
│   └─── ... (omitted)
├───config.js
├───index.html
├───package-lock.json
├───package.json
├───questions.json
├───README.md
├───server.js
└───submissions.csv
```

---

## 3. Database Schema

This is the schema for the `insurance_automation` database that the backend server and other components interact with.

```sql
CREATE DATABASE IF NOT EXISTS insurance_automation
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE insurance_automation;

CREATE TABLE IF NOT EXISTS leads (
  id               VARCHAR(64) PRIMARY KEY,
  insurer          VARCHAR(32)  NOT NULL,
  status           VARCHAR(32)  NOT NULL DEFAULT 'PENDING',
  note             TEXT,

  full_name        VARCHAR(200), email VARCHAR(200), mobile VARCHAR(32),
  dob              VARCHAR(32), gender VARCHAR(32), nationality VARCHAR(64), nationality_code VARCHAR(8),
  address          VARCHAR(255), city VARCHAR(64), po_box VARCHAR(32),

  emirates_id      VARCHAR(64), emirates_id_expiry VARCHAR(32),

  license_number   VARCHAR(64), license_issue_date VARCHAR(32),
  license_expiry_date VARCHAR(32), license_issue_place VARCHAR(64),
  tcf_number       VARCHAR(64),

  policy_type      VARCHAR(64), insurance_type VARCHAR(64), claim_free_years VARCHAR(32), ncb VARCHAR(32),
  current_insurance_type VARCHAR(64), policy_start_date VARCHAR(32), dni_scheme VARCHAR(128),
  source           VARCHAR(128), marital_status VARCHAR(32), remark TEXT,

  vehicle_make     VARCHAR(64), vehicle_model VARCHAR(64), vehicle_year VARCHAR(8),
  chassis_no       VARCHAR(64), engine_number VARCHAR(64), vehicle_colour VARCHAR(32), vehicle_mileage VARCHAR(32),
  vehicle_usage    VARCHAR(64), passenger_count VARCHAR(8), weight_empty VARCHAR(16), weight_full VARCHAR(16),

  registration_place VARCHAR(64), registration_issue_place VARCHAR(64), transaction_type VARCHAR(128),
  registered_type  VARCHAR(64), plate_source VARCHAR(64), plate_code VARCHAR(16), plate_number VARCHAR(32),
  first_reg_date   VARCHAR(32), previous_policy_type VARCHAR(64),
  previous_policy_expiry VARCHAR(32), previous_policy_number VARCHAR(64),
  region           VARCHAR(64), emirates_city VARCHAR(64), po_box_location VARCHAR(64), driver_occupation VARCHAR(64),

  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  KEY idx_status (status),
  KEY idx_insurer (insurer),
  KEY idx_created (created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS lead_documents (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  lead_id    VARCHAR(64) NOT NULL,
  doc_type   VARCHAR(64) NOT NULL,
  path       VARCHAR(255) NOT NULL,
  mime       VARCHAR(128),
  checksum   VARCHAR(128),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_docs_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  KEY idx_lead_doc (lead_id, doc_type)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS configs (
  insurer                VARCHAR(32) PRIMARY KEY,
  base_url               VARCHAR(255),
  username               VARCHAR(128),
  password               VARCHAR(256),
  headless               TINYINT DEFAULT 0,
  timeout_ms             INT DEFAULT 60000,
  slow_mo_ms             INT DEFAULT 0,
  viewport_w             INT DEFAULT 1920,
  viewport_h             INT DEFAULT 1080,
  accept_downloads       TINYINT DEFAULT 1,
  default_dni_scheme     VARCHAR(255),
  phone_fix_leading_zero TINYINT DEFAULT 1,
  phone_local_length     INT DEFAULT 10,
  extra_config           JSON NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS runs (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  lead_id       VARCHAR(64) NOT NULL,
  insurer       VARCHAR(32) NOT NULL,
  status        VARCHAR(32) NOT NULL DEFAULT 'PROCESSING',
  artifacts_dir VARCHAR(255),
  started_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at   DATETIME NULL,
  CONSTRAINT fk_runs_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  KEY idx_runs_lead (lead_id),
  KEY idx_runs_status (status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS events (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  run_id    INT NOT NULL,
  ts        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  component VARCHAR(32),
  event     VARCHAR(64),
  status    VARCHAR(32),
  details   TEXT,
  CONSTRAINT fk_events_run FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE,
  KEY idx_events_run (run_id),
  KEY idx_events_ts (ts)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS artifacts (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  run_id     INT NOT NULL,
  kind       VARCHAR(32),
  path       VARCHAR(255) NOT NULL,
  note       VARCHAR(255),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_artifacts_run FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE,
  KEY idx_artifacts_run (run_id)
) ENGINE=InnoDB;
```

---

## 4. File Contents

Here is the full source code for each important file in the project.

### `.env`

This file stores environment variables, including database credentials and server configuration. It must not be committed to version control.

```
MYSQL_HOST=192.168.0.110
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=11111
MYSQL_DATABASE=insurance_automation

DOCS_DIR=docs
PORT=3000
```

### `db.js`

This file sets up and exports a reusable MySQL connection pool for the Node.js server, using the credentials from the `.env` file.

```javascript
// db.js
require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4_general_ci',
});

module.exports = { pool };
```

### `server.js`

This is the backend server. Its primary role is to act as a file ingestion service. It receives document uploads from the chatbot, saves them to the local disk, and records their metadata and path in the `lead_documents` table in the MySQL database.

```javascript
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

app.use(cors());
app.use(express.json({ limit: '50mb' }));

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

// NEW: document upload → save to disk → upsert lead_documents
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
    const baseDir = process.env.DOCS_DIR || 'docs';
    const dir = path.join(process.cwd(), baseDir, safeId);
    fs.mkdirSync(dir, { recursive: true });

    // write file
    const fileName = `${safeType}.${safeExt || 'bin'}`;
    const fullPath = path.join(dir, fileName);
    fs.writeFileSync(fullPath, buffer);

    // relative path for DB
    const relPath = path.relative(process.cwd(), fullPath).replace(/\\/g, '/');
    const finalMime = mime || 'application/octet-stream';

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
        'UPDATE lead_documents SET path=?, mime=?, checksum=? WHERE lead_id=? AND doc_type=?',
        [relPath, finalMime, checksum, safeId, safeType]
      );

      if (upd.affectedRows === 0) {
        await conn.execute(
          'INSERT INTO lead_documents (lead_id, doc_type, path, mime, checksum) VALUES (?,?,?,?,?)',
          [safeId, safeType, relPath, finalMime, checksum]
        );
      }
    } finally {
      conn.release();
    }

    return res.status(200).json({ ok: true, path: relPath, checksum });
  } catch (err) {
    console.error('Upload error:', err);
    return res.status(500).json({ ok: false, error: String(err && err.message || err) });
  }
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
```

### `config.js`

This file holds configuration for the frontend. It now contains two URLs: one for the n8n webhook and one for our local document server.

```javascript
// ============================================ 
// CONFIGURATION FILE
// Edit this file to change settings
// ============================================ 

const CONFIG = {
  // n8n Webhook URL - for answers and OCR document data
  webhookUrl: 'https://smarttouchqa.ngrok.dev/webhook/tasty',
  // Local Node Server URL - for saving files and DB path logging
  documentServerUrl: 'http://localhost:3000',
  
  uploadFormat: 'base64',
  brandName: 'AI Insurance Assistant',
  companyName: 'Smart-Touch',
  welcomeMessage: "Welcome! I'm your AI insurance assistant. Let me help you get your insurance quote in minutes.",
  maxFileSize: 10 * 1024 * 1024, // 10MB
  allowedFileTypes: ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'],
  theme: {
    primaryColor: '#06b6d4',
    secondaryColor: '#a855f7',
    successColor: '#10b981',
    errorColor: '#ef4444',
    backgroundColor: '#0f172a'
  },
  typingSpeed: { min: 1000, max: 1500 },
  smoothScroll: true,
  debugMode: true
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
}
```

### `assets/js/app.js`

This is the core of the project. It contains the entire React application logic, including the dual-submission process to both n8n and the local Node.js server.

```javascript
// ============================================ 
// MAIN CHATBOT APPLICATION (Corrected Flow Control)
// =========================================== 

function InsuranceChatbot({ allQuestions }) {
  const { useState, useEffect, useRef } = React;

  // --- STATE MANAGEMENT ---
  const [messages, setMessages] = useState([]);
  const [answers, setAnswers] = useState({});
  const [userInput, setUserInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState(null);
  
  const [stage, setStage] = useState('collecting_answers');
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [trackId, setTrackId] = useState(null);
  const [uploadedFile, setUploadedFile] = useState(null);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // --- DEBUGGING ---
  const updateStage = (newStage, caller) => {
      if (CONFIG.debugMode) {
          console.log(`*** STAGE CHANGE *** -> ${newStage} (called by ${caller})`);
      }
      setStage(newStage);
  }

  // --- QUESTION LISTS ---
  const textQuestions = allQuestions.filter(q => q.type !== 'file_upload');
  const docQuestions = allQuestions.filter(q => q.type === 'file_upload');

  // --- EFFECTS ---

  useEffect(() => {
    const newTrackId = `TRACK-${Date.now()}`;
    setTrackId(newTrackId);
  }, []);

  useEffect(() => {
    addBotMessage(CONFIG.welcomeMessage);
    setTimeout(() => {
      addBotMessage("Let's get started with a few questions.");
      setTimeout(() => askNextQuestion(0), 1500);
    }, 2000);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    lucide.createIcons();
  });

  // --- CORE LOGIC ---

  const askNextQuestion = (index, stageOverride) => {
    const currentStage = stageOverride || stage;
    let question;
    if (currentStage === 'collecting_answers') {
      question = textQuestions[index];
    } else if (currentStage.startsWith('collecting_doc_')) {
      const docIndex = parseInt(currentStage.split('_')[2]) - 1;
      question = docQuestions[docIndex];
    }

    if (question) {
      setTimeout(() => addBotMessage(question.question, question), 500);
    }
  };

  const advanceStage = (actionCompleted) => {
    if (actionCompleted === 'answers_submitted') {
      const nextStage = 'collecting_doc_1';
      updateStage(nextStage, 'advanceStage after answers');
      setCurrentQuestionIndex(0);
      askNextQuestion(0, nextStage);
    } else if (actionCompleted === 'document_submitted') {
      const currentDocNum = parseInt(stage.split('_')[2]);
      if (currentDocNum >= docQuestions.length) {
        updateStage('completed', 'advanceStage after all docs');
        addBotMessage("✅ All documents have been submitted successfully!");
        setTimeout(() => {
            addBotMessage("Thank you! We have everything we need. Your reference ID for this entire submission is: #" + trackId);
        }, 1500);
      } else {
        const nextDocNum = currentDocNum + 1;
        const nextStage = `collecting_doc_${nextDocNum}`;
        updateStage(nextStage, 'advanceStage to next doc');
        setCurrentQuestionIndex(currentDocNum);
        askNextQuestion(currentDocNum, nextStage);
      }
    }
  };

  // --- SUBMISSION HANDLERS ---

  const handleSubmitAnswers = async () => {
    updateStage('submitting_answers', 'handleSubmitAnswers');
    setIsTyping(true);
    addBotMessage("🔄 Submitting your answers...");

    const payload = { track_id: trackId, ...answers };

    try {
      await submitPayload(payload);
      setIsTyping(false);
      addBotMessage("✅ Your answers have been submitted. Now, let's upload your documents one by one.");
      advanceStage('answers_submitted');
    } catch (err) {
      setIsTyping(false);
      addBotMessage(`❌ Submission failed: ${err.message}. Please try again.`);
      updateStage('answers_ready_to_submit', 'handleSubmitAnswers -> Error Fallback');
    }
  };

  const handleSubmitDocument = async () => {
    if (!uploadedFile) {
      setError('Please choose a file to upload.');
      return;
    }
    
    const docIndex = currentQuestionIndex;
    const currentDocQuestion = docQuestions[docIndex];
    const docTypeMap = {
        "Eid_front": "EMIRATESID_FRONT", "Eid_back": "EMIRATESID_BACK",
        "DL_front": "DRIVINGLICENSE_FRONT", "DL_back": "DRIVINGLICENSE_BACK",
        "mulkiya_front": "MULKIYA_FRONT", "mulkiya_back": "MULKIYA_BACK"
    };

    updateStage(`submitting_doc_${docIndex + 1}`, 'handleSubmitDocument');
    setIsTyping(true);
    addBotMessage(`🔄 Submitting ${currentDocQuestion.acceptedDocs[0]}...`);

    const fileType = uploadedFile.type.split('/')[1] || 'jpeg';
    const base64Data = await fileToBase64(uploadedFile);

    const payload = {
      track_id: trackId,
      session_Id: `AIBLCBD-${Date.now()}-${docIndex + 1}`,
      document_type: docTypeMap[currentDocQuestion.id],
      file: base64Data.split(',')[1],
      fileType: fileType
    };

    try {
      // 1) Send to n8n for OCR
      await submitPayload(payload);

      // 2) Also send to Node to save file and write DB path
      if (CONFIG.debugMode) {
        console.log('Submitting document to Node.js server...');
      }
      const nodeRes = await fetch(`${CONFIG.documentServerUrl}/documents/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: trackId,
          doc_type: payload.document_type,
          file_b64: payload.file,
          file_ext: payload.fileType,
          mime: uploadedFile?.type || 'application/octet-stream'
        })
      });

      if (!nodeRes.ok) {
        const txt = await nodeRes.text();
        throw new Error(`Node server error: ${nodeRes.status} ${txt}`);
      }

      const nodeJson = await nodeRes.json();
      if (!nodeJson?.ok) {
        throw new Error(`Node server responded with failure: ${JSON.stringify(nodeJson)}`);
      }

      setIsTyping(false);
      addBotMessage(`✅ ${currentDocQuestion.acceptedDocs[0]} submitted & saved.`);
      setUploadedFile(null);
      advanceStage('document_submitted');

    } catch (err) {
      setIsTyping(false);
      addBotMessage(`❌ ${currentDocQuestion.acceptedDocs[0]} submission failed: ${err.message}. Please try again.`);
      updateStage(`collecting_doc_${docIndex + 1}`, 'handleSubmitDocument -> Error Fallback');
    }
  };

  const submitPayload = async (payload) => {
    if (CONFIG.debugMode) {
      console.log('Submitting Payload to:', CONFIG.webhookUrl);
      console.log('Payload:', payload);
    }

    const response = await fetch(CONFIG.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Webhook returned status ${response.status}: ${errorText}`);
    }
    
    if (CONFIG.debugMode) {
        console.log('Submission successful');
    }
  };

  // --- UI HANDLERS ---

  const handleTextAnswer = (questionId, value) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
    setUserInput('');

    const nextQuestionIndex = currentQuestionIndex + 1;

    if (nextQuestionIndex < textQuestions.length) {
        setCurrentQuestionIndex(nextQuestionIndex);
        askNextQuestion(nextQuestionIndex);
    } else {
        addBotMessage("Great, I have all your details. Please review and click submit.");
        updateStage('answers_ready_to_submit', 'handleTextAnswer -> Last Question');
    }
  };

  const handleTextSubmit = () => {
    if (!userInput.trim()) return;
    const currentQuestion = textQuestions[currentQuestionIndex];
    if (currentQuestion.validation) {
        const { pattern, errorMessage } = currentQuestion.validation;
        if (pattern && !new RegExp(pattern).test(userInput)) {
            setError(errorMessage || 'Invalid format');
            return;
        }
    }
    setError(null);
    addUserMessage(userInput);
    handleTextAnswer(currentQuestion.id, userInput);
  };

  const handleOptionSelect = (option, questionId) => {
    addUserMessage(option);
    handleTextAnswer(questionId, option);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > CONFIG.maxFileSize) {
        setError(`File exceeds ${CONFIG.maxFileSize / 1024 / 1024}MB limit`);
        return;
    }
    if (!CONFIG.allowedFileTypes.includes(file.type)) {
        setError(`Unsupported file format`);
        return;
    }
    setError(null);
    setUploadedFile(file);
  };

  // --- UTILITY FUNCTIONS ---
  const addBotMessage = (text, questionData = null) => {
    setIsTyping(true);
    setTimeout(() => {
      setMessages(prev => [...prev, { sender: 'bot', text, questionData }]);
      setIsTyping(false);
    }, 500);
  };

  const addUserMessage = (text) => {
    setMessages(prev => [...prev, { sender: 'user', text }]);
  };

  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = error => reject(error);
    });
  };

  // --- RENDER LOGIC ---

  const currentQuestion = stage === 'collecting_answers' 
    ? textQuestions[currentQuestionIndex] 
    : stage.startsWith('collecting_doc') 
    ? docQuestions[currentQuestionIndex]
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-900 flex items-center justify-center p-4">
      <div className="relative w-full max-w-4xl h-[85vh] bg-slate-900/40 backdrop-blur-xl rounded-3xl border border-cyan-500/20 shadow-2xl shadow-cyan-500/10 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-cyan-500/10 to-purple-500/10 border-b border-cyan-500/20 p-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-cyan-400 to-purple-500 rounded-2xl flex items-center justify-center shadow-lg shadow-cyan-500/50">
              <i data-lucide="bot" className="w-8 h-8 text-white"></i>
            </div>
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">{CONFIG.brandName}</h1>
              <p className="text-cyan-300/60 text-sm">Powered by AI & OCR Technology</p>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'} animate-fadeIn`}>
              <div className={`max-w-[75%] ${msg.sender === 'user' ? 'bg-gradient-to-r from-cyan-500 to-purple-500 text-white' : 'bg-slate-800/60 text-cyan-50'} rounded-3xl px-6 py-4 shadow-lg`}>
                <p className="text-sm leading-relaxed">{msg.text}</p>
                {msg.questionData && msg.questionData.type === 'select' && stage === 'collecting_answers' && (
                  <div className="mt-4 space-y-2">
                    {msg.questionData.options.map((option, i) => (
                      <button key={i} onClick={() => handleOptionSelect(option, msg.questionData.id)} className="w-full text-left px-4 py-3 bg-slate-700/50 hover:bg-cyan-500/20 rounded-xl border border-cyan-500/30 transition-all">
                        {option}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {isTyping && <div className="flex justify-start"><div className="bg-slate-800/60 rounded-3xl px-6 py-4"><div className="flex gap-2"><div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce"></div><div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{animationDelay:'0.1s'}}></div><div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{animationDelay:'0.2s'}}></div></div></div></div>}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="border-t border-cyan-500/20 bg-slate-900/60 p-6">
          {error && <div className="mb-3 text-red-400 text-sm bg-red-500/10 p-2 rounded">{error}</div>}
          
          {stage === 'collecting_answers' && currentQuestion && currentQuestion.type !== 'select' && (
            <div className="flex gap-3">
              <input type={currentQuestion.type} value={userInput} onChange={(e) => setUserInput(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleTextSubmit()} placeholder="Type your answer..." className="flex-1 bg-slate-800/60 border border-cyan-500/30 rounded-2xl px-6 py-4 text-cyan-50"/>
              <button onClick={handleTextSubmit} className="px-6 py-4 bg-gradient-to-r from-cyan-500 to-purple-500 rounded-2xl text-white font-semibold">Send</button>
            </div>
          )}

          {stage === 'answers_ready_to_submit' && (
            <button onClick={handleSubmitAnswers} className="w-full px-6 py-4 bg-gradient-to-r from-green-500 to-cyan-500 rounded-2xl text-white font-semibold">
              Submit Answers
            </button>
          )}

          {stage.startsWith('collecting_doc_') && (
            <div className="space-y-3">
              <div className="flex gap-3">
                <input ref={fileInputRef} type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={handleFileUpload} className="hidden" />
                <button onClick={() => fileInputRef.current?.click()} className="flex-1 px-6 py-4 bg-slate-700/50 border border-cyan-500/30 rounded-2xl text-cyan-300">
                  Choose File...
                </button>
              </div>
              {uploadedFile && <div className="text-cyan-300/70 text-sm">Selected: {uploadedFile.name}</div>}
              <button onClick={handleSubmitDocument} disabled={!uploadedFile} className="w-full px-6 py-4 bg-gradient-to-r from-cyan-500 to-purple-500 rounded-2xl text-white font-semibold disabled:from-slate-700">
                Submit Document
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Load questions and render the app
fetch('questions.json')
    .then(res => res.json())
    .then(data => {
        const root = ReactDOM.createRoot(document.getElementById('root'));
        root.render(<InsuranceChatbot allQuestions={data.questions} />);
    })
    .catch(err => {
        console.error('Failed to load questions:', err);
    });
```

---

## 5. Complete System Workflow

This section explains the step-by-step data flow and working of the application in its final, sophisticated architecture.

1.  **System Startup & Prerequisites:**
    *   A MySQL database named `insurance_automation` must be running and accessible with the tables defined in the schema.
    *   You start two servers in two separate terminals:
        1.  `python -m http.server 8080`: Serves the frontend chatbot application.
        2.  `node server.js`: Runs the backend service for saving documents and connecting to the MySQL database.
    *   You open `http://localhost:8080` in your browser.

2.  **Chatbot Initialization:**
    *   The `index.html` page loads the React library and the main `app.js` script.
    *   The `InsuranceChatbot` component starts, immediately generating a unique `track_id` for the entire user session (e.g., `TRACK-1760115672209`).
    *   The chatbot displays its welcome message and begins asking the text-based questions from `questions.json`.

3.  **Answering Text Questions:**
    *   The chatbot proceeds sequentially through the questions.
    *   When the final text question (`Vehicle_mileage`) is answered, the application's internal stage changes to `answers_ready_to_submit`, and a **"Submit Answers"** button appears.

4.  **Submitting Answers (Payload 1 to n8n):**
    *   When the user clicks "Submit Answers", the `handleSubmitAnswers` function is called.
    *   It creates a JSON payload containing the `track_id` and all the collected text answers.
    *   It sends this payload via a `POST` request **only to the n8n webhook URL** (`webhookUrl` in `config.js`).
    *   n8n receives this data to begin its workflow (e.g., preparing to perform OCR and create the `leads` record).

5.  **Submitting Documents (Payloads 2-7 - The Dual Action):**
    *   After the answers are successfully submitted to n8n, the chatbot's stage changes to `collecting_doc_1`.
    *   The UI now prompts for the first document (e.g., "Please upload your Emirates ID Front").
    *   When the user selects a file and clicks **"Submit Document"**, the `handleSubmitDocument` function performs two critical, sequential actions:
        1.  **Action 1 (Send to n8n):** It creates a specific document payload (containing `track_id`, a new unique `session_id`, `document_type`, and the file's Base64 data) and sends it to the **n8n webhook URL** for OCR processing.
        2.  **Action 2 (Send to Local Server):** If the n8n submission is successful, it immediately sends a second, similar payload to the local **Node.js server** (`documentServerUrl` in `config.js`).
    *   This dual-action process repeats for all six documents.

6.  **Backend Processing (`server.js`):
    *   The `/documents/upload` endpoint on the Node.js server receives the request from the chatbot.
    *   It connects to the MySQL database using the connection pool from `db.js`.
    *   **It first runs an `INSERT IGNORE` command** into the `leads` table. This creates a minimal parent record with the `track_id` if one doesn't already exist, which prevents foreign key errors.
    *   It decodes the `file_b64` data from the payload back into a binary buffer.
    *   It saves this file to the local disk inside a folder named after the `track_id` (e.g., `docs/TRACK-1760115672209/EMIRATESID_FRONT.jpg`).
    *   It computes a SHA-256 checksum of the file for integrity.
    *   It then performs an "upsert" (an `UPDATE` followed by a conditional `INSERT`) into the `lead_documents` table, adding or updating the record for that `lead_id` and `doc_type` with the new file path, MIME type, and checksum.
    *   It then returns a success response to the chatbot.

7.  **Final Completion:**
    *   The chatbot only advances to the next document after both submissions (to n8n and the local server) succeed.
    *   After the sixth and final document is successfully processed, the chatbot's stage changes to `completed`, and it displays a final "Thank you" message to the user.