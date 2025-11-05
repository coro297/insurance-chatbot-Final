// ============================================
// CONFIGURATION FILE
// Edit this file to change settings
// ============================================

const CONFIG = {
  // This URL will be replaced with your live backend URL from Railway in a later step.
  documentServerUrl: 'https://your-backend-url.up.railway.app',
  
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