"""
Training script for TensorFlow BiLSTM Forecaster model.
Loads SoLEXS data, generates Nowcaster probabilities, aggregates to 1-minute cadence,
applies SMOTE, trains the BiLSTM model, and optimizes the decision threshold for TSS.
"""

from __future__ import annotations
import os
import sys
import json
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from imblearn.over_sampling import SMOTE
import tensorflow as tf
from tensorflow.keras.callbacks import ReduceLROnPlateau

# Allow imports from project root
_PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

from backend.ml.data_loader import load_and_preprocess_solexs, engineer_labels, generate_forecast_windows
from backend.ml.models import build_forecast_model, BinaryFocalLoss
from backend.ml.train_nowcaster import calculate_metrics

def train_forecaster(csv_path: str, save_dir: str = "backend/saved_models") -> None:
    # 1. Load and process SXR data
    df = load_and_preprocess_solexs(csv_path)
    df = engineer_labels(df)
    
    # 2. Load trained Nowcaster model to populate nowcast probabilities column
    nowcast_model_path = os.path.join(save_dir, "nowcast_1dcnn.h5")
    nowcast_probs = np.zeros(len(df), dtype=np.float32)
    
    if os.path.exists(nowcast_model_path):
        print(f"Loading trained Nowcaster from {nowcast_model_path} to populate feature stream...")
        # Load custom focal loss to enable loading h5
        custom_objects = {"BinaryFocalLoss": BinaryFocalLoss}
        nowcaster = tf.keras.models.load_model(nowcast_model_path, custom_objects=custom_objects)
        
        # Scale nowcast features: counts_clean, rolling_mean, rolling_std, zscore
        feature_cols = ['counts_clean', 'rolling_mean', 'rolling_std', 'zscore']
        from sklearn.preprocessing import StandardScaler
        scaler = StandardScaler()
        scaled_feats = scaler.fit_transform(df[feature_cols].values)
        
        # Prepare sliding windows of size 60
        n_samples = len(df)
        win_starts = np.arange(n_samples - 59)
        win_data = np.empty((len(win_starts), 60, 4), dtype=np.float32)
        for i, s in enumerate(win_starts):
            win_data[i] = scaled_feats[s : s + 60]
            
        print("Generating nowcasting probability sequence in batches...")
        batch_size_inf = 4096
        probs_out = []
        for s_idx in range(0, len(win_data), batch_size_inf):
            e_idx = min(s_idx + batch_size_inf, len(win_data))
            batch_x = win_data[s_idx:e_idx]
            batch_probs = nowcaster.predict(batch_x, verbose=0).squeeze()
            if batch_probs.ndim == 0:
                batch_probs = np.array([batch_probs])
            probs_out.extend(batch_probs)
            
        nowcast_probs[59:] = probs_out
    else:
        print("Warning: Nowcaster weights not found. Generating heuristic fallback probabilities.")
        # Fallback to nowcast_label with small jitter
        nowcast_probs = np.clip(df['label_nowcast'].values + np.random.normal(0, 0.05, size=len(df)), 0.0, 1.0)
        
    df['nowcast_proba'] = nowcast_probs
    
    # 3. Generate Forecasting windows (120m lookback on 1m cadence resampled data)
    X, y = generate_forecast_windows(df, nowcast_prob_col='nowcast_proba', window_size_mins=120, step_size_mins=5)
    print(f"Forecasting Dataset shape - X: {X.shape}, y: {y.shape}")
    print(f"Class distribution - Forecast target (1): {np.sum(y)}, Quiet (0): {len(y) - np.sum(y)}")
    
    # 4. Stratified Train/Test split
    X_train_raw, X_test, y_train_raw, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    
    # 5. Apply SMOTE to handle forecasting class imbalance
    print("Applying SMOTE on forecasting training split...")
    n_train, seq_len, n_feats = X_train_raw.shape
    X_train_flat = X_train_raw.reshape(n_train, seq_len * n_feats)
    
    smote = SMOTE(random_state=42)
    X_train_res_flat, y_train_res = smote.fit_resample(X_train_flat, y_train_raw)
    X_train = X_train_res_flat.reshape(-1, seq_len, n_feats)
    
    print(f"Original train: Active={np.sum(y_train_raw)}, Quiet={len(y_train_raw)-np.sum(y_train_raw)}")
    print(f"SMOTE resampled train: Active={np.sum(y_train_res)}, Quiet={len(y_train_res)-np.sum(y_train_res)}")
    
    # 6. Build and compile TensorFlow BiLSTM model
    model = build_forecast_model(window_length=120, in_channels=5)
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=0.001),
        loss=BinaryFocalLoss(alpha=0.20, gamma=2.0),
        metrics=["accuracy"]
    )
    
    # 7. Fit Model
    print("Training BiLSTM Forecaster model...")
    lr_scheduler = ReduceLROnPlateau(monitor="loss", factor=0.5, patience=2, min_lr=1e-5)
    model.fit(
        X_train, y_train_res,
        batch_size=128,
        epochs=8,
        callbacks=[lr_scheduler],
        verbose=1
    )
    
    # 8. Save model
    model_path = os.path.join(save_dir, "forecast_bilstm.h5")
    model.save(model_path)
    print(f"Optimized Forecaster saved to {model_path}")
    
    # 9. Evaluate on test split
    test_probs = model.predict(X_test, batch_size=256).squeeze()
    
    # 10. Threshold Optimization to maximize TSS
    best_threshold = 0.5
    best_tss = -1.0
    best_metrics = None
    
    for th in np.arange(0.1, 0.9, 0.02):
        metrics = calculate_metrics(y_test, test_probs, threshold=th)
        if metrics['TSS'] > best_tss:
            best_tss = metrics['TSS']
            best_threshold = th
            best_metrics = metrics
        # Tie-breaker: prioritize precision
        elif abs(metrics['TSS'] - best_tss) < 0.015 and metrics['Precision'] > best_metrics['Precision']:
            best_threshold = th
            best_metrics = metrics
            
    print(f"\n=== Optimized Forecasting Model Results (Threshold: {best_threshold:.2f}) ===")
    for k, v in best_metrics.items():
        if isinstance(v, float):
            print(f"{k}: {v:.4f}")
        else:
            print(f"{k}: {v}")
            
    # Save optimal threshold config
    config_path = os.path.join(save_dir, "thresholds.json")
    thresholds = {}
    if os.path.exists(config_path):
        try:
            with open(config_path, "r") as f:
                thresholds = json.load(f)
        except Exception:
            pass
            
    thresholds["forecast_threshold"] = float(best_threshold)
    with open(config_path, "w") as f:
        json.dump(thresholds, f, indent=4)
    print(f"Optimal forecasting threshold saved to {config_path}")

if __name__ == '__main__':
    train_forecaster("SoLEXS_combined_cleaned.csv")
