"""
Verification script for 1-by-1 live input and live log download endpoints.
Submits sequential live points, verifies predictions, and checks logs.
"""

from __future__ import annotations
import os
import sys
import time
import subprocess
import requests
import json
import pandas as pd
import io

def test_live_processing():
    print("=" * 60)
    print("TESTING 1-BY-1 LIVE POINT PROCESSING & DOWNLOADS")
    print("=" * 60)
    
    # 1. Start FastAPI server
    server_process = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", "8000"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )
    
    # Poll until server is ready
    ready = False
    for _ in range(20):
        try:
            r = requests.get("http://127.0.0.1:8000/health", timeout=1)
            if r.status_code == 200:
                ready = True
                break
        except Exception:
            pass
        time.sleep(1.0)
        
    if not ready:
        print("Error: Server failed to start.")
        server_process.terminate()
        return
        
    try:
        # 2. Submit 3 points sequentially
        points = [
            {"sxr_raw": 5.5, "hxr_raw": 2.2},
            {"sxr_raw": 12.4, "hxr_raw": 3.8},
            {"sxr_raw": 25.1, "hxr_raw": 180.5} # Spike point
        ]
        
        for i, pt in enumerate(points):
            print(f"\nSubmitting Point {i+1}: {pt}")
            resp = requests.post("http://127.0.0.1:8000/predict/live", json=pt, timeout=5)
            if resp.status_code == 200:
                res = resp.json()
                print(f"Point {i+1} Response: {res}")
                print(f"  Tick: {res.get('tickCount')}")
                print(f"  Cleaned SXR/HXR: {res.get('sxr_clean')} / {res.get('hxr_clean')}")
                print(f"  Nowcast Prob: {res.get('nowcastProb')}")
                print(f"  Forecast Class: {res.get('forecastClass')}")
                print(f"  Alert Level: {res.get('alertLevel')}")
            else:
                print(f"Point {i+1} failed: {resp.status_code} - {resp.text}")
                
        # 3. Test Live Downloads
        print("\nTesting SoLEXS live download...")
        r_solexs = requests.get("http://127.0.0.1:8000/download/live/solexs", timeout=5)
        if r_solexs.status_code == 200:
            print("Download SoLEXS Live CSV: PASS")
            df_s = pd.read_csv(io.StringIO(r_solexs.text))
            print(f"  Columns: {df_s.columns.tolist()}")
            print(f"  Rows: {len(df_s)}")
        else:
            print(f"Download SoLEXS Live CSV: FAIL ({r_solexs.status_code})")
            
        print("\nTesting HEL1OS live download...")
        r_helios = requests.get("http://127.0.0.1:8000/download/live/helios", timeout=5)
        if r_helios.status_code == 200:
            print("Download HEL1OS Live CSV: PASS")
            df_h = pd.read_csv(io.StringIO(r_helios.text))
            print(f"  Columns: {df_h.columns.tolist()}")
            print(f"  Rows: {len(df_h)}")
        else:
            print(f"Download HEL1OS Live CSV: FAIL ({r_helios.status_code})")
            
    except Exception as e:
        print(f"Test Error: {e}")
    finally:
        server_process.terminate()
        try:
            server_process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server_process.kill()

if __name__ == '__main__':
    test_live_processing()
