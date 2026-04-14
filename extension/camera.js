document.getElementById('btn-allow').addEventListener('click', async () => {
    const statusEl = document.getElementById('status');
    statusEl.textContent = "Requesting permission...";
    statusEl.className = "";
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach(track => track.stop()); // Immediately stop it
        statusEl.textContent = "Permission Granted! You can close this tab and use the extension.";
        statusEl.className = "success";
        
        // Auto-close after 3 seconds
        setTimeout(() => {
            window.close();
        }, 3000);
    } catch (err) {
        statusEl.textContent = "Permission denied or error occurred: " + err.message;
        statusEl.className = "error";
    }
});
