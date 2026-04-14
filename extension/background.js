const API_URL = 'http://127.0.0.1:8000';
let monitoringInterval = null;
let studentSocket = null;

// Blink Rate & Fatigue State
let lastEyeState = 'open';
let blinkCount = 0;
let windowStartTime = 0;
let currentBlinkRate = 0;
let consecutiveFaceMisses = 0;
let baselineEar = null;
let lastAlertTime = 0;

// Config
const CAPTURE_INTERVAL_MS = 5000;
const ALERT_INTERVAL_MS = 30000;
const OFFSCREEN_PATH = 'offscreen.html';

// Listen to Popup UI Commands
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "START_MONITORING") {
        startMonitoring(message.meetingId, message.userId, message.token);
    } else if (message.action === "STOP_MONITORING") {
        stopMonitoring();
    } else if (message.action === "PERFORM_CALIBRATION") {
        performCalibration(message.token).then(sendResponse);
        return true; // Keep channel open for async
    }
});

async function performCalibration(token) {
    console.log("Starting Calibration Sequence...");
    const images = [];
    
    // Capture 5 frames quickly
    for (let i = 0; i < 5; i++) {
        const response = await chrome.runtime.sendMessage({ action: 'TAKE_SNAPSHOT' });
        if (response && response.image) images.push(response.image);
        await new Promise(r => setTimeout(r, 600));
    }

    if (images.length < 3) return { status: 'failed: could not capture enough frames' };

    try {
        const res = await fetch(`${API_URL}/analyze/calibrate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ images })
        });
        const data = await res.json();
        if (data.status === 'success') {
            baselineEar = data.baseline_ear;
            return { status: 'success' };
        }
        return { status: data.status };
    } catch (e) {
        return { status: 'failed: connection error' };
    }
}

async function playAlert() {
    // We send message to offscreen to play sound
    chrome.runtime.sendMessage({ action: 'PLAY_ALERT' }).catch(() => {});
}

async function ensureOffscreenDocument() {
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [chrome.runtime.getURL(OFFSCREEN_PATH)]
    });

    if (existingContexts.length > 0) return;

    await chrome.offscreen.createDocument({
        url: OFFSCREEN_PATH,
        reasons: ['USER_MEDIA'],
        justification: 'Capture student webcam for fatigue detection'
    });
}

async function startMonitoring(meetingId, userId, token) {
    if (monitoringInterval) return; // Already running

    console.log(`Starting Capture Loop for Meeting ${meetingId}...`);

    // Open Student WebSocket (Source of Truth for Attendance)
    const wsUrl = `ws://127.0.0.1:8000/ws/student/${userId}?meeting_id=${meetingId}`;
    studentSocket = new WebSocket(wsUrl);
    
    studentSocket.onopen = () => console.log("[WebSocket] Presence established");
    studentSocket.onclose = () => console.log("[WebSocket] Presence lost");
    studentSocket.onerror = (e) => console.error("[WebSocket] Error", e);
    
    await ensureOffscreenDocument();
    
    // Initialize Camera in Offscreen Document
    await chrome.runtime.sendMessage({ action: 'INIT_CAMERA' });

    // Reset Blink Rate Engine
    lastEyeState = 'open';
    blinkCount = 0;
    windowStartTime = Date.now();
    currentBlinkRate = 0;
    lastAlertTime = 0;

    // Start Capture Loop
    monitoringInterval = setInterval(() => {
        captureAndAnalyze(meetingId, token);
    }, CAPTURE_INTERVAL_MS);

    // Initial Badge State
    chrome.action.setBadgeText({ text: 'ON' });
    chrome.action.setBadgeBackgroundColor({ color: '#3b82f6' }); // Primary Blue
}

async function stopMonitoring() {
    if (!monitoringInterval) return;

    console.log("Stopping Capture Loop...");
    clearInterval(monitoringInterval);
    monitoringInterval = null;
    baselineEar = null;

    if (studentSocket) {
        studentSocket.close();
        studentSocket = null;
    }

    // Check if offscreen exists, if so stop camera
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [chrome.runtime.getURL(OFFSCREEN_PATH)]
    });

    if (existingContexts.length > 0) {
        await chrome.runtime.sendMessage({ action: 'STOP_CAMERA' });
        await chrome.offscreen.closeDocument();
    }

    chrome.action.setBadgeText({ text: '' });
}

async function captureAndAnalyze(meetingId, token) {
    try {
        // 1. Get Base64 Frame
        const response = await chrome.runtime.sendMessage({ action: 'TAKE_SNAPSHOT' });
        if (!response || !response.image) {
            console.warn("Failed to capture snapshot from offscreen document");
            return;
        }

        // 2. Prepare Payload
        const payload = {
            meeting_id: meetingId,
            image_b64: response.image,
            blink_rate: currentBlinkRate,
            baseline_ear: baselineEar
        };

        // 3. Fire to FastAPI Backend
        const apiRes = await fetch(`${API_URL}/analyze/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        if (!apiRes.ok) throw new Error(`API Error: ${apiRes.status}`);

        const result = await apiRes.json();
        
        // 4. Update Badge based on Fatigue Level
        if (result.face_detected === false) {
            if (++consecutiveFaceMisses >= 2) {
                chrome.runtime.sendMessage({ action: 'FACE_NOT_DETECTED', consecutiveMisses: consecutiveFaceMisses });
                chrome.action.setBadgeText({ text: '!!' });
                chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
            }
        } else {
            consecutiveFaceMisses = 0;
            chrome.runtime.sendMessage({ action: 'FACE_DETECTED' });
            
            // Environment Feedback
            chrome.runtime.sendMessage({ 
                action: 'METADATA_UPDATE', 
                brightness: result.brightness, 
                position: result.position 
            });

            // Alerts
            if (result.fatigue_level === 'high') {
                const now = Date.now();
                if (now - lastAlertTime > ALERT_INTERVAL_MS) {
                    playAlert();
                    lastAlertTime = now;
                }
            } else {
                lastAlertTime = 0;
            }

            updateBadge(result.fatigue_level);
        }

        // 5. Update Blink Machine State
        // Ensure EAR score exists and face was detected
        if (result.ear_score !== null && result.ear_score !== undefined) {
            const lowThreshold = (baselineEar ? baselineEar * 0.8 : 0.23);
            const eyeState = result.ear_score < lowThreshold ? "closed" : "open";
            
            // Blink occurs on exact transition from closed -> open
            if (lastEyeState === "closed" && eyeState === "open") {
                blinkCount++;
            }
            lastEyeState = eyeState;
            
            // Re-calculate Rolling blinks/minute
            const elapsedMinutes = (Date.now() - windowStartTime) / 60000;
            currentBlinkRate = elapsedMinutes > 0 ? Number((blinkCount / elapsedMinutes).toFixed(2)) : 0;
        }

    } catch (err) {
        console.error("Capture Loop Error:", err);
    }
}

function updateBadge(level) {
    // "low" | "medium" | "high"
    let color = '#64748b'; // default subtle
    let text = '-';
    
    if (level === 'low') {
        color = '#10b981'; // Green
        text = 'L';
    } else if (level === 'medium') {
        color = '#f59e0b'; // Orange/Yellow
        text = 'M';
    } else if (level === 'high') {
        color = '#ef4444'; // Red
        text = 'H';
    }

    chrome.action.setBadgeText({ text });
    chrome.action.setBadgeBackgroundColor({ color });
}
