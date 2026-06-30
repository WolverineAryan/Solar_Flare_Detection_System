#!/usr/bin/env python
"""
CCSDS Telemetry Downlink Transmitter Simulator.
Reads clean satellite telemetry, packs counts into binary CCSDS packets,
and transmits them over a UDP socket to simulate Aditya-L1 downlinking raw packets.
"""

from __future__ import annotations
import os
import sys
import time
import socket
import struct
import argparse
import pandas as pd

UDP_IP = "127.0.0.1"
UDP_PORT = 9000

def create_ccsds_packet(apid: int, seq_count: int, value: float) -> bytes:
    """
    Creates a binary CCSDS packet.
    Header (6 bytes):
      - Word 1: Packet ID (Version 3b, Type 1b, Sec. Header 1b, APID 11b)
      - Word 2: Sequence Control (Flags 2b = 3 (standalone), Sequence Count 14b)
      - Word 3: Packet Length (4 bytes float - 1 = 3)
    Payload:
      - 4 bytes float representing counts
    """
    # Packet ID: Version 0 (000b), Type 0 (0b), Sec. Header 0 (0b) -> shift APID
    packet_id = apid & 0x07FF
    
    # Sequence Flags = 3 (11 in binary, standalone packet) -> shift sequence control
    seq_control = (3 << 14) | (seq_count & 0x3FFF)
    
    # Payload length minus 1
    packet_length = 3
    
    header = struct.pack(">HHH", packet_id, seq_control, packet_length)
    payload = struct.pack(">f", value)
    
    return header + payload

def start_downlink_simulation(csv_path: str, speed_multiplier: float):
    print("=" * 70)
    print("        ISRO ADITYA-L1 CCSDS TELEMETRY DOWNLINK SIMULATOR")
    print("=" * 70)
    
    if not os.path.exists(csv_path):
        print(f"Error: Telemetry file not found at: {csv_path}")
        return
        
    print(f"Loading telemetry dataset from: {csv_path}...")
    df = pd.read_csv(csv_path)
    
    sxr_col = "counts_clean" if "counts_clean" in df.columns else ("counts" if "counts" in df.columns else None)
    hxr_col = "hxr" if "hxr" in df.columns else ("counts" if "counts" in df.columns else None)
    
    if sxr_col is None:
        print("Error: Could not identify SXR counts column.")
        return
        
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    
    print(f"Transmitting binary CCSDS streams to {UDP_IP}:{UDP_PORT}...")
    print(f"Speed: {speed_multiplier}x")
    print("-" * 70)
    
    seq_count = 0
    delay = 1.0 / speed_multiplier
    
    try:
        for idx, row in df.iterrows():
            sxr_val = float(row[sxr_col])
            hxr_val = float(row[hxr_col]) if (hxr_col in df.columns and hxr_col != sxr_col) else (2.0 + (sxr_val * 0.1))
            
            # 1. Transmit SoLEXS SXR packet (APID 100)
            sxr_packet = create_ccsds_packet(100, seq_count, sxr_val)
            sock.sendto(sxr_packet, (UDP_IP, UDP_PORT))
            
            # 2. Transmit HEL1OS HXR packet (APID 101)
            hxr_packet = create_ccsds_packet(101, seq_count, hxr_val)
            sock.sendto(hxr_packet, (UDP_IP, UDP_PORT))
            
            print(f"[TX] Packet Seq #{seq_count:<5} | SoLEXS (SXR): {sxr_val:<6.2f} | HEL1OS (HXR): {hxr_val:<6.2f}")
            
            seq_count = (seq_count + 1) % 16384
            time.sleep(delay)
            
    except KeyboardInterrupt:
        print("\nTransmission halted by operator.")
    finally:
        sock.close()
    print("=" * 70)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="CCSDS Telemetry Transmitter Simulator.")
    parser.add_argument(
        "--file", 
        type=str, 
        default="SoLEXS_combined_cleaned.csv", 
        help="Path to CSV dataset"
    )
    parser.add_argument(
        "--speed", 
        type=float, 
        default=1.0, 
        help="Speed multiplier"
    )
    args = parser.parse_args()
    start_downlink_simulation(args.file, args.speed)
