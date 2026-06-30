"""
Data loader and label engineering utilities for SolarWatch pipeline (TensorFlow version).
Uses SoLEXS_combined_cleaned.csv as the primary soft X-ray data source.
"""

from __future__ import annotations
import pandas as pd
import numpy as np
from sklearn.preprocessing import StandardScaler

def load_and_preprocess_solexs(file_path: str) -> pd.DataFrame:
    """
    Loads SoLEXS dataset, resamples to a strict 1-second cadence,
    fills missing values, and computes rolling statistics and z-scores.
    """
    print(f"Loading SoLEXS SXR data from {file_path}...")
    df = pd.read_csv(file_path)
    df['datetime'] = pd.to_datetime(df['datetime_utc']).dt.round('1s')
    
    # Drop duplicates and sort index
    df = df.drop_duplicates(subset=['datetime'])
    df = df.set_index('datetime').sort_index()
    
    # Resample to full 1-second cadence grid to ensure continuity
    full_range = pd.date_range(start=df.index.min(), end=df.index.max(), freq='1s')
    df = df.reindex(full_range)
    df.index.name = 'datetime'
    
    # Interpolate missing counts
    df['counts_clean'] = df['counts_clean'].interpolate(method='linear').fillna(0.0)
    
    # Re-calculate clean rolling mean/std and zscore to avoid any discrepancies
    df['rolling_mean'] = df['counts_clean'].rolling(window=60, min_periods=1).mean()
    df['rolling_std'] = df['counts_clean'].rolling(window=60, min_periods=1).std().fillna(1e-5)
    df['zscore'] = (df['counts_clean'] - df['rolling_mean']) / (df['rolling_std'] + 1e-8)
    
    return df

def engineer_labels(df: pd.DataFrame) -> pd.DataFrame:
    """
    Applies label engineering based on SXR thresholding:
    - True Flare Peak: zscore > 3.0 AND counts_clean > 22.0
    - Nowcast Target: 1 if a true flare peak starts in the next 180 seconds
    - Forecast Target: 1 if a true flare peak starts in the next 15 minutes
    """
    # 1. Identify True Flare Peaks
    df['is_true_flare'] = ((df['zscore'] > 3.0) & (df['counts_clean'] > 22.0)).astype(int)
    
    # 2. Nowcast target: 180s precursor window before each true flare peak
    # If any true flare peak is starting in the next 180 seconds, set target = 1
    future_flare = df['is_true_flare'].shift(-180).rolling(window=180, min_periods=1).max().fillna(0.0)
    df['label_nowcast'] = (future_flare > 0).astype(int)
    
    return df

def generate_nowcast_windows(df: pd.DataFrame, window_size: int = 60, step_size: int = 5) -> tuple[np.ndarray, np.ndarray]:
    """
    Generates nowcasting feature windows and labels.
    Returns:
      X: shape (num_samples, window_size, 4) -> features: [counts_clean, rolling_mean, rolling_std, zscore]
      y: shape (num_samples,) -> label_nowcast at the end of the window
    """
    feature_cols = ['counts_clean', 'rolling_mean', 'rolling_std', 'zscore']
    
    # Fit scaler on SXR features
    scaler = StandardScaler()
    scaled_feats = scaler.fit_transform(df[feature_cols].values)
    
    labels = df['label_nowcast'].values
    
    X_list, y_list = [], []
    n_samples = len(df)
    for start in range(0, n_samples - window_size, step_size):
        end = start + window_size
        X_list.append(scaled_feats[start:end])
        y_list.append(labels[end - 1])
        
    return np.array(X_list, dtype=np.float32), np.array(y_list, dtype=np.int32)

def generate_forecast_windows(
    df: pd.DataFrame, 
    nowcast_prob_col: str = 'nowcast_proba',
    window_size_mins: int = 120, 
    step_size_mins: int = 5
) -> tuple[np.ndarray, np.ndarray]:
    """
    Resamples the SXR data to a 1-minute cadence, computes 5 features:
    [counts_clean, rolling_mean, rolling_std, label_nowcast, nowcast_proba]
    And returns forecasting feature windows and labels:
      X: shape (num_samples, 120, 5)
      y: shape (num_samples,) -> 1 if a true flare peak occurs in the next 15 minutes (lead time)
    """
    # 1. Resample to 1-minute averages
    df_1m = df.resample('1min').mean(numeric_only=True)
    
    # Use max aggregation for the binary target to ensure flare events are not lost in the mean
    df_1m['is_true_flare'] = df['is_true_flare'].resample('1min').max().fillna(0.0).astype(int)
    df_1m['label_nowcast'] = df['label_nowcast'].resample('1min').max().fillna(0.0).astype(int)
    
    # Ensure nowcast_prob_col exists
    if nowcast_prob_col not in df_1m.columns:
        # Fallback to label_nowcast if probabilities are not yet attached
        df_1m[nowcast_prob_col] = df_1m['label_nowcast'].astype(float)
    else:
        df_1m[nowcast_prob_col] = df[nowcast_prob_col].resample('1min').mean().fillna(0.0)
        
    # 2. Forecast Target: True flare peak in the next 15 minutes (15 steps at 1m cadence)
    future_flare = df_1m['is_true_flare'].shift(-15).rolling(window=15, min_periods=1).max().fillna(0.0)
    df_1m['label_forecast'] = (future_flare > 0).astype(int)
    
    # 3. Features scaling
    feature_cols = ['counts_clean', 'rolling_mean', 'rolling_std', 'label_nowcast', nowcast_prob_col]
    scaler = StandardScaler()
    scaled_feats = scaler.fit_transform(df_1m[feature_cols].values)
    
    labels = df_1m['label_forecast'].values
    
    X_list, y_list = [], []
    n_samples = len(df_1m)
    for start in range(0, n_samples - window_size_mins, step_size_mins):
        end = start + window_size_mins
        X_list.append(scaled_feats[start:end])
        y_list.append(labels[end - 1])
        
    return np.array(X_list, dtype=np.float32), np.array(y_list, dtype=np.int32)
