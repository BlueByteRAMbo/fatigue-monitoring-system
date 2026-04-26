import cv2
import numpy as np
from scipy.spatial.distance import euclidean
from types import SimpleNamespace

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


def _ear(landmarks, eye_ids, w, h):
    pts = np.array([(landmarks[i].x * w, landmarks[i].y * h) for i in eye_ids])
    A = euclidean(pts[1], pts[5])
    B = euclidean(pts[2], pts[4])
    C = euclidean(pts[0], pts[3])
    return float((A + B) / (2.0 * C)) if C > 0 else 0.0


def _mar(landmarks, mouth_ids, w, h):
    pts = np.array([(landmarks[i].x * w, landmarks[i].y * h) for i in mouth_ids])
    A = euclidean(pts[2], pts[6])
    B = euclidean(pts[3], pts[7])
    C = euclidean(pts[4], pts[5])
    D = euclidean(pts[0], pts[1])
    return float((A + B + C) / (2.0 * D)) if D > 0 else 0.0


def _head_pose(landmarks, w, h):
    img_pts = np.array([
        (landmarks[i].x * w, landmarks[i].y * h) for i in POSE_LM_IDS
    ], dtype=np.float64)
    # Focal len approximation
    focal   = w
    cam_mat = np.array([
        [focal, 0,     w / 2],
        [0,     focal, h / 2],
        [0,     0,     1    ],
    ], dtype=np.float64)
    dist_coeffs = np.zeros((4, 1))
    _, rvec, _  = cv2.solvePnP(
        MODEL_POINTS, img_pts, cam_mat, dist_coeffs,
        flags=cv2.SOLVEPNP_ITERATIVE
    )
    rot_mat, _  = cv2.Rodrigues(rvec)
    angles, *_  = cv2.RQDecomp3x3(rot_mat)
    return float(angles[0]), float(angles[1]), float(angles[2])


def _position_status(landmarks, w, h):
    # Normalized coords from landmarks
    x_coords = [lm.x for lm in landmarks]
    y_coords = [lm.y for lm in landmarks]
    
    face_w = max(x_coords) - min(x_coords)
    face_h = max(y_coords) - min(y_coords)
    center_x = (max(x_coords) + min(x_coords)) / 2
    
    size_ratio = (face_w + face_h) / 2
    
    if size_ratio > 0.8: return "too_close"
    if size_ratio < 0.2: return "too_far"
    if abs(center_x - 0.5) > 0.25: return "off_center"
    return "good"


def extract_features_from_landmarks(landmarks_raw: list) -> dict | None:
    """
    Accepts 468 landmarks (list of dicts) from the Chrome extension.
    Returns a dict of features + metadata.
    """
    if not landmarks_raw:
        return None

    # Convert to object notation for existing helpers
    lm = [SimpleNamespace(**l) for l in landmarks_raw]
    
    # Reference dimensions (landmarks are normalized, so any 4:3 works)
    w, h = 640, 480

    left_ear  = _ear(lm, LEFT_EYE,  w, h)
    right_ear = _ear(lm, RIGHT_EYE, w, h)
    avg_ear   = (left_ear + right_ear) / 2.0
    mar       = _mar(lm, MOUTH, w, h)
    pitch, yaw, roll = _head_pose(lm, w, h)

    return {
        "left_EAR":  round(left_ear,  4),
        "right_EAR": round(right_ear, 4),
        "avg_EAR":   round(avg_ear,   4),
        "MAR":       round(mar,       4),
        "pitch":     round(pitch,     2),
        "yaw":       round(yaw,       2),
        "roll":      round(roll,      2),
        "brightness": 100.0, # Brightness check removed from backend (edge only)
        "position":  _position_status(lm, w, h)
    }


def extract_features(image_b64: str) -> dict | None:
    # Deprecated: Image processing was moved to the student extension (Option 2)
    return None