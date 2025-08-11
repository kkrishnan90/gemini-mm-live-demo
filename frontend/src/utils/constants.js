import { BrowserCompatibility } from './audioUtils.js';

export const INPUT_SAMPLE_RATE = 16000;
export const OUTPUT_SAMPLE_RATE = 24000;
export const MIC_BUFFER_SIZE = BrowserCompatibility.getOptimalBufferSize();
export const ENHANCED_AUDIO_WORKLET_URL = '/enhanced-audio-processor.js';
export const FALLBACK_AUDIO_WORKLET_URL = '/audio-processor.js';
export const MAX_AUDIO_QUEUE_SIZE = 50;
export const WEBSOCKET_SEND_BUFFER_LIMIT = 65536;
export const MAX_RETRY_ATTEMPTS = 3;
export const RETRY_DELAY_BASE = 100;
export const MAX_AUDIO_CONTEXT_RECOVERY_ATTEMPTS = 5;
export const AUDIO_CONTEXT_RECOVERY_DELAY = 1000;
export const AUDIO_RECOVERY_DELAY_MS = 10; // Delay for audio queue recovery operations
export const LATENCY_TARGET_MS = 20; // Target latency in milliseconds
export const JITTER_BUFFER_MIN_FILL = 2; // The minimum number of chunks required in the buffer before playback starts.
export const JITTER_BUFFER_MAX_FILL = 10; // The maximum number of chunks to hold in the buffer.

export const LANGUAGES = [
  {code: "en-IN", name: "English (Hinglish)"},
  {code: "hi-IN", name: "हिंदी (Hindi)"},
  {code: "mr-IN", name: "मराठी (Marathi)"},
  {code: "ta-IN", name: "தமிழ் (Tamil)"},
  {code: "bn-IN", name: "বাংলা (Bengali)"},
  {code: "te-IN", name: "తెలుగు (Telugu)"},
  {code: "gu-IN", name: "ગુજરાતી (Gujarati)"},
  {code: "kn-IN", name: "ಕನ್ನಡ (Kannada)"},
  {code: "ml-IN", name: "മലയാളം (Malayalam)"},
  {code: "pa-IN", name: "ਪੰਜਾਬੀ (Punjabi)"},
];

// const BACKEND_HOST =  'gemini-backend-service-1018963165306.us-central1.run.app';
export const BACKEND_HOST = "localhost:8000";