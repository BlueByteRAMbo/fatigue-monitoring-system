# realtime_fatigue_detection.py
# Place in: ...\backend\app\models\
# Run: python realtime_fatigue_detection.py

# realtime_fatigue_detection.py
# Changes: threshold=0.50 | smoothing=25 frames | PERCLOS backup layer

import cv2
import joblib
import numpy as np
import warnings
import mediapipe as mp
from scipy.spatial.distance import euclidean
from collections import deque

warnings.filterwarnings("ignore", category=UserWarning)

# ── Load Model ───────────────────────────────────────────────────────────────
data      = joblib.load("../model/v1.pkl")
model     = data["model"]
threshold = 0.50          # ✅ CHANGED: was 0.80, lowered for safety
features  = data["features"]
print(f"✅ Model loaded | version={data['version']} | threshold={threshold} (safety mode)")

# ── Config ───────────────────────────────────────────────────────────────────
SMOOTH_N       = 25      # ✅ CHANGED: was 5, now 25 frames (~1s at 25fps)
EAR_THRESHOLD  = 0.22    # eyes considered closed below this
MAR_THRESHOLD  = 0.55    # mouth considered open (yawn) above this
PERCLOS_WINDOW = 60      # frames to compute PERCLOS over (~2s at 30fps)
PERCLOS_LIMIT  = 0.15    # flag if eyes closed >15% of window
PITCH_LIMIT    = 20.0    # head nodding threshold (degrees)

# ── MediaPipe Setup ──────────────────────────────────────────────────────────
mp_face_mesh = mp.solutions.face_mesh
face_mesh    = mp_face_mesh.FaceMesh(
    static_image_mode=False,
    max_num_faces=1,
    refine_landmarks=True,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5,
)

# Landmark indices
LEFT_EYE  = [362, 385, 387, 263, 373, 380]
RIGHT_EYE = [33,  160, 158, 133, 153, 144]
MOUTH     = [61, 291, 39, 181, 0, 17, 269, 405]

MODEL_POINTS = np.array([
    (0.0,    0.0,    0.0   ),
    (0.0,   -330.0, -65.0  ),
    (-225.0, 170.0, -135.0 ),
    (225.0,  170.0, -135.0 ),
    (-150.0,-150.0, -125.0 ),
    (150.0, -150.0, -125.0 ),
], dtype=np.float64)
POSE_LM_IDS = [1, 152, 33, 263, 61, 291]

# ── Buffers ──────────────────────────────────────────────────────────────────
prob_buffer    = deque(maxlen=SMOOTH_N)        # model probability smoothing
perclos_buffer = deque(maxlen=PERCLOS_WINDOW)  # ✅ NEW: PERCLOS tracking


# ── Feature Functions ─────────────────────────────────────────────────────────
def ear(landmarks, eye_ids, w, h):
    pts = np.array([(landmarks[i].x * w, landmarks[i].y * h) for i in eye_ids])
    A = euclidean(pts[1], pts[5])
    B = euclidean(pts[2], pts[4])
    C = euclidean(pts[0], pts[3])
    return (A + B) / (2.0 * C)


def mar(landmarks, mouth_ids, w, h):
    pts = np.array([(landmarks[i].x * w, landmarks[i].y * h) for i in mouth_ids])
    A = euclidean(pts[2], pts[6])
    B = euclidean(pts[3], pts[7])
    C = euclidean(pts[4], pts[5])
    D = euclidean(pts[0], pts[1])
    return (A + B + C) / (2.0 * D)


def head_pose(landmarks, w, h):
    img_pts = np.array([
        (landmarks[i].x * w, landmarks[i].y * h) for i in POSE_LM_IDS
    ], dtype=np.float64)
    focal   = w
    cam_mat = np.array([
        [focal, 0,     w / 2],
        [0,     focal, h / 2],
        [0,     0,     1    ],
    ], dtype=np.float64)
    dist_coeffs = np.zeros((4, 1))
    _, rvec, _  = cv2.solvePnP(MODEL_POINTS, img_pts, cam_mat, dist_coeffs,
                                flags=cv2.SOLVEPNP_ITERATIVE)
    rot_mat, _  = cv2.Rodrigues(rvec)
    angles, *_  = cv2.RQDecomp3x3(rot_mat)
    return angles[0], angles[1], angles[2]   # pitch, yaw, roll


# ── Draw Helpers ─────────────────────────────────────────────────────────────
def draw_bar(frame, label, value, max_val, x, y, color, warn=False):
    bar_w = int(min(value / max_val, 1.0) * 150)
    cv2.rectangle(frame, (x, y), (x + 150, y + 14), (50, 50, 50), -1)
    cv2.rectangle(frame, (x, y), (x + bar_w, y + 14), color, -1)
    if warn:
        cv2.rectangle(frame, (x, y), (x + 150, y + 14), (0, 0, 255), 1)
    cv2.putText(frame, f"{label}: {value:.3f}", (x, y - 4),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1)


