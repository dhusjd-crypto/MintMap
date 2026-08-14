# Voice Capture

Voice uses a platform-independent adapter. The browser adapter requests permission only after an explicit action, prefers `tr-TR`, sends its transcript through the same deterministic text parser and does not retain raw audio. Unsupported browsers show a capability error rather than pretending capture succeeded.
