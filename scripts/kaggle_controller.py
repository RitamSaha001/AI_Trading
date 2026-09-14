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
        print(f"[INFO] Updated Kaggle kernel ID to: {username}/lumen-alpha-3b-training")

    print(f"[INFO] Pushing notebook from {KAGGLE_DIR} to Kaggle Cloud...")
    cmd = ["kaggle", "kernels", "push", "-p", KAGGLE_DIR]
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

def main():
    parser = argparse.ArgumentParser(description="Lumen-Alpha 3B Kaggle Controller")
    subparsers = parser.add_subparsers(dest="action", required=True)

    subparsers.add_parser("push", help="Push and start remote Kaggle GPU training run")
    subparsers.add_parser("status", help="Check remote training status (queued, running, complete)")
    subparsers.add_parser("logs", help="Fetch remote training logs and loss curves")
    dl = subparsers.add_parser("download", help="Download trained model checkpoint from Kaggle")
    dl.add_argument("--output", type=str, default="artifacts/models")

    args = parser.parse_args()
    if args.action == "push":
        cmd_push(args)
    elif args.action == "status":
        cmd_status(args)
    elif args.action == "logs":
        cmd_logs(args)
    elif args.action == "download":
        cmd_download(args)

if __name__ == "__main__":
    main()
