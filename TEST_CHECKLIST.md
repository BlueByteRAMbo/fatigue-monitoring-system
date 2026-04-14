# ✅ Final Test Checklist

Follow these steps to ensure the system is fully functional before production deployment.

## 1. Timezone & Timer Verification (IST)
- [ ] **Creation Time**: Create a meeting as a Teacher. Check the `started_at` in the dashboard; it must match your current local IST time.
- [ ] **Student Join**: Join the meeting via the Extension. The "Joining" status should resolve immediately.
- [ ] **Timer Start**: Verify the Extension timer starts at exactly `00:00:00`.
- [ ] **Drift Test**: Wait 2 minutes. Close the extension and re-open it. The timer should resume from `00:02:xx`.
- [ ] **IST Standardization**: Check the "Fatigue Logs" in the student portal. The timestamps shown must all be in IST.

## 2. Presence & Attendance Tracking
- [ ] **Live Count**: Open the Teacher Portal and Extension simultaneously. Observe the "Active Students" count increment.
- [ ] **Clean Exit**: Click the "Leave" button in the extension. Verify the status changes to "Left" in the Teacher Portal instantly.
- [ ] **Dirty Exit**: Hard-close the browser (or disable the extension) while monitoring. Wait 10 seconds and check the Teacher Portal. The student should be marked as "Left".
- [ ] **Duration Math**: Ensure that `Total Session Time` = `Leave Time - Join Time`.

## 3. Core Fatigue Analytics
- [ ] **Face Detection**: Move your face away from the camera. The extension status should turn red/warn.
- [ ] **Alerts**: Sustain a yawn or high blink rate. Verify that the Dashboard reflects "Medium" or "High" fatigue within 10 seconds.
- [ ] **Calibration**: Perform a 5-second calibration. Ensure the backend returns a `baseline_ear` around `0.25 - 0.35` under good lighting.

## 4. Production Readiness
- [ ] **CORS**: Verify the extension can still talk to the API when both are hosted on different domains.
- [ ] **Environmental Secrets**: Verify that no real passwords or keys exist in `.env.example`.
- [ ] **Database Integrity**: Ensure `uvicorn` starts without errors with an empty database.
