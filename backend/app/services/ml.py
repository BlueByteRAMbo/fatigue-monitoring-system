import os
import joblib
import numpy as np
from typing import Optional

_model = None
MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "model", "v1.pkl")

# Confidence threshold: proba >= this → "high", else "medium"
HIGH_THRESHOLD = 0.70


def load_model():
    """Call this once at app startup."""
    global _model
    if not os.path.exists(MODEL_PATH):
        print(f"[ml] WARNING: model not found at {MODEL_PATH}. Inference will return None.")
        return
    _model = joblib.load(MODEL_PATH)
    print(f"[ml] Model loaded from {MODEL_PATH}")


def predict(features: list) -> Optional[dict]:
    """
    Takes a 7-element feature vector:
      [left_EAR, right_EAR, avg_EAR, MAR, pitch, yaw, roll]

    Returns:
      {
        "fatigue_level": "low" | "medium" | "high",
        "confidence": float (0.0–1.0),
      }
    or None if the model isn't loaded yet.
    """
    if _model is None:
        return None

    X = np.array(features).reshape(1, -1)
    prediction   = int(_model.predict(X)[0])
    probabilities = _model.predict_proba(X)[0]

    # probabilities[1] = probability of class 1 (drowsy/fatigued)
    drowsy_proba = float(probabilities[1])

    if prediction == 0:
        fatigue_level = "low"
        confidence    = float(probabilities[0])
    elif drowsy_proba >= HIGH_THRESHOLD:
        fatigue_level = "high"
        confidence    = drowsy_proba
    else:
        fatigue_level = "medium"
        confidence    = drowsy_proba

    return {
        "fatigue_level": fatigue_level,
        "confidence":    round(confidence, 4),
    }