#!/usr/bin/env python
"""
CCSDS Telemetry Packet Parser for Aditya-L1 Ground Segment.
Listens on a UDP socket for raw binary CCSDS downlinked packets,
parses the packet headers and APID, extracts photon count rates, 
and streams them directly to the Solar Flare Warning API.
"""

from __future__ import annotations
import socket
import struct
import requests

# APID Definitions for Aditya-L1 Payloads
APID_SOLEXS_SXR = 100
APID_HEL1OS_HXR = 101

# UDP Listening Port for raw ground station receiver downlink
UDP_IP = "127.0.0.1"
UDP_PORT = 9000
API_URL = "http://127.0.0.1:8000/predict/live"

def parse_ccsds_header(header_bytes: bytes) -> tuple[int, int, int]:
    """
    Parses the 6-byte CCSDS Primary Header.
    Format:
      - Packet ID (16 bits): Version (3b), Type (1b), Sec. Header (1b), APID (11b)
      - Packet Sequence Control (16 bits): Sequence Flags (2b), Sequence Count (14b)
      - Packet Length (16 bits): Total bytes in user data field minus 1
    """
    # Unpack 3 unsigned short integers (16-bit)
    packet_id, seq_control, packet_length = struct.unpack(">HHH", header_bytes)
    
    # Extract APID (least significant 11 bits of packet_id)
    apid = packet_id & 0x07FF
    
    # Extract Sequence Count (least significant 14 bits of seq_control)
    seq_count = seq_control & 0x3FFF
    
    return apid, seq_count, packet_length

def start_ccsds_receiver():
    print("=" * 70)
    print("        ISRO ADITYA-L1 CCSDS TELEMENTRY GROUND PARSER")
    print("=" * 70)
    print(f"Listening for raw downlink stream on UDP: {UDP_IP}:{UDP_PORT}...")
    print(f"Targeting API Endpoint: {API_URL}")
    print("-" * 70)
    
    # Bind UDP Socket
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind((UDP_IP, UDP_PORT))
    
    # Maintain simple state to pair SXR and HXR telemetry points
    current_sxr = None
    current_hxr = None
    
    try:
        while True:
            # Buffer size of 1024 bytes is plenty for typical CCSDS telemetry packets
            data, addr = sock.recvfrom(1024)
            
            if len(data) < 6:
                print("Warning: Received truncated packet (less than 6-byte CCSDS header).")
                continue
                
            header = data[:6]
            payload = data[6:]
            
            apid, seq_count, packet_len = parse_ccsds_header(header)
            
            # Verify payload length matches packet length header
            # CCSDS length = length field + 1
            expected_payload_len = packet_len + 1
            if len(payload) < expected_payload_len:
                print(f"Warning: Payload size mismatch. Expected {expected_payload_len} bytes, got {len(payload)}.")
                continue
                
            # Extract count rates from payload depending on APID
            if apid == APID_SOLEXS_SXR:
                # SoLEXS counts are encoded as a 32-bit float in the packet payload
                if len(payload) >= 4:
                    current_sxr = struct.unpack(">f", payload[:4])[0]
                    print(f"[RECV] APID {apid} (SoLEXS SXR) | Seq: {seq_count} | SXR Flux: {current_sxr:.2f}")
                    
            elif apid == APID_HEL1OS_HXR:
                # HEL1OS counts are encoded as a 32-bit float in the packet payload
                if len(payload) >= 4:
                    current_hxr = struct.unpack(">f", payload[:4])[0]
                    print(f"[RECV] APID {apid} (HEL1OS HXR) | Seq: {seq_count} | HXR Flux: {current_hxr:.2f}")
                    
            else:
                print(f"[RECV] APID {apid} (Unknown Payload APID) | Seq: {seq_count} | Skipping.")
                continue
                
            # Once we have both SXR and HXR updates, stream them to the prediction pipeline
            if current_sxr is not None and current_hxr is not None:
                payload_json = {
                    "sxr_raw": float(current_sxr),
                    "hxr_raw": float(current_hxr)
                }
                
                try:
                    resp = requests.post(API_URL, json=payload_json, timeout=2)
                    if resp.status_code == 200:
                        res = resp.json()
                        alert = res.get("alertLevel", "normal").upper()
                        print(f"  --> [STREAMED] Nowcast: {res.get('nowcastProb')*100:.1f}% | Forecast: {res.get('forecastClass')} | Alert: {alert}")
                    else:
                        print(f"  --> [ERROR] API returned HTTP {resp.status_code}")
                except requests.exceptions.RequestException as e:
                    print(f"  --> [ERROR] Connection to API failed: {e}")
                    
                # Reset buffers for next tick
                current_sxr = None
                current_hxr = None
                
    except KeyboardInterrupt:
        print("\nReceiver shut down by operator.")
    finally:
        sock.close()
    print("=" * 70)

if __name__ == '__main__':
    start_ccsds_receiver()
