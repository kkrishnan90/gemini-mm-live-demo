# VAD Debugging Guide

## 🐛 Critical Bug Fixed: VAD Configuration Logic Error

### **Issue Identified**
The VAD system had **reversed logic** in the frontend configuration:

**Before Fix (BROKEN):**
```javascript
// Lines 391, 399 in useAudio.js - WRONG LOGIC
const frontendVadEnabled = process.env.REACT_APP_DISABLE_VAD === "true"; // ❌
enableVAD: process.env.REACT_APP_DISABLE_VAD === "true", // ❌

// Lines 66, 89 in useAudio.js - CORRECT LOGIC
frontendVadActive: process.env.REACT_APP_DISABLE_VAD !== "true", // ✅
```

**After Fix (CORRECT):**
```javascript
// All lines now use consistent logic
const frontendVadEnabled = process.env.REACT_APP_DISABLE_VAD !== "true"; // ✅
enableVAD: process.env.REACT_APP_DISABLE_VAD !== "true", // ✅
```

### **Environment Variables Added**

**Backend (.env):**
```bash
DISABLE_VAD=false  # Enable dual VAD system (recommended)
```

**Frontend (.env):**
```bash
REACT_APP_DISABLE_VAD=false  # Enable frontend VAD for barge-in
```

## 🔍 How to Monitor VAD with Enhanced Logging

### **1. Key Log Messages to Watch For**

**VAD Configuration Startup:**
```
Frontend VAD: ENABLED for barge-in detection
🎙️ Voice Activity Detection: ENABLED
```

**Audio State Correlation:**
```
🎤 AUDIO INPUT CORRELATION: id=backend_audio_123, gemini_vad=ENABLED
🔊 GEMINI PLAYBACK START: should_activate_frontend_vad=true
VAD STATE MACHINE: recording_active -> barge_in_detected (user_speech_during_gemini_playback)
```

**VAD State Transitions:**
```
VAD State: idle -> recording_active (microphone_started)
VAD State: recording_active -> barge_in_detected (user_speech_during_gemini_playback) 
BARGE-IN TRIGGERED: User speech during Gemini playback (energy: 0.045, threshold: 0.040)
```

### **2. Troubleshooting VAD Issues**

**Problem: No barge-in detection**
Check for:
```
Frontend VAD: DISABLED (using Gemini native VAD only)
```
**Solution:** Set `REACT_APP_DISABLE_VAD=false`

**Problem: Constant VAD triggers**
Look for:
```
VAD detected speech but no playback active (energy: 0.123)
```
**Solution:** Adjust VAD sensitivity or check for background noise

**Problem: Delayed barge-in**
Monitor timing:
```
🎤 AUDIO INPUT CORRELATION: connection_time=5.34s
transmissionLatency: 150ms
```
**Solution:** Check network latency and buffer sizes

### **3. Expected VAD Behavior**

**Optimal Configuration:**
- `DISABLE_VAD=false` (backend)
- `REACT_APP_DISABLE_VAD=false` (frontend)

**Expected Flow:**
1. **User starts speaking** → Frontend VAD captures audio → Send to Gemini
2. **Gemini responds** → Backend signals playback start → Frontend VAD stays active for barge-in
3. **User interrupts** → Frontend VAD detects barge-in → Stop Gemini playback → Resume user input

### **4. Correlation ID Tracking**

Use correlation IDs to trace audio flow:
```
🎤 AUDIO RECEIVED: 4096 bytes [ID: backend_audio_1703123456789_12345]
🔊 GEMINI PLAYBACK START: [ID: gemini_response_1703123456790_67890]  
BARGE-IN TRIGGERED: [ID: audio_1703123456791_3]
```

### **5. Performance Metrics**

Monitor these values:
- **Glass-to-glass latency**: < 100ms ideal
- **VAD sensitivity**: 0.3-0.5 range
- **Transmission latency**: < 50ms
- **Energy threshold**: 0.04 default

## 🚨 Red Flags to Watch For

1. **Conflicting VAD states**: Both systems fighting for control
2. **Audio chunks dropped**: Failed transmission logs
3. **High latency**: > 200ms glass-to-glass
4. **VAD state loops**: Rapid state transitions
5. **Missing correlation IDs**: Broken logging chain

## ✅ Signs of Healthy VAD System

1. Clear barge-in detection during Gemini responses
2. Smooth conversation turn-taking
3. No audio dropouts or glitches
4. Consistent correlation ID tracking
5. VAD state transitions make logical sense