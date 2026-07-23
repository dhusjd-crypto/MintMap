import { useEffect, type RefObject } from "react";

type MaybeRef = RefObject<HTMLElement | null>;

export function useClickOutside(
  refs: MaybeRef | MaybeRef[],
  onOutside: (event: PointerEvent) => void,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) return;
    const list = Array.isArray(refs) ? refs : [refs];

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const inside = list.some((ref) => {
        const node = ref.current;
        return node ? node.contains(target) : false;
      });
      if (!inside) onOutside(event);
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [enabled, onOutside, refs]);
}
