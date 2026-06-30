"""
Unified evaluation script for testing the 2 trained TensorFlow models in the pipeline:
1D-CNN Nowcaster and BiLSTM Forecaster.
Calculates TSS, HSS, Recall, Specificity, and Precision using optimized thresholds.
"""

from __future__ import annotations
import os
import sys
import json
import numpy as np
from sklearn.model_selection import train_test_split
import tensorflow as tf

# Allow imports from project root
_PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

from backend.ml.data_loader import load_and_preprocess_solexs, engineer_labels, generate_nowcast_windows, generate_forecast_windows
from backend.ml.models import BinaryFocalLoss
from backend.ml.train_nowcaster import calculate_metrics

def evaluate_models(csv_path: str = "SoLEXS_combined_cleaned.csv", save_dir: str = "backend/saved_models") -> None:
    # 1. Load SXR and label df
    print("Loading data for evaluation...")
    df = load_and_preprocess_solexs(csv_path)
    df = engineer_labels(df)
    
    threshold_path = os.path.join(save_dir, "thresholds.json")
    thresholds = {"nowcast_threshold": 0.5, "forecast_threshold": 0.5}
    if os.path.exists(threshold_path):
        try:
            with open(threshold_path, "r") as f:
                thresholds = json.load(f)
            print(f"Loaded optimized thresholds from config: {thresholds}")
        except Exception:
            pass
            
    # =======================================================================
    # 1. Evaluate Nowcaster
    # =======================================================================
    nowcast_model_path = os.path.join(save_dir, "nowcast_1dcnn.h5")
    if os.path.exists(nowcast_model_path):
        print("\n" + "=" * 50)
        print("Evaluating 1D-CNN Nowcaster...")
        print("=" * 50)
        
        custom_objects = {"BinaryFocalLoss": BinaryFocalLoss}
        nowcaster = tf.keras.models.load_model(nowcast_model_path, custom_objects=custom_objects)
        
        X_nowcast, y_nowcast = generate_nowcast_windows(df, window_size=60, step_size=5)
        # Squeeze split using identical seed (42) to match training partition
        _, X_test_n, _, y_test_n = train_test_split(
            X_nowcast, y_nowcast, test_size=0.2, random_state=42, stratify=y_nowcast
        )
        
        test_probs_n = nowcaster.predict(X_test_n, batch_size=256, verbose=0).squeeze()
        th_n = thresholds.get("nowcast_threshold", 0.5)
        metrics_n = calculate_metrics(y_test_n, test_probs_n, threshold=th_n)
        
        print(f"Nowcasting Decision Threshold: {th_n:.2f}")
        for k, v in metrics_n.items():
            if isinstance(v, float):
                print(f"{k}: {v:.4f}")
            else:
                print(f"{k}: {v}")
                
        # Populate nowcast probability stream in df for forecast evaluation
        print("\nPopulating Nowcast probabilities column for forecast evaluation...")
        from sklearn.preprocessing import StandardScaler
        scaler = StandardScaler()
        scaled_feats = scaler.fit_transform(df[['counts_clean', 'rolling_mean', 'rolling_std', 'zscore']].values)
        
        win_starts = np.arange(len(df) - 59)
        win_data = np.empty((len(win_starts), 60, 4), dtype=np.float32)
        for i, s in enumerate(win_starts):
            win_data[i] = scaled_feats[s : s + 60]
            
        probs_seq = nowcaster.predict(win_data, batch_size=4096, verbose=0).squeeze()
        nowcast_probs = np.zeros(len(df), dtype=np.float32)
        nowcast_probs[59:] = probs_seq
        df['nowcast_proba'] = nowcast_probs
    else:
        print(f"Skipping Nowcaster evaluation: checkpoint not found at {nowcast_model_path}")
        df['nowcast_proba'] = df['label_nowcast'].astype(float)
        
    # =======================================================================
    # 2. Evaluate Forecaster
    # =======================================================================
    forecast_model_path = os.path.join(save_dir, "forecast_bilstm.h5")
    if os.path.exists(forecast_model_path):
        print("\n" + "=" * 50)
        print("Evaluating BiLSTM Forecaster (Sensor Fusion)...")
        print("=" * 50)
        
        custom_objects = {"BinaryFocalLoss": BinaryFocalLoss}
        forecaster = tf.keras.models.load_model(forecast_model_path, custom_objects=custom_objects)
        
        X_forecast, y_forecast = generate_forecast_windows(df, nowcast_prob_col='nowcast_proba', window_size_mins=120, step_size_mins=5)
        # Squeeze split using identical seed (42) to match training partition
        _, X_test_f, _, y_test_f = train_test_split(
            X_forecast, y_forecast, test_size=0.2, random_state=42, stratify=y_forecast
        )
        
        test_probs_f = forecaster.predict(X_test_f, batch_size=256, verbose=0).squeeze()
        th_f = thresholds.get("forecast_threshold", 0.5)
        metrics_f = calculate_metrics(y_test_f, test_probs_f, threshold=th_f)
        
        print(f"Forecasting (15-min lead) Decision Threshold: {th_f:.2f}")
        for k, v in metrics_f.items():
            if isinstance(v, float):
                print(f"{k}: {v:.4f}")
            else:
                print(f"{k}: {v}")
    else:
        print(f"Skipping Forecaster evaluation: checkpoint not found at {forecast_model_path}")

if __name__ == '__main__':
    evaluate_models()
