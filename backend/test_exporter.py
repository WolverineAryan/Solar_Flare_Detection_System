"""
Automated test script to verify the new /preprocess-and-clean and /download endpoints.
Creates a small test telemetry CSV, uploads it to the API, and verifies downloads.
"""

from __future__ import annotations
import os
import sys
import time
import subprocess
import requests
import json
import pandas as pd

def test_exporter():
    print("=" * 60)
    print("TESTING ADITYA-L1 DATA EXPORTER ENDPOINTS")
    print("=" * 60)
    
    # 1. Create a dummy SXR CSV file for upload (100 rows)
    test_csv_path = "backend/test_upload.csv"
    print(f"Creating dummy telemetry CSV at {test_csv_path}...")
    
    dates = pd.date_range(start="2026-06-30 00:00:00", periods=200, freq="1s")
    counts = np.random.uniform(5.0, 15.0, size=200)
    # Inject a flare event near row 100
    counts[90:110] = np.random.uniform(25.0, 45.0, size=20)
    
    df = pd.DataFrame({
        "datetime_utc": dates.strftime("%Y-%m-%d %H:%M:%S"),
        "counts": counts
    })
    df.to_csv(test_csv_path, index=False)
    
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
        # 3. Call POST /preprocess-and-clean
        print("Uploading dummy CSV to /preprocess-and-clean...")
        with open(test_csv_path, "rb") as f:
            resp = requests.post("http://127.0.0.1:8000/preprocess-and-clean", files={"file": f}, timeout=10)
            
        if resp.status_code == 200:
            res_data = resp.json()
            print(f"Upload Response: {res_data}")
            if res_data.get("status") == "success":
                print("Preprocessing Succeeded!")
                print(f"Total Rows (1s Nowcast): {res_data.get('total_rows_1s')}")
                print(f"Total Rows (1m Forecast): {res_data.get('total_rows_1m')}")
                print(f"Detected Flare Peaks: {res_data.get('detected_flares')}")
            else:
                print("Preprocessing Failed in Response:", res_data)
        else:
            print(f"HTTP Upload Error: {resp.status_code} - {resp.text}")
            
        # 4. Test Downloads
        print("\nTesting /download/nowcast endpoint...")
        r_nowcast = requests.get("http://127.0.0.1:8000/download/nowcast", timeout=5)
        if r_nowcast.status_code == 200:
            print("Download Nowcast CSV: PASS")
            # Print columns of the downloaded file
            df_n = pd.read_csv(io.StringIO(r_nowcast.text))
            print(f"Downloaded Nowcast Columns: {df_n.columns.tolist()}")
            print(f"Downloaded Nowcast Shape: {df_n.shape}")
        else:
            print(f"Download Nowcast CSV: FAIL ({r_nowcast.status_code})")
            
        print("\nTesting /download/forecast endpoint...")
        r_forecast = requests.get("http://127.0.0.1:8000/download/forecast", timeout=5)
        if r_forecast.status_code == 200:
            print("Download Forecast CSV: PASS")
            df_f = pd.read_csv(io.StringIO(r_forecast.text))
            print(f"Downloaded Forecast Columns: {df_f.columns.tolist()}")
            print(f"Downloaded Forecast Shape: {df_f.shape}")
        else:
            print(f"Download Forecast CSV: FAIL ({r_forecast.status_code})")
            
    except Exception as e:
        print(f"Test Error: {e}")
    finally:
        server_process.terminate()
        try:
            server_process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server_process.kill()
            
        # Cleanup test files
        if os.path.exists(test_csv_path):
            os.remove(test_csv_path)

if __name__ == '__main__':
    # We need numpy and io inside the test script
    import numpy as np
    import io
    test_exporter()
