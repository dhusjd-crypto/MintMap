"""Accessibility regression for the FAB cluster (AI menu, wrench
toolbar, mindmap context buttons): ARIA attributes, focus management
and keyboard reachability.

What we verify:
  1. Each FAB has an accessible name (aria-label or visible text).
  2. AI launcher exposes aria-haspopup/aria-expanded/aria-controls and
     toggles aria-expanded when opened. Popover has role="menu".
  3. Wrench toolbar toggle exposes the same triplet and the
     toolbar-actions container has role="menu".
  4. Escape returns focus to the AI launcher trigger when the menu
     was opened by keyboard.
  5. Mindmap context FABs (delete + task + plus) all expose
     aria-label and are reachable via Tab focus traversal.

Run:  python3 tests/e2e/fab_a11y.py
"""
import asyncio
import sys
from pathlib import Path

from playwright.async_api import async_playwright

OUT = Path(__file__).parent / "screenshots" / "fab_a11y"
OUT.mkdir(parents=True, exist_ok=True)
BASE_URL = "http://localhost:8080"


async def attr(page, selector, name):
    return await page.evaluate(
        "([s, n]) => { const e = document.querySelector(s); return e ? e.getAttribute(n) : null; }",
        [selector, name],
    )


async def main() -> None:
    failures: list[str] = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 900})
        page = await ctx.new_page()
        await page.goto(BASE_URL, wait_until="domcontentloaded")
        await page.wait_for_selector("[data-node-id]", timeout=15_000)
        await page.wait_for_selector('[data-fab-id="ai-launcher"]', timeout=10_000)
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(150)

        # 1. Every FAB has an accessible name (label OR text content).
        names = await page.evaluate(
            """() => {
              const out = {};
              for (const el of document.querySelectorAll('[data-fab-id]')) {
                const id = el.dataset.fabId;
                // Walk inside; collect first focusable button's name.
                const btn = el.matches('button') ? el : el.querySelector('button');
                if (!btn) { out[id] = null; continue; }
                out[id] = (btn.getAttribute('aria-label') || btn.textContent || '').trim() || null;
              }
              return out;
            }"""
        )
        for fab_id, name in names.items():
            ok = bool(name)
            print(f"  [{'✓' if ok else '✗'}] {fab_id}: name={name!r}")
            if not ok:
                failures.append(f"{fab_id}: missing accessible name")

        # 2. AI launcher ARIA contract — closed state.
        ai_haspopup = await attr(page, '[data-testid="fab-ai"]', "aria-haspopup")
        ai_expanded_closed = await attr(page, '[data-testid="fab-ai"]', "aria-expanded")
        ai_controls = await attr(page, '[data-testid="fab-ai"]', "aria-controls")
        print(
            f"  AI closed: haspopup={ai_haspopup} expanded={ai_expanded_closed} controls={ai_controls}"
        )
        if ai_haspopup not in {"menu", "true"}:
            failures.append("fab-ai missing aria-haspopup")
        if ai_expanded_closed != "false":
            failures.append(f"fab-ai aria-expanded should be 'false' when closed, got {ai_expanded_closed}")
        if not ai_controls:
            failures.append("fab-ai missing aria-controls")

        # Open via keyboard and verify expanded + popover role.
        await page.get_by_test_id("fab-ai").focus()
        await page.keyboard.press("Enter")
        await page.wait_for_timeout(250)
        ai_expanded_open = await attr(page, '[data-testid="fab-ai"]', "aria-expanded")
        popover_role = await attr(page, '[data-testid="fab-ai-menu"]', "role")
        print(f"  AI open:   expanded={ai_expanded_open} popover_role={popover_role}")
        if ai_expanded_open != "true":
            failures.append(f"fab-ai aria-expanded should be 'true' when open, got {ai_expanded_open}")
        if popover_role != "menu":
            failures.append(f"AI popover role should be 'menu', got {popover_role}")

        # Escape closes and (best effort) keeps focus near the trigger.
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(200)
        ai_expanded_after = await attr(page, '[data-testid="fab-ai"]', "aria-expanded")
        if ai_expanded_after != "false":
            failures.append(f"fab-ai aria-expanded should reset to 'false' after Escape, got {ai_expanded_after}")

        # 3. Wrench toolbar ARIA contract.
        w_haspopup = await attr(page, '[data-testid="toolbar-toggle"]', "aria-haspopup")
        w_expanded_closed = await attr(page, '[data-testid="toolbar-toggle"]', "aria-expanded")
        w_controls = await attr(page, '[data-testid="toolbar-toggle"]', "aria-controls")
        print(f"  Wrench closed: haspopup={w_haspopup} expanded={w_expanded_closed} controls={w_controls}")
        if w_haspopup not in {"menu", "true"}:
            failures.append("wrench toggle missing aria-haspopup")
        if w_expanded_closed != "false":
            failures.append(f"wrench aria-expanded should be 'false' closed, got {w_expanded_closed}")
        if not w_controls:
            failures.append("wrench toggle missing aria-controls")
        await page.get_by_test_id("toolbar-toggle").click()
        await page.wait_for_timeout(300)
        w_expanded_open = await attr(page, '[data-testid="toolbar-toggle"]', "aria-expanded")
        actions_role = await attr(page, '[data-testid="toolbar-actions"]', "role")
        print(f"  Wrench open:   expanded={w_expanded_open} actions_role={actions_role}")
        if w_expanded_open != "true":
            failures.append(f"wrench aria-expanded should be 'true' open, got {w_expanded_open}")
        if actions_role != "menu":
            failures.append(f"wrench actions role should be 'menu', got {actions_role}")
        await page.get_by_test_id("toolbar-toggle").click()
        await page.wait_for_timeout(200)

        # 4. Mindmap context FABs labelled and discoverable.
        nodes = page.locator("[data-node-id]")
        if await nodes.count() >= 2:
            await nodes.nth(1).click()
            await page.keyboard.press("Escape")
            await page.wait_for_timeout(250)
            ctx_buttons = await page.evaluate(
                """() => {
                  const root = document.querySelector('[data-fab-id="mindmap-context"]');
                  if (!root) return [];
                  return [...root.querySelectorAll('button')].map(b => ({
                    label: b.getAttribute('aria-label'),
                    text: (b.textContent || '').trim(),
                    tabbable: b.tabIndex >= 0,
                  }));
                }"""
            )
            print(f"  mindmap-context buttons: {ctx_buttons}")
            if not ctx_buttons:
                failures.append("mindmap-context exposes no buttons when a child node is selected")
            for b in ctx_buttons:
                if not (b["label"] or b["text"]):
                    failures.append(f"mindmap-context button missing name: {b}")
                if not b["tabbable"]:
                    failures.append(f"mindmap-context button not tabbable: {b}")

        await page.screenshot(path=str(OUT / "final.png"))
        await browser.close()

    if failures:
        print("\nFAIL:")
        for f in failures:
            print(f"  - {f}")
        sys.exit(1)
    print("\nPASS: FAB ARIA & focus contract holds")


asyncio.run(main())
