"""Run every E2E script. Default: parallel pool (much faster locally).
Set E2E_SERIAL=1 to fall back to the old sequential mode.
CI shards the suite via a matrix (see .github/workflows/e2e.yml) and
calls each script directly, bypassing this runner."""
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).parent
SCRIPTS = [
    "composer_overlap.py",
    "fab_layout.py",
    "fab_a11y.py",
    "fab_perf.py",
    "fab_visual.py",
    "a11y_aria_labels.py",
    "a11y_keyboard.py",
    "a11y_keyboard_dynamic.py",
    "a11y_aria_tree.py",
    "a11y_live_region.py",
    "visual_regression.py",
    "cross_browser_matrix.py",
    "mindmap_keyboard.py",
    "mindmap_rename_edges.py",
    "mindmap_collapse.py",
    "mindmap_live_a11y.py",
    "mindmap_focus_visual.py",
]


def run(script: str) -> tuple[str, int, str]:
    proc = subprocess.run(
        [sys.executable, str(ROOT / script)],
        capture_output=True,
        text=True,
    )
    return script, proc.returncode, proc.stdout + proc.stderr


def main() -> int:
    serial = os.environ.get("E2E_SERIAL") == "1"
    workers = 1 if serial else int(os.environ.get("E2E_WORKERS", "4"))
    fails: list[str] = []

    if workers == 1:
        for s in SCRIPTS:
            print(f"\n========== {s} ==========")
            r = subprocess.run([sys.executable, str(ROOT / s)])
            if r.returncode != 0:
                fails.append(s)
    else:
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = [pool.submit(run, s) for s in SCRIPTS]
            for f in as_completed(futures):
                name, code, output = f.result()
                print(f"\n========== {name} (exit={code}) ==========")
                print(output)
                if code != 0:
                    fails.append(name)

    if fails:
        print(f"\nFAILED: {fails}")
        return 1
    print("\nALL E2E PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
