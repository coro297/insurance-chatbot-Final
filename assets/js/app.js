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
  const [id, setId] = useState(null);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [pollIntervalId, setPollIntervalId] = useState(null);

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
    const newId = `TRACK-${Date.now()}`;
    setId(newId);
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

  useEffect(() => {
    // Cleanup polling on component unmount
    return () => {
      if (pollIntervalId) {
        clearInterval(pollIntervalId);
      }
    };
  }, [pollIntervalId]);

  // --- CORE LOGIC ---

  const pollForQuote = () => {
    const intervalId = setInterval(async () => {
      try {
        const res = await fetch(`${CONFIG.documentServerUrl}/quotes/status/${id}`);
        if (!res.ok) return; // Don't stop polling for server errors, just wait

        const data = await res.json();
        if (data.status === 'ready') {
          clearInterval(intervalId);
          setPollIntervalId(null);
          const quoteUrl = `${CONFIG.documentServerUrl}/artifacts/${data.path}`;
          addBotMessage(`✅ Your quote is ready! <a href="${quoteUrl}" target="_blank" rel="noopener noreferrer" class="text-cyan-400 underline">Click here to view it.</a>`);
        }
      } catch (err) {
        console.error('Polling error:', err);
        // You might want to stop polling after a certain number of errors
      }
    }, 5000); // Poll every 5 seconds
    setPollIntervalId(intervalId);
  };

  const askNextQuestion = (index, stageOverride, currentAnswers) => {
    const effectiveAnswers = currentAnswers || answers;
    const currentStage = stageOverride || stage;
    let question;

    if (currentStage === 'collecting_answers') {
        // Find the next valid question that meets dependency requirements
        let nextIndex = index;
        while (nextIndex < textQuestions.length) {
            const q = textQuestions[nextIndex];
            if (q.dependsOn) {
                const dependentAnswer = effectiveAnswers[q.dependsOn.id];
                // Only ask the question if the dependent answer is one of the specified values
                if (dependentAnswer && q.dependsOn.value.includes(dependentAnswer)) {
                    question = q;
                    break; // Found a valid question
                } else {
                    nextIndex++; // Skip this question and check the next one
                }
            } else {
                question = q; // No dependencies, it's a valid question
                break;
            }
        }
        // Update the main index to the one we found
        setCurrentQuestionIndex(nextIndex);

    } else if (currentStage.startsWith('collecting_doc_')) {
        const docIndex = parseInt(currentStage.split('_')[2]) - 1;
        question = docQuestions[docIndex];
    }

    if (question) {
        setTimeout(() => addBotMessage(question.question, question), 500);
    } else if (stage === 'collecting_answers') {
        // If no more valid text questions are found, move to the next stage
        addBotMessage("Great, I have all your details. Please review and click submit.");
        updateStage('answers_ready_to_submit', 'askNextQuestion -> No More Valid Questions');
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
            addBotMessage("Thank you! We have everything we need. Your reference ID for this entire submission is: #" + id);
            setTimeout(() => {
                addBotMessage("🔄 We are now generating your quote. This may take a moment...");
                pollForQuote(); // Start polling for the quote
            }, 1000);
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

    const payload = { id: id, ...answers };

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
      id: id,
      session_Id: `AIBLCBD-${Date.now()}-${docIndex + 1}`,
      document_type: docTypeMap[currentDocQuestion.id],
      file: base64Data.split(',')[1],
      fileType: fileType
    };

    try {
      // 1) Send to n8n for OCR (existing behavior)
      await submitPayload(payload);

      // 2) Also send to Node to save file and write DB path
      if (CONFIG.debugMode) {
        console.log('Submitting document to Node.js server...');
      }
      const nodeRes = await fetch(`${CONFIG.documentServerUrl}/documents/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: id,
          doc_type: payload.document_type,     // e.g. EMIRATESID_FRONT
          file_b64: payload.file,              // no data URL prefix
          file_ext: payload.fileType,          // 'jpg' | 'png' | 'pdf'
          mime: uploadedFile?.type || 'application/octet-stream'
        })
      });

      if (!nodeRes.ok) {
        const txt = await nodeRes.text();
        throw new Error(`Node server error: ${nodeRes.status} ${txt}`);
      }

      const nodeJson = await nodeRes.json();
      if (CONFIG.debugMode) {
        console.log('Node.js server response:', nodeJson);
      }

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
        const responseJson = await response.json();
        console.log('Submission successful. n8n responded with:', responseJson);

        // Forward the OCR response to our own backend to update the DB
        console.log('Forwarding n8n response to local server...');
        const nodeRes = await fetch(`${CONFIG.documentServerUrl}/leads/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(responseJson)
        });

        if (!nodeRes.ok) {
            const txt = await nodeRes.text();
            throw new Error(`Node server (for DB update) error: ${nodeRes.status} ${txt}`);
        }
    }
  };

  // --- UI HANDLERS ---

  const handleTextAnswer = (questionId, value) => {
    const newAnswers = { ...answers, [questionId]: value };
    setAnswers(newAnswers);
    setUserInput('');

    const nextQuestionIndex = currentQuestionIndex + 1;

    // Pass the newAnswers object directly to ensure the dependency check is up-to-date
    askNextQuestion(nextQuestionIndex, undefined, newAnswers);
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
    const newAnswers = { ...answers, [questionId]: option };
    setAnswers(newAnswers);

    const nextQuestionIndex = currentQuestionIndex + 1;
    // Pass newAnswers directly to the next question asker
    askNextQuestion(nextQuestionIndex, undefined, newAnswers);
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
                <div className="text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: msg.text }}></div>
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
              <input type={currentQuestion.type} value={userInput} onChange={(e) => setUserInput(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleTextSubmit()} placeholder={currentQuestion.placeholder || "Type your answer..."} className="flex-1 bg-slate-800/60 border border-cyan-500/30 rounded-2xl px-6 py-4 text-cyan-50"/>
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
        console.log(data.questions)
        root.render(<InsuranceChatbot allQuestions={data.questions} />);
    })
    .catch(err => {
        console.error('Failed to load questions:', err);
    });