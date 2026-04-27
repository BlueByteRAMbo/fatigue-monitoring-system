let videoElement = null;
let canvasElement = null;
let stream = null;
let currentLandmarks = null;
let isMultiFace = false;
let sandboxIframe = null;
let isSandboxProcessing = false;

// Receive landmarks from Sandbox
window.addEventListener('message', (event) => {
    if (event.data.type === 'LANDMARKS') {
        currentLandmarks = event.data.landmarks;
        isMultiFace = event.data.multi_face;
        isSandboxProcessing = false;
        
        // Remove massive logging to prevent console lag, background polling already logs success
    } else if (event.data.type === 'ERROR') {
        console.error("OFFSCREEN: Sandbox Error:", event.data.message);
        isSandboxProcessing = false;
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
        case 'INIT_CAMERA':
            initCamera()
                .then(() => sendResponse({ success: true }))
                .catch(err => sendResponse({ success: false, error: err.toString() }));
            return true;
        case 'GET_LANDMARKS':
            sendResponse({
                landmarks: currentLandmarks,
                multi_face: isMultiFace
            });
            return false;
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
    if (stream) return;
    videoElement = document.getElementById('webcam');
    canvasElement = document.getElementById('canvas');

    stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 }
    });

    videoElement.srcObject = stream;
    console.log("OFFSCREEN: Camera stream active.");
    
    sandboxIframe = document.getElementById('sandbox');
    console.log("OFFSCREEN: Sandbox iframe connected.");

    // Wait for video to be ready
    return new Promise((resolve) => {
        videoElement.onloadedmetadata = async () => {
            await videoElement.play();
            canvasElement.width = videoElement.videoWidth;
            canvasElement.height = videoElement.videoHeight;

            // Native Frame Loop (More stable than the Camera helper)
            async function processFrame() {
                if (!stream) return; // Stop if camera stopped
                
                if (isSandboxProcessing) {
                    requestAnimationFrame(processFrame);
                    return; // Skip if sandbox is busy
                }
                
                try {
                    // Diagnostic: Check if video is actually sending data
                    if (videoElement.readyState >= 2 && videoElement.videoWidth > 0) {
                        isSandboxProcessing = true;
                        const bitmap = await createImageBitmap(videoElement);
                        sandboxIframe.contentWindow.postMessage({ type: 'PROCESS_FRAME', image: bitmap }, '*', [bitmap]);
                    } else {
                        if (Date.now() % 5000 < 100) { // Log every 5 seconds
                            console.warn("OFFSCREEN: Video not ready yet. State:", videoElement.readyState, "Dim:", videoElement.videoWidth, "x", videoElement.videoHeight);
                        }
                    }
                } catch (e) {
                    console.error("OFFSCREEN: Frame transfer error:", e);
                }
                requestAnimationFrame(processFrame);
            }

            processFrame();
            resolve();
        };
    });
}



function takeSnapshot() {
    if (!stream || !videoElement || !canvasElement) return null;
    const ctx = canvasElement.getContext('2d');
    ctx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
    const dataUrl = canvasElement.toDataURL('image/jpeg', 0.8);
    return dataUrl.split(',')[1];
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
