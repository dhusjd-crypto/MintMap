import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";

export const Route = createFileRoute("/unlock")({
  head: () => ({
    meta: [
      { title: "Oturum açın" },
      { name: "description", content: "Devam etmek için oturum açın." },
    ],
  }),
  component: UnlockPage,
});

function UnlockPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (username.trim() === "mint" && password === "mint") {
      setError(false);
      try {
        sessionStorage.setItem("mintmap:unlocked", "1");
      } catch {
        // ignore
      }
      void router.navigate({ to: "/" });
    } else {
      setError(true);
    }
  }

  function handleCancel() {
    setUsername("");
    setPassword("");
    void router.history.back();
  }

  return (
    <main className="flex min-h-dvh w-full items-start justify-center bg-white px-4 pt-16 sm:pt-24">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-xl bg-white p-7 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.18),0_2px_6px_-2px_rgba(0,0,0,0.08)] ring-1 ring-black/5"
      >
        <h1 className="text-[22px] font-semibold leading-tight text-[#1a1a1a]">
          Oturum açın
        </h1>
        <p className="mt-1 text-[13px] text-[#4a4a4a]">
          https://sales.mintyapi.com
        </p>

        <div className="mt-6 space-y-4">
          <div className="grid grid-cols-[110px_1fr] items-center gap-3">
            <label
              htmlFor="username"
              className="text-[13px] text-[#1a1a1a]"
            >
              Kullanıcı adı
            </label>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="h-9 w-full rounded-md border border-[#d4d4d4] bg-white px-2 text-[14px] text-[#1a1a1a] outline-none focus:border-[#8a5a2b] focus:ring-2 focus:ring-[#8a5a2b]/30"
            />
          </div>

          <div className="grid grid-cols-[110px_1fr] items-center gap-3">
            <label
              htmlFor="password"
              className="text-[13px] text-[#1a1a1a]"
            >
              Şifre
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-9 w-full rounded-md border border-[#d4d4d4] bg-white px-2 text-[14px] text-[#1a1a1a] outline-none focus:border-[#8a5a2b] focus:ring-2 focus:ring-[#8a5a2b]/30"
            />
          </div>
        </div>

        {error && (
          <p className="mt-3 text-[13px] text-red-600">
            Kullanıcı adı veya şifre hatalı.
          </p>
        )}

        <div className="mt-7 flex items-center justify-end gap-3">
          <button
            type="submit"
            className="h-10 rounded-full bg-[#8a5a1f] px-6 text-[14px] font-semibold text-white shadow-sm transition-colors hover:bg-[#73491a] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8a5a1f]/40"
          >
            Oturum açın
          </button>
          <button
            type="button"
            onClick={handleCancel}
            className="h-10 rounded-full bg-[#f3c98a] px-6 text-[14px] font-semibold text-[#5a3a12] transition-colors hover:bg-[#ecbb6d] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f3c98a]/60"
          >
            İptal
          </button>
        </div>
      </form>
    </main>
  );
}
