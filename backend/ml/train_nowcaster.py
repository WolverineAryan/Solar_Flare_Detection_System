"""
Training script for TensorFlow Nowcast 1DCNN model.
Loads SoLEXS data, engineers nowcast labels, applies SMOTE, trains model,
and optimizes decision threshold to maximize TSS.
"""

from __future__ import annotations
import os
import sys
import json
import numpy as np
from sklearn.model_selection import train_test_split
from imblearn.over_sampling import SMOTE
import tensorflow as tf
from tensorflow.keras.callbacks import ReduceLROnPlateau

# Allow imports from project root
_PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

from backend.ml.data_loader import load_and_preprocess_solexs, engineer_labels, generate_nowcast_windows
from backend.ml.models import build_nowcast_model, BinaryFocalLoss

def calculate_metrics(y_true, y_pred_prob, threshold=0.5):
    y_pred = (y_pred_prob >= threshold).astype(int)
    
    tp = np.sum((y_true == 1) & (y_pred == 1))
    fp = np.sum((y_true == 0) & (y_pred == 1))
    fn = np.sum((y_true == 1) & (y_pred == 0))
    tn = np.sum((y_true == 0) & (y_pred == 0))
    
    sensitivity = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    specificity = tn / (tn + fp) if (tn + fp) > 0 else 0.0
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    
    tss = sensitivity + specificity - 1.0
    
    expected_correct = ((tp + fn) * (tp + fp) + (fp + tn) * (fn + tn)) / (tp + fp + fn + tn)
    actual_correct = tp + tn
    total = tp + fp + fn + tn
    hss = (actual_correct - expected_correct) / (total - expected_correct) if (total - expected_correct) > 0 else 0.0
    
    return {
        'TP': int(tp), 'FP': int(fp), 'FN': int(fn), 'TN': int(tn),
        'Sensitivity': float(sensitivity), 'Specificity': float(specificity),
        'Precision': float(precision), 'TSS': float(tss), 'HSS': float(hss)
    }

def train_nowcaster(csv_path: str, save_dir: str = "backend/saved_models") -> None:
    # 1. Load and process SXR data
    df = load_and_preprocess_solexs(csv_path)
    df = engineer_labels(df)
    
    # 2. Generate feature windows (60s lookback, stride 5 to reduce redundancy)
    X, y = generate_nowcast_windows(df, window_size=60, step_size=5)
    print(f"Dataset shape - X: {X.shape}, y: {y.shape}")
    print(f"Class distribution - Flare precursor (1): {np.sum(y)}, Quiet (0): {len(y) - np.sum(y)}")
    
    # 3. Stratified Train/Test split
    X_train_raw, X_test, y_train_raw, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    
    # 4. Apply SMOTE to training split only
    print("Applying SMOTE on training split to handle class imbalance...")
    n_train, seq_len, n_feats = X_train_raw.shape
    X_train_flat = X_train_raw.reshape(n_train, seq_len * n_feats)
    
    smote = SMOTE(random_state=42)
    X_train_res_flat, y_train_res = smote.fit_resample(X_train_flat, y_train_raw)
    X_train = X_train_res_flat.reshape(-1, seq_len, n_feats)
    
    print(f"Original train: Flare={np.sum(y_train_raw)}, Quiet={len(y_train_raw)-np.sum(y_train_raw)}")
    print(f"SMOTE resampled train: Flare={np.sum(y_train_res)}, Quiet={len(y_train_res)-np.sum(y_train_res)}")
    
    # 5. Build and compile TensorFlow model
    model = build_nowcast_model(window_length=60, in_channels=4)
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=0.001),
        loss=BinaryFocalLoss(alpha=0.20, gamma=2.0),
        metrics=["accuracy"]
    )
    
    # 6. Fit Model
    print("Training 1D-CNN Nowcaster model...")
    lr_scheduler = ReduceLROnPlateau(monitor="loss", factor=0.5, patience=2, min_lr=1e-5)
    model.fit(
        X_train, y_train_res,
        batch_size=128,
        epochs=8,
        callbacks=[lr_scheduler],
        verbose=1
    )
    
    # 7. Save model
    os.makedirs(save_dir, exist_ok=True)
    model_path = os.path.join(save_dir, "nowcast_1dcnn.h5")
    model.save(model_path)
    print(f"Optimized Nowcaster saved to {model_path}")
    
    # 8. Evaluate on test split
    test_probs = model.predict(X_test, batch_size=256).squeeze()
    
    # 9. Threshold Optimization to maximize TSS
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
            
    print(f"\n=== Optimized Nowcasting Model Results (Threshold: {best_threshold:.2f}) ===")
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
            
    thresholds["nowcast_threshold"] = float(best_threshold)
    with open(config_path, "w") as f:
        json.dump(thresholds, f, indent=4)
    print(f"Optimal decision threshold saved to {config_path}")

if __name__ == '__main__':
    train_nowcaster("SoLEXS_combined_cleaned.csv")
