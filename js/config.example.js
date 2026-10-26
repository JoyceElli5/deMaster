// config.example.js – optional local settings.
// Copy this file to js/config.local.js and fill in your key.
// js/config.local.js is in .gitignore, so your key never goes on GitHub.
// Never put a real key in this example file – the repository is public.

window.DEMASTER_CONFIG = {
  groqKey: "",                          // from https://console.groq.com/keys
  markingModel: "openai/gpt-oss-120b",  // marks the answers
  visionModel: "qwen/qwen3.8-27b"       // reads the photo (must understand images)
};
