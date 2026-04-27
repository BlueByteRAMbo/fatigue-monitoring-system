let faceMesh = new FaceMesh({
    locateFile: (file) => {
        // In the sandbox, paths are relative to the sandbox URL
        return `libs/${file}`;
    }
});

faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

faceMesh.onResults((results) => {
    let currentLandmarks = null;
    let isMultiFace = false;
    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        isMultiFace = results.multiFaceLandmarks.length > 1;
        currentLandmarks = results.multiFaceLandmarks[0];
    }
    
    // Send landmarks back to the parent Offscreen document
    window.parent.postMessage({
        type: 'LANDMARKS',
        landmarks: currentLandmarks,
        multi_face: isMultiFace
    }, '*');
});

// Listen for video frames from the parent
window.addEventListener('message', async (event) => {
    if (event.data.type === 'PROCESS_FRAME') {
        const image = event.data.image; // ImageBitmap
        try {
            await faceMesh.send({ image: image });
        } catch (e) {
            window.parent.postMessage({ type: 'ERROR', message: e.toString() }, '*');
        }
        
        // Very important: close the ImageBitmap to prevent memory leaks in the sandbox
        if (image && typeof image.close === 'function') {
            image.close();
        }
    }
});
