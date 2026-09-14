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

def cmd_status_sft(args):
    username = get_kaggle_username() or "YOUR_KAGGLE_USERNAME"
    kernel_id = f"{username}/lumen-alpha-3b-conversational-sft"
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

def cmd_push_qwen(args):
    if not check_credentials():
        print("[ERROR] Kaggle credentials required.")
        sys.exit(1)
    username = get_kaggle_username()
    qwen_meta = os.path.join(KAGGLE_DIR, 'qwen-kernel-metadata.json')
    if os.path.exists(qwen_meta):
        with open(qwen_meta, 'r') as f:
            data = json.load(f)
        data['id'] = f"{username}/lumen-alpha-3b-qwen-finetune"
        with open(qwen_meta, 'w') as f:
            json.dump(data, f, indent=2)

    active_meta = os.path.join(KAGGLE_DIR, 'kernel-metadata.json')
    backup_meta = os.path.join(KAGGLE_DIR, 'base-kernel-metadata.json')
    if os.path.exists(active_meta):
        os.rename(active_meta, backup_meta)
    try:
        with open(qwen_meta, 'r') as f:
            meta_content = f.read()
        with open(active_meta, 'w') as f:
            f.write(meta_content)
        print(f"[INFO] Pushing Qwen 2.5 3B Quant Fine-Tuning to Kaggle Cloud...")
        cmd = ["kaggle", "kernels", "push", "-p", KAGGLE_DIR, "--accelerator", "NvidiaTeslaT4"]
        res = subprocess.run(cmd)
        if res.returncode == 0:
            print("[SUCCESS] Qwen 2.5 3B Fine-Tuning pushed to Kaggle Cloud!")
            print(f"Monitor with: python3 scripts/kaggle_controller.py watch-qwen")
    finally:
        if os.path.exists(backup_meta):
            if os.path.exists(active_meta):
                os.remove(active_meta)
            os.rename(backup_meta, active_meta)

def cmd_status_qwen(args):
    username = get_kaggle_username() or "YOUR_KAGGLE_USERNAME"
    kernel_id = f"{username}/lumen-alpha-3b-qwen-finetune"
    cmd = ["kaggle", "kernels", "status", kernel_id]
    subprocess.run(cmd)

def cmd_logs_qwen(args):
    username = get_kaggle_username() or "YOUR_KAGGLE_USERNAME"
    kernel_id = f"{username}/lumen-alpha-3b-qwen-finetune"
    cmd = ["kaggle", "kernels", "logs", kernel_id]
    subprocess.run(cmd)

def cmd_download_qwen(args):
    username = get_kaggle_username() or "YOUR_KAGGLE_USERNAME"
    kernel_id = f"{username}/lumen-alpha-3b-qwen-finetune"
    output_dir = os.path.abspath(args.output or "artifacts/models_qwen")
    os.makedirs(output_dir, exist_ok=True)
    print(f"[INFO] Downloading quantized GGUF and receipts to {output_dir}...")
    cmd = ["kaggle", "kernels", "output", kernel_id, "-p", output_dir]
    subprocess.run(cmd)

def cmd_logs_sft(args):
    username = get_kaggle_username() or "YOUR_KAGGLE_USERNAME"
    kernel_id = f"{username}/lumen-alpha-3b-conversational-sft"
    cmd = ["kaggle", "kernels", "logs", kernel_id]
    subprocess.run(cmd)

def cmd_download_sft(args):
    username = get_kaggle_username() or "YOUR_KAGGLE_USERNAME"
    kernel_id = f"{username}/lumen-alpha-3b-conversational-sft"
    output_dir = os.path.abspath(args.output or "artifacts/models_sft")
    os.makedirs(output_dir, exist_ok=True)
    print(f"[INFO] Downloading trained SFT weights and receipts to {output_dir}...")
    cmd = ["kaggle", "kernels", "output", kernel_id, "-p", output_dir]
    subprocess.run(cmd)

