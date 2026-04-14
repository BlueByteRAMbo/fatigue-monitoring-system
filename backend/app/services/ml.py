import joblib
import numpy as np
import os

_model = None
_features = None


def load_model():
    global _model, _features
    model_path = os.path.join(
        os.path.dirname(__file__), "..\\..\\..\\model\\v1.pkl"
    )
    data = joblib.load(model_path)
    _model = data["model"]
    _features = data["features"]
    print(f"INFO: ML model loaded | features: {_features}")


def predict(left_ear: float, right_ear: float, avg_ear: float,
            mar: float, pitch: float, yaw: float, roll: float,
            baseline_ear: float = None) -> dict:
    if _model is None:
        raise RuntimeError("Model not loaded. Call load_model() first.")

    sample = np.array([[left_ear, right_ear, avg_ear, mar, pitch, yaw, roll]])
    proba = _model.predict_proba(sample)[0][1]  # probability of fatigue

    # Dynamic Thresholding
    # DEFAULT_EAR_THRESHOLD = 0.22. We use baseline_ear * 0.82 if provided.
    EAR_THRESHOLD = (baseline_ear * 0.82) if baseline_ear else 0.22
    
    MAR_THRESHOLD = 0.55
    PITCH_LIMIT   = 20.0
    MODEL_THRESHOLD = 0.50

    triggers = []
    if proba >= MODEL_THRESHOLD:
        triggers.append("MODEL")
    if avg_ear < EAR_THRESHOLD:
        triggers.append("EAR")
    if mar > MAR_THRESHOLD:
        triggers.append("YAWN")
    if abs(pitch) > PITCH_LIMIT:
        triggers.append("NOD")

    is_fatigued = bool(triggers)

    if not is_fatigued:
        fatigue_level = "low"
    elif proba < 0.70:
        fatigue_level = "medium"
    else:
        fatigue_level = "high"

    return {
        "fatigue_level": fatigue_level,
        "confidence":    round(float(proba), 4),
        "triggers":      triggers,
        "is_fatigued":   is_fatigued,
    }