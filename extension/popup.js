const API_URL = 'http://127.0.0.1:8000';

document.addEventListener('DOMContentLoaded', async () => {
    // Elements
    const viewLogin = document.getElementById('view-login');
    const viewMeeting = document.getElementById('view-meeting');
    
    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');
    
    const joinForm = document.getElementById('join-form');
    const joinSection = document.getElementById('join-section');
    const joinError = document.getElementById('join-error');
    
    const activeSessionSection = document.getElementById('active-session-section');
    const currentMeetingTitle = document.getElementById('current-meeting-title');
    
    const userNameEl = document.getElementById('user-name');
    const userRoleEl = document.getElementById('user-role');
    const userInitialEl = document.getElementById('user-initial');
    const statusDot = document.getElementById('status-dot');
    
    const btnLogout = document.getElementById('btn-logout');
    const btnLeave = document.getElementById('btn-leave');

    const faceAlertBanner = document.getElementById('face-alert-banner');
    const sessionTimerEl = document.getElementById('session-timer');
    const selfViewCanvas = document.getElementById('self-view-canvas');
    const ctx = selfViewCanvas.getContext('2d');

    let timerInterval = null;
    let snapshotInterval = null;
    let faceAlertTimeout = null;

    // Initialize State
    const init = async () => {
        const { token, user, activeMeeting } = await chrome.storage.local.get(['token', 'user', 'activeMeeting']);
        
        if (token && user) {
            showMeetingView(user, activeMeeting);
            checkServerStatus();
            
            if (activeMeeting) {
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                    stream.getTracks().forEach(track => track.stop());
                    chrome.runtime.sendMessage({ 
                        action: "START_MONITORING", 
                        meetingId: activeMeeting.id,
                        userId: user.id,
                        token: token
                    });
                    
                    // Use user_joined_at for the timer if available, otherwise fallback to started_at
                    startSessionUI(activeMeeting.user_joined_at || activeMeeting.started_at);
                } catch (e) {
                    console.warn("Camera permission missing on resume");
                    chrome.tabs.create({ url: chrome.runtime.getURL('camera.html') });
                }
            }
        } else {
            showLoginView();
        }
    };

    const showLoginView = () => {
        viewLogin.classList.add('active');
        viewLogin.classList.remove('hidden');
        viewMeeting.classList.add('hidden');
        viewMeeting.classList.remove('active');
        statusDot.className = 'status-dot offline';
    };

    const showMeetingView = (user, activeMeeting) => {
        viewLogin.classList.remove('active');
        viewLogin.classList.add('hidden');
        viewMeeting.classList.add('active');
        viewMeeting.classList.remove('hidden');
        statusDot.className = 'status-dot online';

        userNameEl.textContent = user.name;
        userRoleEl.textContent = user.email;
        userInitialEl.textContent = user.name.charAt(0).toUpperCase();

        if (activeMeeting) {
            joinSection.classList.add('hidden');
            activeSessionSection.classList.remove('hidden');
            currentMeetingTitle.textContent = activeMeeting.title;
            startSessionUI(activeMeeting.user_joined_at || activeMeeting.started_at);
        } else {
            joinSection.classList.remove('hidden');
            activeSessionSection.classList.add('hidden');
            stopSessionUI();
        }
    };

    const startSessionUI = (startedAt) => {
        stopSessionUI(); // cleanup just in case
        
        // Timer logic
        const updateTimer = () => {
            const now = Date.now();
            const start = new Date(startedAt).getTime();
            const elapsed = Math.max(0, now - start);
            
            const h = Math.floor(elapsed / 3600000).toString().padStart(2, '0');
            const m = Math.floor((elapsed % 3600000) / 60000).toString().padStart(2, '0');
            const s = Math.floor((elapsed % 60000) / 1000).toString().padStart(2, '0');
            sessionTimerEl.textContent = `⏱ ${h}:${m}:${s}`;
        };
        updateTimer();
        timerInterval = setInterval(updateTimer, 1000);

        // Snapshot loop for self-view
        const updateSnapshot = async () => {
            const response = await chrome.runtime.sendMessage({ action: 'TAKE_SNAPSHOT' });
            if (response && response.image) {
                const img = new Image();
                img.onload = () => {
                   ctx.drawImage(img, 0, 0, selfViewCanvas.width, selfViewCanvas.height);
                };
                img.src = response.image;
            }
        };
        updateSnapshot();
        snapshotInterval = setInterval(updateSnapshot, 2000);
    };

    const stopSessionUI = () => {
        if (timerInterval) clearInterval(timerInterval);
        if (snapshotInterval) clearInterval(snapshotInterval);
        timerInterval = null;
        snapshotInterval = null;
        ctx.clearRect(0, 0, selfViewCanvas.width, selfViewCanvas.height);
        showFaceAlert(false);
    };

    const showFaceAlert = (visible) => {
        if (visible) {
            faceAlertBanner.classList.remove('hidden');
            if (faceAlertTimeout) clearTimeout(faceAlertTimeout);
            faceAlertTimeout = setTimeout(() => showFaceAlert(false), 30000);
        } else {
            faceAlertBanner.classList.add('hidden');
            if (faceAlertTimeout) clearTimeout(faceAlertTimeout);
        }
    };

    const btnCalibrate = document.getElementById('btn-calibrate');
    const lightStatus = document.getElementById('light-status');
    const posStatus   = document.getElementById('pos-status');

    let isCalibrating = false;

    chrome.runtime.onMessage.addListener((message) => {
        if (message.action === 'FACE_NOT_DETECTED') {
            showFaceAlert(true);
        } else if (message.action === 'FACE_DETECTED') {
            showFaceAlert(false);
        } else if (message.action === 'METADATA_UPDATE') {
            if (lightStatus) {
                const b = message.brightness;
                lightStatus.textContent = b < 40 ? 'Dim' : b > 200 ? 'Very Bright' : 'Good';
                lightStatus.style.color = b < 40 ? '#ef4444' : '#10b981';
            }
            if (posStatus) {
                const p = message.position;
                posStatus.textContent = p.replace('_', ' ');
                posStatus.style.color = p === 'good' ? '#10b981' : '#f59e0b';
            }
        }
    });

    if (btnCalibrate) {
        btnCalibrate.addEventListener('click', async () => {
            if (isCalibrating) return;
            isCalibrating = true;
            btnCalibrate.textContent = '⏱ Calibrating...';
            btnCalibrate.disabled = true;

            try {
                const { token } = await chrome.storage.local.get('token');
                // Request background to perform calibration block
                const response = await chrome.runtime.sendMessage({ action: 'PERFORM_CALIBRATION', token });
                
                if (response && response.status === 'success') {
                    btnCalibrate.textContent = '✅ Calibrated';
                    btnCalibrate.style.background = '#10b98120';
                    btnCalibrate.style.color = '#10b981';
                } else {
                    btnCalibrate.textContent = '❌ Try Again';
                    btnCalibrate.style.color = '#ef4444';
                    alert(response?.status || 'Calibration failed');
                    setTimeout(() => {
                        btnCalibrate.textContent = '🎯 Calibrate';
                        btnCalibrate.disabled = false;
                        isCalibrating = false;
                    }, 3000);
                }
            } catch (err) {
                console.error(err);
                btnCalibrate.textContent = '🎯 Calibrate';
                btnCalibrate.disabled = false;
                isCalibrating = false;
            }
        });
    }

    const checkServerStatus = async () => {
        try {
            await fetch(`${API_URL}/`);
            statusDot.className = 'status-dot online';
        } catch {
            statusDot.className = 'status-dot offline';
        }
    };

    // Login logic
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        
        const btn = loginForm.querySelector('button');
        btn.textContent = 'Authenticating...';
        btn.disabled = true;
        loginError.classList.add('hidden');

        try {
            const res = await fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            if (!res.ok) throw new Error('Invalid credentials');
            
            const data = await res.json();
            const token = data.access_token;

            // Fetch User Details
            const userRes = await fetch(`${API_URL}/auth/me`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const userData = await userRes.json();

            await chrome.storage.local.set({ token, user: userData });
            showMeetingView(userData, null);

        } catch (err) {
            loginError.textContent = err.message;
            loginError.classList.remove('hidden');
        } finally {
            btn.textContent = 'Authenticate';
            btn.disabled = false;
        }
    });

    // Join Meeting Logic
    joinForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const code = document.getElementById('join-code').value.toUpperCase();
        
        const btn = joinForm.querySelector('button');
        btn.textContent = 'Joining...';
        btn.disabled = true;
        joinError.classList.add('hidden');

        try {
            const { token, user } = await chrome.storage.local.get(['token', 'user']);
            
            const res = await fetch(`${API_URL}/meetings/${code}/join`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.detail || 'Meeting not found');
            }

            const meetingData = await res.json();
            await chrome.storage.local.set({ activeMeeting: meetingData });
            // Request Camera Permission Interactively
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                stream.getTracks().forEach(track => track.stop()); // Stop immediately
                
                // Notify Background Script to Start Capture
                chrome.runtime.sendMessage({ 
                    action: "START_MONITORING", 
                    meetingId: meetingData.id,
                    userId: user.id,
                    token: token
                });
            } catch (mediaErr) {
                chrome.tabs.create({ url: chrome.runtime.getURL('camera.html') });
            }

            showMeetingView(user, meetingData);

        } catch (err) {
            joinError.textContent = err.message;
            joinError.classList.remove('hidden');
        } finally {
            btn.textContent = 'Join Session';
            btn.disabled = false;
        }
    });

    // Logout
    btnLogout.addEventListener('click', async () => {
        await chrome.storage.local.clear();
        chrome.runtime.sendMessage({ action: "STOP_MONITORING" });
        stopSessionUI();
        showLoginView();
    });

    // Leave Meeting
    btnLeave.addEventListener('click', async () => {
        const { activeMeeting, token } = await chrome.storage.local.get(['activeMeeting', 'token']);
        if (activeMeeting) {
            // Tell backend we are leaving
            fetch(`${API_URL}/meetings/${activeMeeting.id}/leave`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            }).catch(e => console.error("Leave error", e));
        }

        await chrome.storage.local.remove('activeMeeting');
        chrome.runtime.sendMessage({ action: "STOP_MONITORING" });
        stopSessionUI();
        const { user } = await chrome.storage.local.get('user');
        showMeetingView(user, null);
    });

    init();
});
