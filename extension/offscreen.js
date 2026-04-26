let videoElement = null;
let canvasElement = null;
let stream = null;
let faceMesh = null;
let currentLandmarks = null;
let isMultiFace = false;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch(message.action) {
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
    
    // Initialize FaceMesh
    faceMesh = new FaceMesh({locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
    }});
    
    faceMesh.setOptions({
        maxNumFaces: 5,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });

    faceMesh.onResults(onFaceResults);

    // Wait for video to be ready
    return new Promise((resolve) => {
        videoElement.onloadedmetadata = async () => {
            await videoElement.play();
            canvasElement.width = videoElement.videoWidth;
            canvasElement.height = videoElement.videoHeight;
            
            // Start continuous processing
            const camera = new Camera(videoElement, {
                onFrame: async () => {
                    await faceMesh.send({image: videoElement});
                },
                width: 640,
                height: 480
            });
            camera.start();
            
            resolve();
        };
    });
}

function onFaceResults(results) {
    if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
        currentLandmarks = null;
        isMultiFace = false;
        return;
    }

    isMultiFace = results.multiFaceLandmarks.length > 1;

    // Closest User Logic: Pick the face with largest bounding box area
    let bestFace = null;
    let maxArea = -1;

    for (const landmarks of results.multiFaceLandmarks) {
        let minX = 1, maxX = 0, minY = 1, maxY = 0;
        for (const lm of landmarks) {
            if (lm.x < minX) minX = lm.x;
            if (lm.x > maxX) maxX = lm.x;
            if (lm.y < minY) minY = lm.y;
            if (lm.y > maxY) maxY = lm.y;
        }
        const area = (maxX - minX) * (maxY - minY);
        if (area > maxArea) {
            maxArea = area;
            bestFace = landmarks;
        }
    }
    
    currentLandmarks = bestFace;
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
    if (faceMesh) {
        faceMesh.close();
        faceMesh = null;
    }
}
