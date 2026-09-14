#!/usr/bin/env python3
"""
LUMEN-ALPHA 3B: KAGGLE REMOTE TRAINING CONTROLLER
Automates pushing, launching, monitoring, and downloading Kaggle cloud training runs.
"""

import os
import sys
import json
import subprocess
import argparse

KAGGLE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'kaggle'))
METADATA_FILE = os.path.join(KAGGLE_DIR, 'kernel-metadata.json')
ACCESS_TOKEN_PATH = os.path.expanduser('~/.kaggle/access_token')
CREDENTIALS_PATH = os.path.expanduser('~/.kaggle/kaggle.json')

def check_credentials():
    has_token = os.path.exists(ACCESS_TOKEN_PATH) or bool(os.environ.get('KAGGLE_API_TOKEN'))
    has_file = os.path.exists(CREDENTIALS_PATH)
    has_env = bool(os.environ.get('KAGGLE_USERNAME') and os.environ.get('KAGGLE_KEY'))
    return has_token or has_file or has_env

def get_kaggle_username():
    if os.environ.get('KAGGLE_USERNAME'):
        return os.environ.get('KAGGLE_USERNAME')
    if os.path.exists(CREDENTIALS_PATH):
        try:
            with open(CREDENTIALS_PATH, 'r') as f:
                data = json.load(f)
                if data.get('username'):
                    return data.get('username')
        except Exception:
            pass
    return "ritamsaha00178"

def update_metadata_username(username):
    if not os.path.exists(METADATA_FILE):
        print(f"[ERROR] {METADATA_FILE} not found.")
        return False
    with open(METADATA_FILE, 'r') as f:
        meta = json.load(f)
    meta['id'] = f"{username}/lumen-alpha-3b-training"
    meta['machine_shape'] = "NvidiaTeslaT4"
    with open(METADATA_FILE, 'w') as f:
        json.dump(meta, f, indent=2)
    return True

def cmd_push(args):
    if not check_credentials():
        print("=" * 70)
        print("  [KAGGLE CREDENTIALS REQUIRED]")
        print("=" * 70)
        print("  To allow Antigravity to launch and control training on Kaggle:")
        print("  1. Go to: https://www.kaggle.com/settings -> Click 'Create New Token'")
        print("  2. It will download 'kaggle.json'. Place it in: ~/.kaggle/kaggle.json")
        print("     Or provide your Kaggle Username & API Key.")
        print("=" * 70)
        sys.exit(1)

    username = get_kaggle_username()
    if username:
        update_metadata_username(username)
        print(f"[INFO] Updated Kaggle kernel ID to: {username}/lumen-alpha-3b-training (Accelerator: NvidiaTeslaT4)")

    print(f"[INFO] Pushing notebook from {KAGGLE_DIR} to Kaggle Cloud...")
    cmd = ["kaggle", "kernels", "push", "-p", KAGGLE_DIR, "--accelerator", "NvidiaTeslaT4"]
    res = subprocess.run(cmd)
    if res.returncode == 0:
        print("[SUCCESS] Kernel pushed to Kaggle. Training has started on Cloud GPU/TPU!")
        print(f"Monitor status with: python3 scripts/kaggle_controller.py status")

def cmd_status(args):
    username = get_kaggle_username() or "YOUR_KAGGLE_USERNAME"
    kernel_id = f"{username}/lumen-alpha-3b-training"
    cmd = ["kaggle", "kernels", "status", kernel_id]
    subprocess.run(cmd)

def cmd_logs(args):
    username = get_kaggle_username() or "YOUR_KAGGLE_USERNAME"
    kernel_id = f"{username}/lumen-alpha-3b-training"
    cmd = ["kaggle", "kernels", "output", kernel_id, "-p", "/tmp/kaggle_logs"]
    subprocess.run(cmd)

def cmd_download(args):
    username = get_kaggle_username() or "YOUR_KAGGLE_USERNAME"
    kernel_id = f"{username}/lumen-alpha-3b-training"
    output_dir = os.path.abspath(args.output or "artifacts/models")
    os.makedirs(output_dir, exist_ok=True)
    print(f"[INFO] Downloading trained weights and checkpoints to {output_dir}...")
    cmd = ["kaggle", "kernels", "output", kernel_id, "-p", output_dir]
    subprocess.run(cmd)

