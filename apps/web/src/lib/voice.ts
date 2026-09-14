export type VoiceState = "idle" | "listening" | "thinking" | "speaking";

export type VoiceCallbacks = {
  onTranscript?: (text: string, isFinal: boolean) => void;
  onStateChange?: (state: VoiceState) => void;
  onError?: (message: string) => void;
};

export interface VoiceClient {
  readonly supported: boolean;
  startListening(): void;
  stopListening(): void;
  cancelListening(): void;
  speak(text: string): Promise<void>;
  cancelSpeech(): void;
}

// The product's voice contract (Voxide). Everything in the app talks to this
// interface, never to a vendor directly — see docs/HOW_IT_WORKS.md §5 "sep of concerns".
export function createVoiceClient(callbacks: VoiceCallbacks = {}): VoiceClient {
  if (typeof window === "undefined") return new NoopVoiceClient(false, "");
  return hasWebSpeech()
    ? new WebSpeechVoiceClient(callbacks)
    : new NoopVoiceClient(false, "Speech recognition is not supported in this browser.");
}

function hasWebSpeech(): boolean {
  const w = window as unknown as Record<string, unknown>;
  return Boolean(
    (w.SpeechRecognition || w.webkitSpeechRecognition) && w.speechSynthesis,
  );
}

const VOICE_ERRORS: Record<string, string> = {
  "not-allowed": "Microphone permission was denied. Allow access in your browser.",
  "no-speech": "No speech was detected. Try speaking closer to the mic.",
  network: "Speech service failed on the network. Check your connection.",
  aborted: "Recording was cancelled.",
  "audio-capture": "No microphone was detected.",
};

function describeError(code: string): string {
  return VOICE_ERRORS[code] ?? `Speech recognition failed (${code}).`;
}

class WebSpeechVoiceClient implements VoiceClient {
  readonly supported = true;

  private readonly recognition: {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    start: () => void;
    stop: () => void;
    abort: () => void;
    onresult: (event: any) => void;
    onerror: (event: any) => void;
    onend: () => void;
  };
  private readonly callbacks: VoiceCallbacks;

  private accumulating = false;
  private spokenTranscript = "";

  constructor(callbacks: VoiceCallbacks) {
    this.callbacks = callbacks;
    const w = window as unknown as Record<string, any>;
    const SpeechRecognition = w.SpeechRecognition || w.webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();
    this.recognition.lang = "en-US";
    this.recognition.continuous = true;
    this.recognition.interimResults = true;

    this.recognition.onresult = (event: any) => {
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) {
          this.spokenTranscript = (this.spokenTranscript + " " + text).trim();
          this.callbacks.onTranscript?.(text, true);
        } else {
          interimText += text;
        }
      }
      if (interimText) this.callbacks.onTranscript?.(interimText, false);
    };

    this.recognition.onerror = (event: any) => {
      this.accumulating = false;
      this.callbacks.onError?.(describeError(event.error ?? "unknown"));
      this.callbacks.onStateChange?.("idle");
    };

    this.recognition.onend = () => {
      this.accumulating = false;
      if (this.spokenTranscript.trim()) {
        this.callbacks.onTranscript?.(this.spokenTranscript.trim(), true);
        this.spokenTranscript = "";
      }
      this.callbacks.onStateChange?.("idle");
    };
  }

  startListening(): void {
    if (this.accumulating) return;
    this.accumulating = true;
    this.spokenTranscript = "";
    this.callbacks.onStateChange?.("listening");
    try {
      this.recognition.start();
    } catch {
      this.accumulating = false;
    }
  }

  stopListening(): void {
    if (!this.accumulating) return;
    this.accumulating = false;
    this.callbacks.onStateChange?.("thinking");
    this.recognition.stop();
  }

  cancelListening(): void {
    this.accumulating = false;
    this.recognition.abort();
  }

  async speak(text: string): Promise<void> {
    const synth = window.speechSynthesis;
    if (!synth) {
      this.callbacks.onError?.("Text-to-speech is not supported in this browser.");
      return;
    }
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    this.callbacks.onStateChange?.("speaking");
    await new Promise<void>((resolve) => {
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      synth.speak(utterance);
    });
    this.callbacks.onStateChange?.("idle");
  }

  cancelSpeech(): void {
    window.speechSynthesis?.cancel();
    this.callbacks.onStateChange?.("idle");
  }
}

class NoopVoiceClient implements VoiceClient {
  readonly supported: boolean;

  constructor(supported: boolean, private readonly reason: string) {
    this.supported = supported;
  }

  startListening(): void {}
  stopListening(): void {}
  cancelListening(): void {}
  async speak(): Promise<void> {}
  cancelSpeech(): void {}
}