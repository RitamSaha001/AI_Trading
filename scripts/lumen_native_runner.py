#!/usr/bin/env python3
"""
LUMEN-ALPHA 3B: NATIVE APPLE SILICON GGUF INFERENCE RUNNER
Executes the quantized Q4_K_M GGUF model directly on Apple Silicon M1 Metal GPU.
Streams tokens autoregressively with real-time DeepSeek-R1 <think> syntax highlighting.
"""

import os
import sys
import time

REPO_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
GGUF_PATH = os.path.join(REPO_DIR, "artifacts", "models_qwen", "lumen-alpha-3b-q4_k_m.gguf")
RECEIPT_PATH = os.path.join(REPO_DIR, "artifacts", "models_qwen", "lumen_alpha_qwen_receipt.json")

# ANSI Color Codes
C_RESET = "\033[0m"
C_BOLD = "\033[1m"
C_CYAN = "\033[96m"
C_PURPLE = "\033[95m"
C_YELLOW = "\033[93m"
C_GREEN = "\033[92m"
C_GRAY = "\033[90m"
C_RED = "\033[91m"

def print_banner():
    print(f"\n{C_CYAN}╔══════════════════════════════════════════════════════════════════════════╗{C_RESET}")
    print(f"{C_CYAN}║{C_RESET}  {C_BOLD}👑 LUMEN-ALPHA 3B QUANTIZED FLAGSHIP | NATIVE M1 METAL ENGINE{C_RESET}       {C_CYAN}║{C_RESET}")
    print(f"{C_CYAN}║{C_RESET}  {C_GRAY}Foundation: Qwen 2.5 3B (18T Tokens) • 1,500 Quant SFT • 4-bit GGUF{C_RESET}      {C_CYAN}║{C_RESET}")
    print(f"{C_CYAN}╚══════════════════════════════════════════════════════════════════════════╝{C_RESET}")
    print(f"{C_GRAY}• Autoregressive token generation on Apple Silicon Metal GPU.{C_RESET}")
    print(f"{C_GRAY}• Commands: {C_YELLOW}/exit{C_GRAY} | {C_YELLOW}/clear{C_GRAY} | {C_YELLOW}/reset{C_RESET}")
    print(f"{C_GRAY}{'─' * 74}{C_RESET}\n")

def check_model():
    if not os.path.exists(GGUF_PATH):
        # Fall back to typescript engine seamlessly
        return False
    return True

def run_llama_cpp(prompt, model):
    sys_prompt = "You are Lumen-Alpha 3B, a sovereign institutional quantitative foundation intelligence. When presented with complex problems, deliberate thoroughly inside <think>...</think> before formulating your executive analysis."
    
    formatted_prompt = f"<|im_start|>system\n{sys_prompt}<|im_end|>\n<|im_start|>user\n{prompt}<|im_end|>\n<|im_start|>assistant\n"
    
    stream = model(
        formatted_prompt,
        max_tokens=1024,
        stop=["<|im_end|>", "<|endoftext|>"],
        stream=True,
        temperature=0.6,
        top_p=0.9,
    )
    
    in_think = False
    print(f"\n{C_BOLD}{C_CYAN}lumen ❯ {C_RESET}", end="", flush=True)
    
    for chunk in stream:
        token = chunk["choices"][0]["text"]
        if "<think>" in token:
            in_think = True
            token = token.replace("<think>", f"\n{C_PURPLE}┌─── 🤔 Deliberation Trace ────────────────────────────────────────\n│ ")
        elif "</think>" in token:
            in_think = False
            token = token.replace("</think>", f"\n└─── End Deliberation ──────────────────────────────────────────────────{C_RESET}\n\n")
        elif in_think and "\n" in token:
            token = token.replace("\n", f"\n{C_PURPLE}│ ")
            
        sys.stdout.write(token)
        sys.stdout.flush()
    print("\n")

def main():
    if not check_model():
        # Fallback to typescript runner
        import subprocess
        cmd = ["npx", "tsx", os.path.join(REPO_DIR, "scripts", "lumen_terminal_chat.ts")] + sys.argv[1:]
        subprocess.run(cmd)
        return

    try:
        from llama_cpp import Llama
    except ImportError:
        print(f"{C_YELLOW}[NOTE] To run direct GGUF inference on Apple Silicon Metal GPU, install:{C_RESET}")
        print(f"       {C_GREEN}pip install llama-cpp-python{C_RESET}")
        print(f"{C_GRAY}Falling back to hybrid deliberation engine...{C_RESET}\n")
        import subprocess
        cmd = ["npx", "tsx", os.path.join(REPO_DIR, "scripts", "lumen_terminal_chat.ts")] + sys.argv[1:]
        subprocess.run(cmd)
        return

    print(f"{C_CYAN}[INFO] Loading {GGUF_PATH} onto Apple Silicon Metal GPU...{C_RESET}")
    llm = Llama(
        model_path=GGUF_PATH,
        n_gpu_layers=-1,  # Offload all layers to Apple Silicon Metal GPU
        n_ctx=2048,
        verbose=False
    )
    print(f"{C_GREEN}[SUCCESS] Model loaded in unified memory.{C_RESET}")

    # Single-shot mode
    if len(sys.argv) > 1:
        query = " ".join(sys.argv[1:])
        run_llama_cpp(query, llm)
        return

    # REPL mode
    print_banner()
    while True:
        try:
            inp = input(f"{C_BOLD}{C_GREEN}you ❯ {C_RESET}").strip()
            if not inp:
                continue
            if inp.lower() in ["exit", "quit", "/exit", "/quit"]:
                print(f"\n{C_CYAN}Session ended. Lumen-Alpha standing by.{C_RESET}\n")
                break
            if inp == "/clear":
                os.system("clear")
                print_banner()
                continue
            run_llama_cpp(inp, llm)
        except (KeyboardInterrupt, EOFError):
            print(f"\n\n{C_CYAN}Session closed. Lumen-Alpha offline.{C_RESET}\n")
            break

if __name__ == "__main__":
    main()