def cmd_push_sft(args):
    if not check_credentials():
        print("[ERROR] Kaggle credentials required.")
        sys.exit(1)
    username = get_kaggle_username()
    sft_meta = os.path.join(KAGGLE_DIR, 'sft-kernel-metadata.json')
    if os.path.exists(sft_meta):
        with open(sft_meta, 'r') as f:
            data = json.load(f)
        data['id'] = f"{username}/lumen-alpha-3b-conversational-sft"
        data['kernel_sources'] = [f"{username}/lumen-alpha-3b-training"]
        with open(sft_meta, 'w') as f:
            json.dump(data, f, indent=2)
    # Temporary copy metadata to kernel-metadata.json for push
    active_meta = os.path.join(KAGGLE_DIR, 'kernel-metadata.json')
    backup_meta = os.path.join(KAGGLE_DIR, 'base-kernel-metadata.json')
    if os.path.exists(active_meta):
        os.rename(active_meta, backup_meta)
    try:
        with open(sft_meta, 'r') as f:
            meta_content = f.read()
        with open(active_meta, 'w') as f:
            f.write(meta_content)
        print(f"[INFO] Pushing Stage 2 Conversational SFT to Kaggle Cloud...")
        cmd = ["kaggle", "kernels", "push", "-p", KAGGLE_DIR, "--accelerator", "NvidiaTeslaT4"]
        res = subprocess.run(cmd)
        if res.returncode == 0:
            print("[SUCCESS] Stage 2 Conversational SFT pushed to Kaggle Cloud!")
    finally:
        if os.path.exists(backup_meta):
            if os.path.exists(active_meta):
                os.remove(active_meta)
            os.rename(backup_meta, active_meta)

def cmd_watch(args):
    username = get_kaggle_username() or "YOUR_KAGGLE_USERNAME"
    kernel_id = f"{username}/lumen-alpha-3b-training"
    print("=" * 75)
    print(f"  LUMEN-ALPHA 3B: REAL-TIME KAGGLE CLOUD TRAINING WATCHER")
    print(f"  Kernel: {kernel_id} | Accelerator: Dual Tesla T4")
    print(f"  Live URL: https://www.kaggle.com/code/{kernel_id}")
    print("=" * 75)
    print("  Polling Kaggle Cloud Worker every 10s... Press Ctrl+C to exit.\n")
    
    import time
    log_dir = "/tmp/kaggle_live_watch"
    os.makedirs(log_dir, exist_ok=True)
    
    last_status = None
    while True:
        try:
            status_res = subprocess.run(["kaggle", "kernels", "status", kernel_id], capture_output=True, text=True)
            status_text = status_res.stdout.strip()
            
            # Download latest log
            subprocess.run(["kaggle", "kernels", "output", kernel_id, "-p", log_dir, "--force"], capture_output=True)
            
            log_file = os.path.join(log_dir, "lumen-alpha-3b-training.log")
            recent_progress = ""
            if os.path.exists(log_file):
                with open(log_file, "r") as f:
                    lines = f.readlines()
                    progress_lines = [l for l in lines if "[PROGRESS]" in l or "Step" in l]
                    if progress_lines:
                        recent_progress = progress_lines[-1].strip()
                        
            ts = time.strftime("%H:%M:%S")
            print(f"[{ts}] {status_text} | {recent_progress if recent_progress else 'Worker active'}")
            
            if "COMPLETE" in status_text:
                print("\n[SUCCESS] Cloud training run completed successfully!")
                break
            if "ERROR" in status_text:
                print("\n[ALERT] Cloud worker reported an error. Fetching logs...")
                break
                
            time.sleep(10)
        except KeyboardInterrupt:
            print("\nWatcher detached. Training continues uninterrupted in cloud.")
            break
        except Exception as e:
            print(f"Polling error: {e}")
            time.sleep(10)

def main():
    parser = argparse.ArgumentParser(description="Lumen-Alpha 3B Kaggle Controller")
    subparsers = parser.add_subparsers(dest="action", required=True)

    subparsers.add_parser("push", help="Push and start remote Kaggle GPU training run")
    subparsers.add_parser("push-sft", help="Push and start Stage 2 Conversational SFT run")
    subparsers.add_parser("status", help="Check base training status (queued, running, complete)")
    subparsers.add_parser("status-sft", help="Check Stage 2 Conversational SFT status")
    subparsers.add_parser("watch", help="Watch cloud training progress in real time")
    subparsers.add_parser("logs", help="Fetch remote training logs and loss curves")
    dl = subparsers.add_parser("download", help="Download trained model checkpoint from Kaggle")
    dl.add_argument("--output", type=str, default="artifacts/models")

    args = parser.parse_args()
    if args.action == "push":
        cmd_push(args)
    elif args.action == "push-sft":
        cmd_push_sft(args)
    elif args.action == "status":
        cmd_status(args)
    elif args.action == "status-sft":
        cmd_status_sft(args)
    elif args.action == "watch":
        cmd_watch(args)
    elif args.action == "logs":
        cmd_logs(args)
    elif args.action == "download":
        cmd_download(args)

if __name__ == "__main__":
    main()
