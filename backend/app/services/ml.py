import joblib
import numpy as np
import os

_model = None
_features = None


def load_model():
    global _model, _features
    try:
        # Cross-platform path handling
        model_path = os.path.join(
            os.path.dirname(__file__), "..", "..", "..", "model", "v1.pkl"
        )
        
        if not os.path.exists(model_path):
            print(f"WARNING: Model file not found at {model_path}. Using heuristic fallback.")
            return

        data = joblib.load(model_path)
        _model = data["model"]
        _features = data["features"]
        print(f"INFO: ML model loaded | features: {_features}")
    except Exception as e:
        print(f"ERROR: Failed to load ML model: {e}. Falling back to heuristics.")
        _model = None


def predict(left_ear: float, right_ear: float, avg_ear: float,
            mar: float, pitch: float, yaw: float, roll: float,
            baseline_ear: float = None) -> dict:
    
    # Heuristic Thresholds
    EAR_THRESHOLD = (baseline_ear * 0.82) if baseline_ear else 0.22
    MAR_THRESHOLD = 0.55
    PITCH_LIMIT   = 20.0
    
    triggers = []
    proba = 0.0

    # 1. Attempt ML Prediction if model is loaded
    if _model is not None:
        try:
            sample = np.array([[left_ear, right_ear, avg_ear, mar, pitch, yaw, roll]])
            proba = float(_model.predict_proba(sample)[0][1])
            if proba >= 0.50:
                triggers.append("MODEL")
        except Exception as e:
            print(f"Prediction error: {e}")

    # 2. Heuristic Triggers (Safety Fallback)
    if avg_ear < EAR_THRESHOLD:
        triggers.append("EAR")
    if mar > MAR_THRESHOLD:
        triggers.append("YAWN")
    if abs(pitch) > PITCH_LIMIT:
        triggers.append("NOD")

    is_fatigued = bool(triggers)

    # 3. Fatigue Level Logic
    if not is_fatigued:
        fatigue_level = "low"
    elif proba > 0.70 or len(triggers) >= 2:
        fatigue_level = "high"
    else:
        fatigue_level = "medium"

    return {
        "fatigue_level": fatigue_level,
        "confidence":    round(proba, 4),
        "triggers":      triggers,
        "is_fatigued":   is_fatigued,
    }