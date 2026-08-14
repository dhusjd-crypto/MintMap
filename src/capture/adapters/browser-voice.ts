export type VoiceCaptureCapability = {
  supported: boolean;
  requiresPermission: boolean;
  supportsInterimResults: boolean;
  language: string;
};
export type VoiceCaptureAdapter = {
  capability(): VoiceCaptureCapability;
  start(onTranscript: (text: string) => void, onError: (message: string) => void): void;
  stop(): void;
};
type BrowserSpeech = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
};
export function createBrowserVoiceCapture(): VoiceCaptureAdapter {
  let recognition: BrowserSpeech | undefined;
  return {
    capability: () => ({
      supported:
        typeof window !== "undefined" &&
        ("SpeechRecognition" in window || "webkitSpeechRecognition" in window),
      requiresPermission: true,
      supportsInterimResults: true,
      language: "tr-TR",
    }),
    start(onTranscript, onError) {
      const ctor =
        (
          window as unknown as {
            SpeechRecognition?: new () => BrowserSpeech;
            webkitSpeechRecognition?: new () => BrowserSpeech;
          }
        ).SpeechRecognition ??
        (window as unknown as { webkitSpeechRecognition?: new () => BrowserSpeech })
          .webkitSpeechRecognition;
      if (!ctor) {
        onError("Tarayıcı sesli giriş desteği yok.");
        return;
      }
      recognition = new ctor();
      recognition.lang = "tr-TR";
      recognition.interimResults = false;
      recognition.continuous = false;
      recognition.onresult = (event) =>
        onTranscript(
          Array.from(event.results)
            .map((result) => result[0]?.transcript ?? "")
            .join(" "),
        );
      recognition.onerror = (event) => onError(event.error ?? "Sesli giriş başarısız.");
      recognition.start();
    },
    stop: () => recognition?.stop(),
  };
}
