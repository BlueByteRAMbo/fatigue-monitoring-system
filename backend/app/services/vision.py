import cv2
import numpy as np
import mediapipe as mp
from typing import Optional

mp_face_mesh = mp.solutions.face_mesh

# Landmark indices
LEFT_EYE  = [362, 385, 387, 263, 373, 380]
RIGHT_EYE = [33, 160, 158, 133, 153, 144]
MOUTH     = [61, 291, 39, 269, 0, 17]

# 3D model points for head pose estimation
MODEL_POINTS = np.array([
    (0.0,   0.0,    0.0),     # Nose tip
    (0.0,  -330.0, -65.0),    # Chin
    (-225.0, 170.0, -135.0),  # Left eye left corner
    (225.0,  170.0, -135.0),  # Right eye right corner
    (-150.0, -150.0, -125.0), # Left mouth corner
    (150.0,  -150.0, -125.0), # Right mouth corner
], dtype=np.float64)

# Corresponding landmark indices for pose
POSE_LANDMARK_IDS = [1, 152, 263, 33, 287, 57]


def _eye_aspect_ratio(landmarks, indices, w, h):
    pts = [(int(landmarks[i].x * w), int(landmarks[i].y * h)) for i in indices]
    A = np.linalg.norm(np.array(pts[1]) - np.array(pts[5]))
    B = np.linalg.norm(np.array(pts[2]) - np.array(pts[4]))
    C = np.linalg.norm(np.array(pts[0]) - np.array(pts[3]))
    return (A + B) / (2.0 * C) if C > 0 else 0.0


def _mouth_aspect_ratio(landmarks, indices, w, h):
    pts = [(int(landmarks[i].x * w), int(landmarks[i].y * h)) for i in indices]
    A = np.linalg.norm(np.array(pts[1]) - np.array(pts[5]))
    B = np.linalg.norm(np.array(pts[2]) - np.array(pts[4]))
    C = np.linalg.norm(np.array(pts[0]) - np.array(pts[3]))
    return (A + B) / (2.0 * C) if C > 0 else 0.0


def _head_pose(landmarks, w, h):
    image_points = np.array([
        (landmarks[i].x * w, landmarks[i].y * h)
        for i in POSE_LANDMARK_IDS
    ], dtype=np.float64)

    focal_length = w
    center = (w / 2, h / 2)
    camera_matrix = np.array([
        [focal_length, 0,            center[0]],
        [0,            focal_length, center[1]],
        [0,            0,            1         ]
    ], dtype=np.float64)

    dist_coeffs = np.zeros((4, 1))
    success, rotation_vec, _ = cv2.solvePnP(
        MODEL_POINTS, image_points, camera_matrix, dist_coeffs,
        flags=cv2.SOLVEPNP_ITERATIVE
    )
    if not success:
        return 0.0, 0.0, 0.0

    rotation_mat, _ = cv2.Rodrigues(rotation_vec)
    sy = np.sqrt(rotation_mat[0, 0] ** 2 + rotation_mat[1, 0] ** 2)
    pitch = float(np.degrees(np.arctan2(-rotation_mat[2, 0], sy)))
    yaw   = float(np.degrees(np.arctan2(rotation_mat[1, 0], rotation_mat[0, 0])))
    roll  = float(np.degrees(np.arctan2(rotation_mat[2, 1], rotation_mat[2, 2])))
    return pitch, yaw, roll


def extract_features(image_bytes: bytes) -> Optional[list]:
    """
    Takes raw image bytes, runs MediaPipe FaceMesh,
    and returns [left_EAR, right_EAR, avg_EAR, MAR, pitch, yaw, roll]
    or None if no face detected.
    """
    nparr = np.frombuffer(image_bytes, np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if frame is None:
        return None

    h, w = frame.shape[:2]
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

    with mp_face_mesh.FaceMesh(
        static_image_mode=True,
        max_num_faces=1,
        refine_landmarks=False,
        min_detection_confidence=0.5
    ) as face_mesh:
        results = face_mesh.process(rgb)

    if not results.multi_face_landmarks:
        return None

    lm = results.multi_face_landmarks[0].landmark

    left_ear  = _eye_aspect_ratio(lm, LEFT_EYE,  w, h)
    right_ear = _eye_aspect_ratio(lm, RIGHT_EYE, w, h)
    avg_ear   = (left_ear + right_ear) / 2.0
    mar       = _mouth_aspect_ratio(lm, MOUTH, w, h)
    pitch, yaw, roll = _head_pose(lm, w, h)

    return [left_ear, right_ear, avg_ear, mar, pitch, yaw, roll]