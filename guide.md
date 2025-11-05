# Project Guide: AI Insurance Chatbot

This document provides a complete overview of the AI Insurance Chatbot project, including its file structure, the full content of its source files, and a detailed explanation of its end-to-end workflow.

## 1. Project File Structure

Here is the complete folder and file structure of the project. The `node_modules` directory, which contains many sub-dependencies, has been omitted for clarity.

```
C:\Users\automated8\Documents\insurance-chatbot/
├───assets/
│   ├───css/
│   │   └───style.css
│   ├───images/
│   │   └───logo.png
│   └───js/
│       └───app.js
├───docs/
│   └───API_INTEGRATION.md
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

## 2. File Contents

Here is the full source code for each important file in the project.

### `index.html`

This is the main entry point of the application. It sets up the HTML page structure and loads all the necessary scripts (React, Babel, Tailwind CSS) and styles from CDNs, along with the main application script `app.js`.

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="ie=edge">
    <title>AI Insurance Assistant | Get Your Quote in Minutes</title>
    
    <!-- Favicon -->
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🤖</text></svg>">
    
    <!-- Tailwind CSS -->
    <script src="https://cdn.tailwindcss.com"></script>
    
    <!-- React -->
    <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
    
    <!-- Babel (to compile JSX) -->
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    
    <!-- Lucide Icons -->
    <script src="https://unpkg.com/lucide@latest"></script>
    
    <!-- Custom Styles -->
    <link rel="stylesheet" href="assets/css/style.css">
</head>
<body>
    <!-- React app will mount here -->
    <div id="root"></div>

    <!-- Configuration -->
    <script src="config.js"></script>
    
    <!-- Main App -->
    <script type="text/babel" src="assets/js/app.js"></script>
</body>
</html>
```

### `config.js`

This file holds all the main configuration variables for the chatbot. It is currently configured to send data to an n8n webhook.

```javascript
// ============================================ 
// CONFIGURATION FILE
// Edit this file to change settings
// ============================================ 

const CONFIG = {
  // n8n Webhook URL - CHANGE THIS TO YOUR WEBHOOK URL
  webhookUrl: 'https://smarttouchqa.ngrok.dev/webhook/tasty',
  
  // Upload format (base64, formdata, or multipart)
  uploadFormat: 'base64',
  
  // Branding
  brandName: 'AI Insurance Assistant',
  companyName: 'Smart-Touch',
  
  // Welcome message
  welcomeMessage: "Welcome! I'm your AI insurance assistant. Let me help you get your insurance quote in minutes.",
  
  // File upload settings
  maxFileSize: 10 * 1024 * 1024, // 10MB in bytes
  allowedFileTypes: ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'],
  
  // UI Settings
  theme: {
    primaryColor: '#06b6d4', // Cyan
    secondaryColor: '#a855f7', // Purple
    successColor: '#10b981', // Green
    errorColor: '#ef4444', // Red
    backgroundColor: '#0f172a' // Dark slate
  },
  
  // Typing animation speed (milliseconds)
  typingSpeed: {
    min: 1000,
    max: 1500
  },
  
  // Auto-scroll behavior
  smoothScroll: true,
  
  // Development mode (shows console logs)
  debugMode: true
};

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
}
```

### `assets/js/app.js`

