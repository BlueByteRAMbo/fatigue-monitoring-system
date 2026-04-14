let videoElement = null;
let canvasElement = null;
let stream = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch(message.action) {
        case 'INIT_CAMERA':
            initCamera()
                .then(() => sendResponse({ success: true }))
                .catch(err => sendResponse({ success: false, error: err.toString() }));
            return true;
        case 'TAKE_SNAPSHOT':
            const base64 = takeSnapshot();
            sendResponse({ image: base64 });
            return false;
        case 'STOP_CAMERA':
            stopCamera();
            sendResponse({ success: true });
            return false;
        case 'PLAY_ALERT':
            playBeep();
            sendResponse({ success: true });
            return false;
    }
});

function playBeep() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);

        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.5);
    } catch (e) {
        console.error("Audio playback error", e);
    }
}

async function initCamera() {
    if (stream) return; // Already initialized
    videoElement = document.getElementById('webcam');
    canvasElement = document.getElementById('canvas');
    
    stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 640, height: 480 } 
    });
    
    videoElement.srcObject = stream;
    
    // Wait for video to be ready
    return new Promise((resolve) => {
        videoElement.onloadedmetadata = () => {
            videoElement.play();
            canvasElement.width = videoElement.videoWidth;
            canvasElement.height = videoElement.videoHeight;
            resolve();
        };
    });
}

function takeSnapshot() {
    if (!stream || !videoElement || !canvasElement) return null;
    
    const ctx = canvasElement.getContext('2d');
    ctx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
    
    // Return base64 JPEG
    const dataUrl = canvasElement.toDataURL('image/jpeg', 0.8);
    // Strip the "data:image/jpeg;base64," prefix.
    const base64Str = dataUrl.split(',')[1];
    return base64Str;
}

function stopCamera() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }
    if (videoElement) {
        videoElement.srcObject = null;
    }
}
