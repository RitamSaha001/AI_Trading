import subprocess
import json

res = subprocess.run(["kaggle", "kernels", "output", "ritamsaha00178/lumen-alpha-3b-training", "-p", "/tmp/kaggle_full_output"], capture_output=True, text=True)
print("STDOUT:", res.stdout)
print("STDERR:", res.stderr)

import os
if os.path.exists("/tmp/kaggle_full_output"):
    print("Files in /tmp/kaggle_full_output:")
    for root, dirs, files in os.walk("/tmp/kaggle_full_output"):
        for f in files:
            fp = os.path.join(root, f)
            print(f"  {fp}: {os.path.getsize(fp)} bytes")
