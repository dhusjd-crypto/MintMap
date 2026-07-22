"""Visual regression: compare composer-region screenshots against
committed baselines per viewport. First run (or with UPDATE_BASELINE=1)
writes baselines; subsequent runs diff pixel counts.

Run:
  python3 tests/e2e/visual_regression.py              # compare
  UPDATE_BASELINE=1 python3 tests/e2e/visual_regression.py   # refresh
"""
import asyncio, os, sys
from pathlib import Path
from playwright.async_api import async_playwright
from PIL import Image, ImageChops

ROOT = Path(__file__).parent
BASE = ROOT / "baselines"
OUT = ROOT / "screenshots" / "visual_regression"
BASE.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)

VIEWPORTS = [("mobile", 375, 800), ("tablet", 768, 1024), ("desktop", 1280, 900)]
DIFF_THRESHOLD = 0.02  # ≤2% of pixels may differ (font hinting, antialias)


def pixel_diff_ratio(a: Path, b: Path, diff_out: Path | None = None) -> float:
    ia = Image.open(a).convert("RGB")
    ib = Image.open(b).convert("RGB")
    if ia.size != ib.size:
        return 1.0
    diff = ImageChops.difference(ia, ib)
    bbox = diff.getbbox()
    if not bbox:
        return 0.0
    total = ia.size[0] * ia.size[1]
    changed = sum(1 for px in diff.getdata() if px != (0, 0, 0))
    if diff_out is not None:
        # Amplify diff for human review
        amp = Image.eval(diff, lambda v: min(255, v * 8))
        amp.save(diff_out)
    return changed / total


async def capture(page, name: str, w: int, h: int) -> Path:
    await page.set_viewport_size({"width": w, "height": h})
    await page.goto("http://localhost:8080/todos", wait_until="domcontentloaded")
    await page.wait_for_timeout(900)
    # Crop to the bottom strip where FAB + composer live
    path = OUT / f"{name}.png"
    await page.screenshot(path=str(path), clip={"x": 0, "y": max(0, h - 220), "width": w, "height": 220})
    return path


async def main():
    update = os.environ.get("UPDATE_BASELINE") == "1"
    failures = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context()
        page = await ctx.new_page()
        for label, w, h in VIEWPORTS:
            shot = await capture(page, label, w, h)
            baseline = BASE / f"{label}.png"
            if update or not baseline.exists():
                baseline.write_bytes(shot.read_bytes())
                print(f"[{label}] baseline {'updated' if update else 'created'}")
                continue
            diff_path = OUT / f"{label}.diff.png"
            ratio = pixel_diff_ratio(baseline, shot, diff_path)
            status = "PASS" if ratio <= DIFF_THRESHOLD else "FAIL"
            print(f"[{label}] diff={ratio:.4f} threshold={DIFF_THRESHOLD} → {status}  (diff={diff_path})")
            if status == "FAIL":
                failures.append((label, ratio))
        await browser.close()
    if failures:
        print("\nFAIL:", failures)
        sys.exit(1)
    print("\nPASS: visual baselines match")


asyncio.run(main())
