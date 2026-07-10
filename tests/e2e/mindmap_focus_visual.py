"""Visual regression for mindmap focus rings across viewports.
Selects the root, screenshots just the canvas region, diffs vs baseline.

Run:
  python3 tests/e2e/mindmap_focus_visual.py
  UPDATE_BASELINE=1 python3 tests/e2e/mindmap_focus_visual.py
"""
import asyncio, os, sys
from pathlib import Path
from playwright.async_api import async_playwright
from PIL import Image, ImageChops

ROOT = Path(__file__).parent
BASE = ROOT / "baselines" / "mindmap_focus"
OUT = ROOT / "screenshots" / "mindmap_focus"
BASE.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)

VIEWPORTS = [("mobile", 375, 800), ("tablet", 768, 1024), ("desktop", 1280, 900)]
DIFF_THRESHOLD = 0.10  # focus rings + spring animation can settle slightly differently


def diff_ratio(a: Path, b: Path, diff_out: Path) -> float:
    ia = Image.open(a).convert("RGB")
    ib = Image.open(b).convert("RGB")
    if ia.size != ib.size:
        return 1.0
    d = ImageChops.difference(ia, ib)
    if not d.getbbox():
        return 0.0
    total = ia.size[0] * ia.size[1]
    changed = sum(1 for px in d.getdata() if px != (0, 0, 0))
    Image.eval(d, lambda v: min(255, v * 8)).save(diff_out)
    return changed / total


async def capture(page, name: str, w: int, h: int) -> Path:
    await page.set_viewport_size({"width": w, "height": h})
    await page.goto("http://localhost:8080/", wait_until="domcontentloaded")
    await page.wait_for_timeout(1500)
    tree = page.locator('[role=tree][aria-label=Mindmap]')
    await tree.wait_for(state="attached")
    await tree.focus()
    await page.keyboard.press("Home")
    await page.wait_for_timeout(800)
    # Capture the canvas region only
    box = await tree.bounding_box()
    assert box, "no bbox for tree"
    path = OUT / f"{name}.png"
    await page.screenshot(
        path=str(path),
        clip={
            "x": max(0, box["x"]),
            "y": max(0, box["y"]),
            "width": min(w - box["x"], box["width"]),
            "height": min(h - box["y"], box["height"]),
        },
    )
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
            diff = OUT / f"{label}.diff.png"
            ratio = diff_ratio(baseline, shot, diff)
            ok = ratio <= DIFF_THRESHOLD
            print(f"[{label}] diff={ratio:.4f} (≤{DIFF_THRESHOLD}) → {'PASS' if ok else 'FAIL'}  diff={diff}")
            if not ok:
                failures.append((label, ratio))
        await browser.close()
    if failures:
        print("\nFAIL:", failures)
        sys.exit(1)
    print("\nPASS: mindmap focus ring visual baselines match")


asyncio.run(main())