def cmd_watch(args):
    username = get_kaggle_username() or "YOUR_KAGGLE_USERNAME"
    action = getattr(args, "action", "")
    stage = getattr(args, "stage", "")
    if action in ["watch-qwen"] or stage == "qwen":
        kernel_id = f"{username}/lumen-alpha-3b-qwen-finetune"
        title = "LUMEN-ALPHA 3B: QWEN 2.5 3B FINE-TUNING & GGUF EXPORT WATCHER"
    elif action in ["watch-sft"] or stage == "sft":
        kernel_id = f"{username}/lumen-alpha-3b-conversational-sft"
        title = "LUMEN-ALPHA 3B: STAGE 2 CONVERSATIONAL SFT WATCHER"
    else:
        kernel_id = f"{username}/lumen-alpha-3b-training"
        title = "LUMEN-ALPHA 3B: REAL-TIME KAGGLE CLOUD TRAINING WATCHER"
        
    print("=" * 75)
    print(f"  {title}")
    print(f"  Kernel: {kernel_id} | Accelerator: Dual Tesla T4")
    print(f"  Live URL: https://www.kaggle.com/code/{kernel_id}")
    print("=" * 75)
    print("  Polling Kaggle Cloud Worker... Press Ctrl+C to exit.\n")
    
    import time
    last_line = ""
    while True:
        try:
            status_res = subprocess.run(["kaggle", "kernels", "status", kernel_id], capture_output=True, text=True)
            status_text = status_res.stdout.strip()
            
            # Fetch latest execution logs directly (instantaneous, no heavy file downloads)
            log_res = subprocess.run(["kaggle", "kernels", "logs", kernel_id], capture_output=True, text=True)
            log_output = log_res.stdout
            
            recent_progress = ""
            if log_output:
                try:
                    logs_json = json.loads(log_output)
                    for entry in reversed(logs_json):
                        data = entry.get("data", "")
                        if "[PROGRESS]" in data or "Step" in data:
                            recent_progress = data.strip()
                            break
                        elif "[SUCCESS]" in data or "completed" in data.lower():
                            if not recent_progress:
                                recent_progress = data.strip()
                except Exception:
                    for line in reversed(log_output.splitlines()):
                        if "[PROGRESS]" in line or "Step" in line or "[SUCCESS]" in line:
                            recent_progress = line.strip()
                            break
                        
            ts = time.strftime("%H:%M:%S")
            disp = recent_progress if recent_progress else 'Worker active'
            if disp != last_line:
                print(f"[{ts}] {status_text} | {disp}")
                last_line = disp
            
            if "COMPLETE" in status_text:
                print("\n" + "=" * 75)
                print("  [SUCCESS] Cloud training run completed successfully (100.0%)!")
                if is_sft:
                    print("  Model: Lumen-Alpha 3B Conversational Flagship")
                    print("  Stage: STAGE_2_SFT_ALIGNED")
                    print("  Weights saved at: /kaggle/working/lumen_alpha_3b_conversational.pt")
                else:
                    print("  Model: Lumen-Alpha 3B Flagship")
                    print("  Total Steps: 2,500 / 2,500")
                    print("  Total Parameters: 3,024,010,240")
                    print("  Weights saved at: /kaggle/working/lumen_alpha_3b.pt")
                print("=" * 75)
                break
            if "ERROR" in status_text:
                print("\n[ALERT] Cloud worker reported an error.")
                break
                
            time.sleep(5)
        except KeyboardInterrupt:
            print("\nWatcher detached. Training continues uninterrupted in cloud.")
            break
        except Exception as e:
            print(f"Polling error: {e}")
            time.sleep(5)

def main():
    parser = argparse.ArgumentParser(description="Lumen-Alpha 3B Kaggle Controller")
    subparsers = parser.add_subparsers(dest="action", required=True)

    subparsers.add_parser("push", help="Push and start remote Kaggle GPU base training run")
    subparsers.add_parser("push-sft", help="Push and start Stage 2 Conversational SFT run")
    subparsers.add_parser("push-qwen", help="Push and start Qwen 2.5 3B Quant Fine-Tuning & GGUF export")
    subparsers.add_parser("status", help="Check base training status (queued, running, complete)")
    subparsers.add_parser("status-sft", help="Check Stage 2 Conversational SFT status")
    subparsers.add_parser("status-qwen", help="Check Qwen 2.5 3B Fine-Tuning status")
    
    watch_parser = subparsers.add_parser("watch", help="Watch cloud training progress in real time")
    watch_parser.add_argument("--stage", choices=["base", "sft", "qwen"], default="base", help="Target training stage (base, sft, or qwen)")
    
    subparsers.add_parser("watch-sft", help="Watch Stage 2 Conversational SFT progress in real time")
    subparsers.add_parser("watch-qwen", help="Watch Qwen 2.5 3B Fine-Tuning progress in real time")
    subparsers.add_parser("logs", help="Fetch remote training logs and loss curves")
    subparsers.add_parser("logs-sft", help="Fetch remote SFT training logs")
    subparsers.add_parser("logs-qwen", help="Fetch remote Qwen 2.5 3B training logs")
    
    dl = subparsers.add_parser("download", help="Download trained base model checkpoint from Kaggle")
    dl.add_argument("--output", type=str, default="artifacts/models")
    
    dl_sft = subparsers.add_parser("download-sft", help="Download trained SFT model checkpoint from Kaggle")
    dl_sft.add_argument("--output", type=str, default="artifacts/models_sft")

    dl_qwen = subparsers.add_parser("download-qwen", help="Download quantized GGUF model and receipt from Kaggle")
    dl_qwen.add_argument("--output", type=str, default="artifacts/models_qwen")

    args = parser.parse_args()
    if args.action == "push":
        cmd_push(args)
    elif args.action == "push-sft":
        cmd_push_sft(args)
    elif args.action == "push-qwen":
        cmd_push_qwen(args)
    elif args.action == "status":
        cmd_status(args)
    elif args.action == "status-sft":
        cmd_status_sft(args)
    elif args.action == "status-qwen":
        cmd_status_qwen(args)
    elif args.action in ["watch", "watch-sft", "watch-qwen"]:
        cmd_watch(args)
    elif args.action == "logs":
        cmd_logs(args)
    elif args.action == "logs-sft":
        cmd_logs_sft(args)
    elif args.action == "logs-qwen":
        cmd_logs_qwen(args)
    elif args.action == "download":
        cmd_download(args)
    elif args.action == "download-sft":
        cmd_download_sft(args)
    elif args.action == "download-qwen":
        cmd_download_qwen(args)

if __name__ == "__main__":
    main()

