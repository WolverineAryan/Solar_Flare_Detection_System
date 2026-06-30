#!/usr/bin/env python
"""
Aditya-L1 Live Telemetry Stream Simulator.
Reads historical satellite data from cleaned CSV files and streams them 
point-by-point to the backend API at a 1Hz cadence to simulate a live satellite pass.
"""

from __future__ import annotations
import os
import sys
import time
import argparse
import pandas as pd
import requests

def stream_telemetry(csv_path: str, speed_multiplier: float):
    print("=" * 70)
    print("        ADITYA-L1 TELEMETRY LIVE FEED SIMULATOR (1Hz)")
    print("=" * 70)
    
    if not os.path.exists(csv_path):
        print(f"Error: Telemetry file not found at: {csv_path}")
        return
        
    print(f"Loading telemetry dataset from: {csv_path}...")
    df = pd.read_csv(csv_path)
    
    # Identify count columns
    # Fallback to counts if counts_clean is not present
    sxr_col = "counts_clean" if "counts_clean" in df.columns else ("counts" if "counts" in df.columns else None)
    hxr_col = "hxr" if "hxr" in df.columns else ("counts" if "counts" in df.columns else None)
    
    if sxr_col is None:
        print("Error: Could not identify SXR counts column in CSV.")
        return
        
    total_points = len(df)
    print(f"Loaded {total_points} rows. Starting live transmission stream...")
    print(f"API Target: http://127.0.0.1:8000/predict/live")
    print(f"Speed Multiplier: {speed_multiplier}x (Delay: {1.0 / speed_multiplier:.2f}s per tick)")
    print("-" * 70)
    print(f"{'Tick':<6} | {'SXR Raw':<8} | {'HXR Raw':<8} | {'Nowcast Prob':<14} | {'Forecast Class':<14} | {'Alert Level':<12}")
    print("-" * 70)
    
    delay = 1.0 / speed_multiplier
    
    try:
        for idx, row in df.iterrows():
            sxr_val = float(row[sxr_col])
            # If HXR column is missing, generate slight baseline noise
            hxr_val = float(row[hxr_col]) if (hxr_col in df.columns and hxr_col != sxr_col) else (2.0 + (sxr_val * 0.1))
            
            payload = {
                "sxr_raw": sxr_val,
                "hxr_raw": hxr_val
            }
            
            try:
                resp = requests.post("http://127.0.0.1:8000/predict/live", json=payload, timeout=2)
                if resp.status_code == 200:
                    res = resp.json()
                    tick = res.get("tickCount", idx + 1)
                    nowcast = f"{(res.get('nowcastProb', 0.0) * 100):.1f}%"
                    f_class = res.get("forecastClass", "B2.1")
                    alert = res.get("alertLevel", "normal").upper()
                    
                    # Highlight alerts
                    if alert == "CRITICAL":
                        alert_str = f"\033[91m{alert:<12}\033[0m"
                    elif alert == "ELEVATED":
                        alert_str = f"\033[93m{alert:<12}\033[0m"
                    else:
                        alert_str = f"\033[92m{alert:<12}\033[0m"
                        
                    print(f"#{tick:<5} | {sxr_val:<8.2f} | {hxr_val:<8.2f} | {nowcast:<14} | {f_class:<14} | {alert_str}")
                else:
                    print(f"#{idx+1:<5} | Transmission Error: HTTP {resp.status_code}")
            except requests.exceptions.RequestException as e:
                print(f"#{idx+1:<5} | Connection Error: {e}")
                
            time.sleep(delay)
            
    except KeyboardInterrupt:
        print("\nTransmission halted by operator. Exiting.")
    print("=" * 70)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Stream satellite telemetry to the Solar Flare API.")
    parser.add_argument(
        "--file", 
        type=str, 
        default="SoLEXS_combined_cleaned.csv", 
        help="Path to the cleaned telemetry CSV (default: SoLEXS_combined_cleaned.csv)"
    )
    parser.add_argument(
        "--speed", 
        type=float, 
        default=1.0, 
        help="Streaming speed multiplier (default: 1.0 for 1Hz real-time)"
    )
    args = parser.parse_args()
    stream_telemetry(args.file, args.speed)
