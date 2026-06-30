"""
Inference pipeline for the Solar Flare Early Warning System (TensorFlow/Keras version).
Loads the 1D-CNN Nowcaster and BiLSTM Forecaster models from disk and exposes
a clean API for running inference. Uses optimal thresholds from config.
"""

from __future__ import annotations
import logging
import os
import sys
import json
from pathlib import Path
from typing import Any
import numpy as np
import tensorflow as tf
from backend.ml.models import build_nowcast_model, build_forecast_model

# Allow imports from the top-level project
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

from backend.ml.models import BinaryFocalLoss

logger = logging.getLogger("solarflare.inference")

_FLARE_CLASSES: list[str] = ["B", "C", "M", "X"]

class InferencePipeline:
    """Unified inference pipeline wrapping all trained Keras models."""

    def __init__(self, models_dir: str | Path) -> None:
        self.models_dir = Path(models_dir)
        self.device = "/GPU:0" if tf.config.list_physical_devices('GPU') else "/CPU:0"
        logger.info("Inference device: %s", self.device)

        # Load optimized thresholds
        self.thresholds = {"nowcast_threshold": 0.52, "forecast_threshold": 0.49}
        threshold_path = self.models_dir / "thresholds.json"
        if threshold_path.exists():
            try:
                with open(threshold_path, "r") as f:
                    self.thresholds = json.load(f)
                logger.info("Loaded optimized thresholds: %s", self.thresholds)
            except Exception as e:
                logger.error("Failed to load thresholds.json: %s", e)

        # Load Keras models
        self._models: dict[str, tf.keras.Model | None] = {}
        self._models["nowcast_1dcnn"] = self._try_load("nowcast_1dcnn.h5")
        self._models["forecast_bilstm"] = self._try_load("forecast_bilstm.h5")

    def _try_load(self, filename: str) -> tf.keras.Model | None:
        """Build model architecture and load weights-only (avoids broken Keras 3 .h5 deserialization)."""
        weights_filename = filename.replace(".h5", ".weights.h5")
        weights_path = self.models_dir / weights_filename
        if not weights_path.exists():
            logger.warning("Weights file not found: %s — using fallback simulation.", weights_path)
            return None
        try:
            if "nowcast" in filename:
                model = build_nowcast_model(window_length=60, in_channels=4)
            else:
                model = build_forecast_model(window_length=120, in_channels=5)
            model.load_weights(str(weights_path))
            logger.info("Loaded weights successfully from %s", weights_path)
            return model
        except Exception as exc:
            logger.error("Failed to load weights from %s: %s", weights_path, exc)
            return None

    @property
    def models_loaded(self) -> dict[str, bool]:
        """Return status mapping of loaded models."""
        return {
            "nowcast_1dcnn": self._models.get("nowcast_1dcnn") is not None,
            "forecast_bilstm": self._models.get("forecast_bilstm") is not None,
        }

    # ------------------------------------------------------------------
    # 1. Denoising / Cleaning
    # ------------------------------------------------------------------

    def clean(
        self,
        raw_window: list[float],
        instrument: str = "solexs",
    ) -> tuple[list[float], list[float]]:
        """Clean a raw telemetry window using a simple moving-average fallback."""
        arr = np.array(raw_window, dtype=np.float32)
        kernel_size = min(5, len(arr))
        if kernel_size > 0:
            kernel = np.ones(kernel_size) / kernel_size
            smoothed = np.convolve(arr, kernel, mode="same")
        else:
            smoothed = arr
        residuals = np.abs(arr - smoothed)
        return smoothed.tolist(), residuals.tolist()

    # ------------------------------------------------------------------
    # 2. Nowcasting
    # ------------------------------------------------------------------

    def nowcast(
        self,
        hxr_features: list[list[float]] | np.ndarray,
    ) -> tuple[float, bool, float]:
        """Predict the imminent-flare probability from SXR Nowcaster features.

        Parameters
        ----------
        hxr_features : array-like, shape ``[60, 4]``
            Four-channel feature matrix: counts_clean, rolling_mean,
            rolling_std, zscore.
        """
        model = self._models.get("nowcast_1dcnn")
        th_n = self.thresholds.get("nowcast_threshold", 0.52)

        if model is not None:
            # Keras expects (batch, sequence, channels) -> shape (1, 60, 4)
            arr = np.array(hxr_features, dtype=np.float32)
            if arr.shape != (60, 4):
                # Align shape if mismatch occurs
                if arr.shape[0] > 60:
                    arr = arr[-60:]
                else:
                    arr = np.pad(arr, ((60 - arr.shape[0], 0), (0, 0)), mode="edge")
            
            x = np.expand_dims(arr, axis=0)
            
            with tf.device(self.device):
                prob_t = model(x, training=False)
                
            prob = float(prob_t.numpy().squeeze())
            confidence = abs(prob - 0.5) * 2.0
            return (
                round(prob, 4),
                prob >= th_n,
                round(confidence, 4),
            )

        # ------ Fallback: heuristic spike detector ------
        arr = np.array(hxr_features, dtype=np.float32)
        counts = arr[:, 0] if arr.ndim == 2 else arr
        mean_val = float(np.mean(counts))
        std_val = float(np.std(counts)) + 1e-8
        max_val = float(np.max(counts))

        spike_score = (max_val - mean_val) / std_val
        prob = float(np.clip(1.0 / (1.0 + np.exp(-0.5 * (spike_score - 3.0))), 0, 1))
        confidence = abs(prob - 0.5) * 2.0
        return (
            round(prob, 4),
            prob >= th_n,
            round(confidence, 4),
        )

    # ------------------------------------------------------------------
    # 3. Forecasting
    # ------------------------------------------------------------------

    def forecast(
        self,
        sxr_features: list[list[float]] | np.ndarray,
    ) -> tuple[str, dict[str, float], float, float]:
        """Forecast flare class and time-to-peak from SXR + Nowcaster features.

        Parameters
        ----------
        sxr_features : array-like, shape ``[120, 5]``
            Five-channel feature matrix: counts_clean, rolling_mean,
            rolling_std, label_nowcast, nowcast_proba.
        """
        model = self._models.get("forecast_bilstm")
        th_f = self.thresholds.get("forecast_threshold", 0.49)

        if model is not None:
            arr = np.array(sxr_features, dtype=np.float32)
            if arr.shape != (120, 5):
                if arr.shape[0] > 120:
                    arr = arr[-120:]
                else:
                    arr = np.pad(arr, ((120 - arr.shape[0], 0), (0, 0)), mode="edge")
            
            x = np.expand_dims(arr, axis=0)
            
            with tf.device(self.device):
                prob_t = model(x, training=False)
                
            prob = float(prob_t.numpy().squeeze())
            confidence = abs(prob - 0.5) * 2.0
            
            # Map binary forecasting probability to GOES flare class
            counts_clean = arr[-1, 0]
            if prob < th_f:
                predicted_class = "B"
                class_probs = {"B": round(1.0 - prob, 4), "C": round(prob * 0.7, 4), "M": round(prob * 0.2, 4), "X": round(prob * 0.1, 4)}
            else:
                if counts_clean > 40.0:
                    predicted_class = "X"
                    class_probs = {"B": round(1.0 - prob, 4), "C": round((prob * 0.1), 4), "M": round((prob * 0.2), 4), "X": round((prob * 0.7), 4)}
                elif counts_clean > 25.0:
                    predicted_class = "M"
                    class_probs = {"B": round(1.0 - prob, 4), "C": round((prob * 0.2), 4), "M": round((prob * 0.7), 4), "X": round((prob * 0.1), 4)}
                else:
                    predicted_class = "C"
                    class_probs = {"B": round(1.0 - prob, 4), "C": round((prob * 0.7), 4), "M": round((prob * 0.2), 4), "X": round((prob * 0.1), 4)}
            
            # Lead time is 15 minutes (0.25 hours)
            time_hours = max(0.05, 0.25 - (float(counts_clean) / 200.0))
            return predicted_class, class_probs, round(time_hours, 2), round(confidence, 4)

        # ------ Fallback: heuristic based on SXR mean level ------
        arr = np.array(sxr_features, dtype=np.float32)
        counts = arr[:, 0] if arr.ndim == 2 else arr
        mean_level = float(np.mean(np.abs(counts)))

        if mean_level < 1e-7:
            predicted_class = "B"
            class_probs = {"B": 0.85, "C": 0.10, "M": 0.04, "X": 0.01}
        elif mean_level < 1e-5:
            predicted_class = "C"
            class_probs = {"B": 0.20, "C": 0.60, "M": 0.15, "X": 0.05}
        elif mean_level < 1e-3:
            predicted_class = "M"
            class_probs = {"B": 0.05, "C": 0.15, "M": 0.65, "X": 0.15}
        else:
            predicted_class = "X"
            class_probs = {"B": 0.01, "C": 0.04, "M": 0.15, "X": 0.80}

        confidence = float(class_probs[predicted_class])
        time_hours = max(0.1, round(float(np.random.exponential(0.25)), 2))
        return predicted_class, class_probs, time_hours, round(confidence, 4)