def draw_alert_banner(frame, w, text, color):
    overlay = frame.copy()
    cv2.rectangle(overlay, (0, 0), (w, 36), (0, 0, 0), -1)
    cv2.addWeighted(overlay, 0.6, frame, 0.4, 0, frame)
    cv2.putText(frame, text, (10, 26),
                cv2.FONT_HERSHEY_SIMPLEX, 0.85, color, 2)


def draw_trigger_tags(frame, tags, x, y):
    """Show which layer(s) triggered the alert."""
    for i, tag in enumerate(tags):
        cv2.putText(frame, f"[{tag}]", (x, y + i * 20),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 80, 255), 1)


# ── Main Loop ─────────────────────────────────────────────────────────────────
cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
if not cap.isOpened():
    print("❌ Camera not found. Try changing index: VideoCapture(1, cv2.CAP_DSHOW)")
    exit()

cap.set(cv2.CAP_PROP_FRAME_WIDTH,  640)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
cap.set(cv2.CAP_PROP_FPS, 30)
print("🎥 Camera started. Press Q to quit.")

while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        break

    h, w  = frame.shape[:2]
    rgb   = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    res   = face_mesh.process(rgb)

    # defaults
    status_text  = "No Face Detected"
    status_color = (128, 128, 128)
    trigger_tags = []

    if res.multi_face_landmarks:
        lm = res.multi_face_landmarks[0].landmark

        # ── Compute features ─────────────────────────────────────────────
        l_ear             = ear(lm, LEFT_EYE,  w, h)
        r_ear             = ear(lm, RIGHT_EYE, w, h)
        avg_ear           = (l_ear + r_ear) / 2.0
        m_ar              = mar(lm, MOUTH, w, h)
        pitch, yaw, roll  = head_pose(lm, w, h)

        # ── Layer 1: Model prediction ────────────────────────────────────
        sample       = np.array([[l_ear, r_ear, avg_ear, m_ar, pitch, yaw, roll]])
        fatigue_prob = model.predict_proba(sample)[0][1]
        prob_buffer.append(fatigue_prob)
        smooth_prob  = np.mean(prob_buffer)
        model_alert  = smooth_prob >= threshold    # ✅ now uses 0.50

        # ── Layer 2: PERCLOS ─────────────────────────────────────────────
        perclos_buffer.append(1 if avg_ear < EAR_THRESHOLD else 0)
        perclos      = sum(perclos_buffer) / len(perclos_buffer)
        perclos_alert = perclos > PERCLOS_LIMIT    # ✅ NEW

        # ── Layer 3: Hard rules ───────────────────────────────────────────
        ear_alert    = avg_ear < EAR_THRESHOLD
        yawn_alert   = m_ar    > MAR_THRESHOLD
        nod_alert    = abs(pitch) > PITCH_LIMIT

        # ── Final decision: any layer triggers alert ──────────────────────
        if model_alert:   trigger_tags.append("MODEL")
        if perclos_alert: trigger_tags.append("PERCLOS")
        if ear_alert:     trigger_tags.append("EAR")
        if yawn_alert:    trigger_tags.append("YAWN")
        if nod_alert:     trigger_tags.append("NOD")

        is_fatigued  = bool(trigger_tags)
        status_text  = "⚠  FATIGUE DETECTED" if is_fatigued else "✓  ALERT"
        status_color = (0, 0, 255)            if is_fatigued else (0, 200, 0)

        # ── Bars ──────────────────────────────────────────────────────────
        draw_bar(frame, "L-EAR",   l_ear,      0.40, 10, 50,
                 (255, 200, 0),   warn=l_ear < EAR_THRESHOLD)
        draw_bar(frame, "R-EAR",   r_ear,      0.40, 10, 85,
                 (255, 200, 0),   warn=r_ear < EAR_THRESHOLD)
        draw_bar(frame, "MAR",     m_ar,       0.90, 10, 120,
                 (0, 180, 255),   warn=yawn_alert)
        draw_bar(frame, "PERCLOS", perclos,    0.30, 10, 155,
                 (180, 0, 255),   warn=perclos_alert)       # ✅ NEW bar
        draw_bar(frame, "Model P", smooth_prob, 1.0, 10, 190,
                 status_color,    warn=model_alert)

        # ── Head pose & trigger tags ──────────────────────────────────────
        cv2.putText(frame,
            f"Pitch:{pitch:+.1f}  Yaw:{yaw:+.1f}  Roll:{roll:+.1f}",
            (10, h - 15), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)

        if trigger_tags:
            draw_trigger_tags(frame, trigger_tags, w - 120, 55)

    # ── Banner ────────────────────────────────────────────────────────────────
    draw_alert_banner(frame, w, status_text, status_color)
    cv2.imshow("Fatigue Detection", frame)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
face_mesh.close()
print("👋 Stopped.")