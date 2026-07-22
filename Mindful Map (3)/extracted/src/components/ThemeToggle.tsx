import { Moon, Sun, Leaf } from "lucide-react";
import { useTheme } from "@/lib/theme";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const next =
    theme === "light" ? "Mint tema" : theme === "mint" ? "Karanlık tema" : "Aydınlık tema";
  return (
    <button
      onClick={toggle}
      onPointerDown={(e) => e.stopPropagation()}
      aria-label={next}
      title={`Tema: ${theme} → ${next}`}
      className={`flex h-9 w-9 items-center justify-center rounded-full bg-card shadow-soft ${className}`}
    >
      {theme === "dark" ? (
        <Sun className="h-4 w-4" />
      ) : theme === "mint" ? (
        <Moon className="h-4 w-4" />
      ) : (
        <Leaf className="h-4 w-4 text-[#00C7A7]" />
      )}
    </button>
  );
}
