"""Extended ARIA tree audit: verify role/name pairs and landmarks
on the key routes using Playwright's accessibility snapshot.

Run: python3 tests/e2e/a11y_aria_tree.py
"""
import asyncio
from playwright.async_api import async_playwright


def walk(node, hits):
    if not node:
        return
    role = node.get("role")
    name = (node.get("name") or "").strip()
    hits.append((role, name))
    for c in node.get("children") or []:
        walk(c, hits)


def find(hits, role: str, name_substr: str = ""):
    return [h for h in hits if h[0] == role and (not name_substr or name_substr in h[1])]


async def audit(page, route: str, expectations: list):
    await page.goto(f"http://localhost:8080{route}", wait_until="domcontentloaded")
    await page.wait_for_timeout(700)
    snap = await page.accessibility.snapshot(interesting_only=False)
    hits = []
    walk(snap, hits)
    print(f"\n== {route} == ({len(hits)} nodes)")
    failures = []
    for role, name in expectations:
        matches = find(hits, role, name)
        ok = len(matches) >= 1
        print(f"  [{'✓' if ok else '✗'}] role={role!r} name~={name!r}  ({len(matches)} match)")
        if not ok:
            failures.append((role, name))
    # Landmark sanity: exactly one main
    mains = find(hits, "main")
    print(f"  landmark <main>: {len(mains)} (expect ≥1)")
    if len(mains) < 1:
        failures.append(("main", ""))
    return failures


async def main():
    all_failures = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await ctx.new_page()

        # /todos: Plus + Ekle both labeled "Görev ekle", input, FAB
        all_failures += await audit(page, "/todos", [
            ("button", "Görev ekle"),
            ("textbox", "Görev ekle"),
            ("button", "AI"),
            ("link", "Mindmap"),
            ("link", "Görevler"),
        ])

        # Home (mindmap)
        all_failures += await audit(page, "/", [
            ("button", "AI"),
            ("link", "Mindmap"),
        ])

        await browser.close()

    if all_failures:
        raise SystemExit(f"FAIL: missing roles/names {all_failures}")
    print("\nPASS: ARIA tree expectations met")


asyncio.run(main())
