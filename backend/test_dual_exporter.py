"""
Automated test script to verify dual-file uploads (SoLEXS & HEL1OS)
and dataset fusion logic in /preprocess-and-clean.
"""

from __future__ import annotations
import os
import sys
import time
import subprocess
import requests
import json
import pandas as pd
import numpy as np
import io

def test_dual_exporter():
    print("=" * 60)
    print("TESTING DUAL-FILE UPLOAD AND DATASET FUSION")
    print("=" * 60)
    
    # 1. Create dummy files
    solexs_path = "backend/test_solexs.csv"
    helios_path = "backend/test_helios.csv"
    
    print("Creating dummy SoLEXS and HEL1OS CSV files...")
    dates = pd.date_range(start="2026-06-30 00:00:00", periods=100, freq="1s")
    
    df_s = pd.DataFrame({
        "datetime_utc": dates.strftime("%Y-%m-%d %H:%M:%S"),
        "counts": np.random.uniform(5.0, 10.0, size=100)
    })
    df_s.to_csv(solexs_path, index=False)
    
    df_h = pd.DataFrame({
        "datetime_utc": dates.strftime("%Y-%m-%d %H:%M:%S"),
        "counts": np.random.uniform(1.0, 4.0, size=100)
    })
    df_h.to_csv(helios_path, index=False)
    
    # 2. Start FastAPI server
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
        # 3. Call POST /preprocess-and-clean with both files
        print("Uploading both files to /preprocess-and-clean...")
        with open(solexs_path, "rb") as fs, open(helios_path, "rb") as fh:
            files = {
                "file_solexs": fs,
                "file_helios": fh
            }
            resp = requests.post("http://127.0.0.1:8000/preprocess-and-clean", files=files, timeout=10)
            
        if resp.status_code == 200:
            res = resp.json()
            print("Response:", res)
            if res.get("status") == "success":
                print("Dual-file Fusion & Preprocessing: PASS")
            else:
                print("Dual-file Fusion & Preprocessing: FAIL", res)
        else:
            print(f"HTTP Upload Error: {resp.status_code} - {resp.text}")
            
        # 4. Check Nowcast Download
        r_nowcast = requests.get("http://127.0.0.1:8000/download/nowcast", timeout=5)
        if r_nowcast.status_code == 200:
            df_n = pd.read_csv(io.StringIO(r_nowcast.text))
            print(f"Nowcast File Columns: {df_n.columns.tolist()}")
            if "hxr" in df_n.columns:
                print("  HEL1OS Hard X-Ray column successfully joined: YES")
            else:
                print("  HEL1OS Hard X-Ray column successfully joined: NO")
        else:
            print("Download Nowcast: FAIL")
            
    except Exception as e:
        print(f"Test Error: {e}")
    finally:
        try:
            server_process.terminate()
            stdout, stderr = server_process.communicate(timeout=5)
            if stdout:
                print("\n--- SERVER STDOUT LOGS ---")
                print(stdout)
            if stderr:
                print("\n--- SERVER STDERR LOGS ---")
                print(stderr)
                print("--------------------------")
        except Exception:
            server_process.kill()
            
        # Clean up files
        if os.path.exists(solexs_path):
            os.remove(solexs_path)
        if os.path.exists(helios_path):
            os.remove(helios_path)

if __name__ == '__main__':
    test_dual_exporter()
