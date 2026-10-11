import { useCallback, useRef, useState } from "react";

import {
  createVoiceClient,
  type VoiceClient,
  type VoiceState,
} from "@/lib/voice";

export function useVoiceSession() {
  const [client] = useState<VoiceClient>(() =>
    createVoiceClient({
      onTranscript: (text, isFinal) => {
        if (isFinal) {
          setTranscript((prev) => `${prev.trim()} ${text}`.trim());
          setInterim("");
        } else {
          setInterim(text);
        }
      },
      onStateChange: (state) => setState(state),
      onError: (message) => {
        setError(message);
        setState("idle");
      },
    }),
  );

  const [state, setState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const lastTranscriptRef = useRef("");

  const isSupported = client.supported;

  const start = useCallback(() => {
    setError(null);
    lastTranscriptRef.current = transcript;
    setTranscript("");
    client.startListening();
  }, [client, transcript]);

  const stop = useCallback(() => {
    client.stopListening();
  }, [client]);

  const cancel = useCallback(() => {
    client.cancelListening();
  }, [client]);

  /** Forget the current turn. Called when a capture window opens or closes so
   *  the next answer starts from a clean transcript, never the previous one. */
  const reset = useCallback(() => {
    setTranscript("");
    setInterim("");
    setError(null);
  }, []);

  const speak = useCallback(
    (text: string) => {
      setError(null);
      return client.speak(text);
    },
    [client],
  );

  const cancelSpeech = useCallback(() => {
    client.cancelSpeech();
  }, [client]);

  return {
    state,
    transcript,
    interim,
    error,
    isSupported,
    lastTranscript: lastTranscriptRef.current,
    start,
    stop,
    cancel,
    reset,
    speak,
    cancelSpeech,
  };
}