This is the core of the project. It contains the entire React application, including all chatbot logic, state management, and the multi-stage submission process.

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
      // The stage is still the 'submitting_doc_X' stage here, so we can use it to find out which doc was just sent.
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
      advanceStage('answers_submitted'); // Explicitly pass the completed action
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
      await submitPayload(payload); // This would be modified to send to two endpoints
      setIsTyping(false);
      addBotMessage(`✅ ${currentDocQuestion.acceptedDocs[0]} submitted successfully.`);
      setUploadedFile(null);
      advanceStage('document_submitted'); // Explicitly pass the completed action
    } catch (err) {
      setIsTyping(false);
      addBotMessage(`❌ ${currentDocQuestion.acceptedDocs[0]} submission failed: ${err.message}. Please try again.`);
      updateStage(`collecting_doc_${docIndex + 1}`, 'handleSubmitDocument -> Error Fallback');
    }
  };

  const submitPayload = async (payload) => {
    // In a real implementation, this function would be split to send to two different URLs
    // based on the payload type (answers vs. document).
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

### `questions.json`

This JSON file defines the entire conversation flow, including all questions, their types, and validation rules.

```json
{
  "questions": [
    {
      "id": "current_insurer",
      "question": "Who is your current insurance provider?",
      "type": "text",
      "placeholder": "e.g., Oman Insurance, AXA, RSA",
      "required": true
    },
    {
      "id": "mobile",
      "question": "What is your mobile number?",
      "type": "text",
      "placeholder": "+971-XX-XXX-XXXX",
      "required": true,
      "validation": {
        "pattern": "^(\\+971|00971|0)?[0-9]{9}$",
        "errorMessage": "Please enter a valid UAE mobile number"
      }
    },
    {
      "id": "email",
      "question": "What is your email address?",
      "type": "text",
      "placeholder": "your.email@example.com",
      "required": true,
      "validation": {
        "pattern": "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$",
        "errorMessage": "Please enter a valid email address"
      }
    },
    {
      "id": "address",
      "question": "What is your address?",
      "type": "text",
      "placeholder": "Dubai, Abu Dhabi",
      "required": true
    },
    {
      "id": "city",
      "question": "What is your city?",
      "type": "text",
      "placeholder": "Dubai, Abu Dhabi",
      "required": true
    },
    {
      "id": "Po_box",
      "question": "Enter your post office box no",
      "type": "number",
      "placeholder": "26069",
      "required": true
    },
    {
      "id": "Policy_type",
      "question": "What type of insurance coverage do you need?",
      "type": "select",
      "options": ["Comprehensive", "Third Party"],
      "required": true
    },
    {
      "id": "source",
      "question": "How did you find us?",
      "type": "text",
      "required": true
    },
    {
      "id": "claim_free_years",
      "question": "how much free claim should be given to client?",
      "type": "text",
      "placeholder": "0-0 Year",
      "required": true
    },
    {
      "id": "DNI_Scheme",
      "question": "which dni scheme u want?",
      "type": "text",
      "required": true
    },
    {
      "id": "marital_status",
      "question": "what is your marital status?",
      "type": "select",
      "options": ["Married", "Unmarried"],
      "required": true
    },
    {
      "id": "po_box_location",
      "question": "Enter Po_box Location",
      "type": "text",
      "placeholder": "Dubai, Abu Dhabi",
      "required": true
    },
    {
      "id": "Vehicle_mileage",
      "question": "Enter your Vehicle_mileage",
      "type": "number",
      "required": true
    },
    {
      "id": "Eid_front",
      "question": "Please upload your Emirates ID Front",
      "type": "file_upload",
      "required": true,
      "acceptedDocs": [
        "Emirates ID (Front)"
      ]
    },
    {
      "id": "Eid_back",
      "question": "Please upload your Emirates ID Back Page",
      "type": "file_upload",
      "required": true,
      "acceptedDocs": [
        "Emirates ID (Back)"
      ]
    },
    {
      "id": "DL_front",
      "question": "Please upload your Driving License Front Page",
      "type": "file_upload",
      "required": true,
      "acceptedDocs": [
        "Driving License (Front)"
      ]
    },
    {
      "id": "DL_back",
      "question": "Please upload your Driving License Back Page",
      "type": "file_upload",
      "required": true,
      "acceptedDocs": [
        "Driving License (Back)"
      ]
    },
    {
      "id": "mulkiya_front",
      "question": "Please upload your Mulkiya Front Page",
      "type": "file_upload",
      "required": true,
      "acceptedDocs": [
        "Mulkiya/RC Book (Front)"
      ]
    },
    {
      "id": "mulkiya_back",
      "question": "Please upload your Mulkiya Back Page",
      "type": "file_upload",
      "required": true,
      "acceptedDocs": [
        "Mulkiya/RC Book (Back)"
      ]
    }
  ]
}
```

### `server.js`

This is the backend server that receives data from the chatbot and saves it to a CSV file. (Note: This would be modified to save files and update a database as per our latest discussion).

```javascript
const express = require('express');
const cors = require('cors');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const fs = require('fs');

const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Allow large payloads for file uploads

const csvFilePath = 'submissions.csv';

app.post('/save', async (req, res) => {
    const data = req.body;
    console.log('Received data:', data);

    try {
        // Flatten the data and prepare headers
        const headers = Object.keys(data).map(key => ({ id: key, title: key }));
        const records = [data];

        // Check if file exists to determine if we need to write headers
        const fileExists = fs.existsSync(csvFilePath);

        const csvWriter = createCsvWriter({
            path: csvFilePath,
            header: headers,
            append: fileExists // Append if file exists, otherwise create new
        });

        await csvWriter.writeRecords(records);
        console.log('...Data was written to CSV successfully');
        res.status(200).json({ message: 'Submission saved successfully!' });
    } catch (error) {
        console.error('Error writing to CSV:', error);
        res.status(500).json({ message: 'Failed to save submission.' });
    }
});

app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});
```

---

## 3. Complete System Workflow

This section explains the step-by-step data flow and working of the application in its current, multi-stage submission configuration.

1.  **System Startup:**
    *   You start two servers in two separate terminals:
        1.  `python -m http.server 8080`: Serves the frontend chatbot application.
        2.  `node server.js`: Runs the backend service. (Note: As per our discussion, this service's role is to receive documents, save them, and update the database with their paths).
    *   You open `http://localhost:8080` in your browser to load the chatbot.

2.  **Application Loading:**
    *   `index.html` loads React, Babel (for compiling React's JSX syntax in the browser), and other libraries.
    *   It then loads `app.js`, which contains the entire chatbot application.

3.  **Chat Initialization:**
    *   The React component `InsuranceChatbot` mounts.
    *   A unique `track_id` is generated for the entire session (e.g., `TRACK-166543210`).
    *   The chatbot displays its initial welcome messages and then asks the first question from the `textQuestions` list defined in `questions.json`.

4.  **Answering Text Questions:**
    *   The chatbot proceeds sequentially through the text-based questions.
    *   As you provide answers, they are stored in the component's `answers` state object.
    *   After you answer the final text question (`Vehicle_mileage`), the `handleTextAnswer` function detects this is the end of the text portion. It displays a message ("Great, I have all your details...") and shows a **"Submit Answers"** button.

5.  **Submitting Answers (First Payload):**
    *   When you click "Submit Answers", the `handleSubmitAnswers` function is triggered.
    *   It creates a JSON payload containing the `track_id` and all the text answers you provided.
    *   It sends this payload via a `POST` request to your **n8n webhook URL** (as defined in `config.js`).
    *   n8n receives this data to begin its own workflow (e.g., creating the initial `leads` record in the database).

6.  **Submitting Documents (The Dual-Action Flow):**
    *   After the answers are submitted successfully, the chatbot's internal stage changes to `collecting_doc_1`.
    *   The UI now shows the prompt for the first document ("Please upload your Emirates ID Front") and a "Choose File..." button.
    *   When you select a file and click **"Submit Document"**, the `handleSubmitDocument` function is triggered. This function performs **two separate tasks**:
        1.  **Task 1 (Send to n8n):** It creates the specific document payload (with `track_id`, a new unique `session_id`, `document_type`, and the file's Base64 data) and sends it to your **n8n webhook** for OCR processing.
        