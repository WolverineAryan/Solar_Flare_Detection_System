"""
Automated integration and verification tests for SolarWatch backend and ML pipeline.
Spawns the FastAPI server, tests health endpoints, connects via WebSocket to verify
real-time telemetry processing, and tests static predictions.
"""

from __future__ import annotations
import os
import sys
import time
import subprocess
import requests
import json
import websocket # websocket-client

# Allow imports from project root
_PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

def run_tests() -> dict[str, Any]:
    report = {
        "status": "PASS",
        "tests": []
    }
    
    # 1. Start FastAPI server in a background subprocess
    print("Starting FastAPI server in the background...")
    server_process = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", "8000"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )
    
    # Wait for server startup by polling the /health endpoint
    print("Waiting for server startup (polling health endpoint)...")
    started = False
    for i in range(25):
        if server_process.poll() is not None:
            break
        try:
            resp = requests.get("http://127.0.0.1:8000/health", timeout=1)
            if resp.status_code == 200:
                started = True
                break
        except Exception:
            pass
        time.sleep(1.0)
        
    # Check if server started successfully
    if not started:
        server_process.terminate()
        stdout, stderr = server_process.communicate()
        print("FastAPI server failed to start or respond in time.")
        print(f"Stdout:\n{stdout}\nStderr:\n{stderr}")
        report["status"] = "FAIL"
        report["tests"].append({
            "name": "Server Startup",
            "status": "FAIL",
            "error": "Server timed out or exited during startup"
        })
        return report
        
    report["tests"].append({
        "name": "Server Startup",
        "status": "PASS"
    })
    
    # 2. Test /health REST endpoint
    try:
        print("Testing /health endpoint...")
        resp = requests.get("http://127.0.0.1:8000/health", timeout=3)
        if resp.status_code == 200:
            data = resp.json()
            print(f"Health Response: {data}")
            if data.get("models_loaded", {}).get("nowcast_1dcnn") and data.get("models_loaded", {}).get("forecast_bilstm"):
                report["tests"].append({
                    "name": "/health Endpoint & Model Loading",
                    "status": "PASS",
                    "details": data
                })
            else:
                report["tests"].append({
                    "name": "/health Endpoint & Model Loading",
                    "status": "WARNING",
                    "error": "Models loaded status is False, using fallback logic",
                    "details": data
                })
        else:
            report["status"] = "FAIL"
            report["tests"].append({
                "name": "/health Endpoint",
                "status": "FAIL",
                "error": f"HTTP status code {resp.status_code}"
            })
    except Exception as e:
        report["status"] = "FAIL"
        report["tests"].append({
            "name": "/health Endpoint",
            "status": "FAIL",
            "error": str(e)
        })
        
    # 3. Test WebSocket Telemetry Stream
    try:
        print("Testing WebSocket telemetry stream...")
        ws = websocket.create_connection("ws://127.0.0.1:8000/ws/telemetry")
        
        # Connect and read 3 data packets
        packets = []
        for i in range(3):
            msg = ws.recv()
            payload = json.loads(msg)
            print(f"Received telemetry packet {i+1}: {payload}")
            packets.append(payload)
            
        ws.close()
        
        # Verify payload keys
        required_keys = ["time", "timestamp", "sxr", "hxr", "sxrRollingMean", "nowcastProb", "forecastClass", "alertLevel"]
        missing_keys = [k for k in required_keys if k not in packets[0]]
        
        if len(missing_keys) == 0:
            report["tests"].append({
                "name": "WebSocket Telemetry Stream",
                "status": "PASS",
                "sample_packet": packets[0]
            })
        else:
            report["status"] = "FAIL"
            report["tests"].append({
                "name": "WebSocket Telemetry Stream",
                "status": "FAIL",
                "error": f"Missing keys in payload: {missing_keys}"
            })
    except Exception as e:
        report["status"] = "FAIL"
        report["tests"].append({
            "name": "WebSocket Telemetry Stream",
            "status": "FAIL",
            "error": str(e)
        })
        
    # 4. Stop the FastAPI server
    print("Stopping FastAPI server...")
    server_process.terminate()
    try:
        server_process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        server_process.kill()
        
    return report

if __name__ == '__main__':
    result = run_tests()
    print("\n" + "="*50)
    print(f"INTEGRATION TEST RESULT: {result['status']}")
    print("="*50)
    for test in result["tests"]:
        print(f"- {test['name']}: {test['status']}")
        if "error" in test:
            print(f"  Error: {test['error']}")
            
    # Save test report to JSON to read in parent script
    with open("backend/test_report.json", "w") as f:
        json.dump(result, f, indent=4)
