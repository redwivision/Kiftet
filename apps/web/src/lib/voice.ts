export type VoiceState = "idle" | "listening" | "thinking" | "speaking";

// Browsers populate speechSynthesis voices asynchronously. Touch the list once
// on load so pickNaturalVoice has real voices by the time a read-back button
// is clicked.
if (typeof window !== "undefined" && "speechSynthesis" in window) {
	const synth = window.speechSynthesis;
	synth.getVoices();
	synth.addEventListener?.("voiceschanged", () => synth.getVoices());
}

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

// ── TTS cancellation token ───────────────────────────────────────
// Every new speakAloud call bumps speakToken so an in-flight chain
// stopped by cancel() or a subsequent read never advances.
let speakToken = 0;

export function stopReadingAloud(): void {
	speakToken += 1;
	if (typeof window === "undefined") return;
	const synth = window.speechSynthesis;
	if (!synth) return;
	synth.cancel();
	synth.resume?.();
}

// The product's voice contract. Everything in the app talks through this
// seam and never to a vendor directly — see docs/howItWorks/dataflow.md §5 "sep of
// concerns". speakAloud is the last-resort read-back, kept as an explicit
// option: the natural voice path is Voxide's agent (see speakViaVoxide), and
// the browser's speechSynthesis is only the fallback for "Read it to me".
export function speakAloud(
	text: string,
	onChunk?: (index: number) => void,
	onDone?: () => void,
): void {
	const synth = window.speechSynthesis;
	if (!synth) {
		onDone?.();
		return;
	}
	const token = ++speakToken;
	synth.cancel();
	synth.resume?.();

	const voice = pickNaturalVoice(synth);
	const chunks = chunkSentences(text);
	let i = 0;
	let finished = false;
	const finish = () => {
		if (finished) return;
		finished = true;
		synth.cancel();
		clearInterval(resumeTick);
		onDone?.();
	};

	// Chrome suspends speechSynthesis after cancel() or when the tab is
	// backgrounded; queued utterances never fire onend. A beat that calls
	// resume() while we are still in an active read keeps the queue alive.
	const resumeTick = setInterval(() => {
		if (token !== speakToken || finished) {
			clearInterval(resumeTick);
			return;
		}
		if (synth.paused) synth.resume?.();
	}, 5000);

	const next = () => {
		if (token !== speakToken) {
			finish();
			return;
		}
		const chunk = chunks[i];
		if (!chunk) {
			finish();
			return;
		}
		onChunk?.(i);
		i += 1;
		const u = new SpeechSynthesisUtterance(chunk);
		u.lang = voice?.lang ?? "en-US";
		u.voice = voice ?? null;
		u.rate = 0.97;
		u.onend = next;
		u.onerror = (e) => {
			if (token !== speakToken) {
				finish();
				return;
			}
			// "interrupted"/"canceled" come from synth.cancel() inside
			// stopReadingAloud or an overlapping read — the token already
			// invalidates the chain, so just stop here.
			if (e.error === "interrupted" || e.error === "canceled") return;
			// Other transient errors: advance to the next chunk and nudge
			// Chrome out of any paused state so the chain stays alive.
			synth.resume?.();
			next();
		};
		synth.speak(u);
		synth.resume?.();
	};
	if (chunks.length) next();
	else finish();
}

// Prefer the least robotic-sounding voices the browser ships (Google/Apple's
// neural voices on en locales), falling back to the platform default. The
// robotic voice is still available underneath — speechSynthesis is only ever
// invoked from explicit buttons, never automatically.
function pickNaturalVoice(synth: SpeechSynthesis): SpeechSynthesisVoice | null {
	const voices = synth.getVoices();
	if (!voices.length) return null;
	const preferred = [
		"google uk english female",
		"google us english",
		"samantha",
		"karen",
		"serena",
		"aria",
		"libby",
		"uygur",
		"daniel",
		"zira",
		"en-gb",
	];
	for (const name of preferred) {
		const hit = voices.find(
			(v) =>
				v.lang.toLowerCase().startsWith("en") && v.name.toLowerCase() === name,
		);
		if (hit) return hit;
	}
	const en = voices.find((v) => v.lang.toLowerCase() === "en-gb" && !v.default);
	if (en) return en;
	return voices.find((v) => v.lang.toLowerCase().startsWith("en")) ?? null;
}

// Chrome's speechSynthesis truncates long utterances and sometimes stops
// mid-sentence. Queueing short sentence-level chunks keeps the read-back
// from cutting off without finishing. Also exported so the lesson read-along
// can highlight the exact sentence currently being spoken.
export function splitSentences(text: string): string[] {
	const clean = text.replace(/\s+/g, " ").trim();
	if (!clean) return [];
	const sentences = clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [clean];
	const out: string[] = [];
	let buffer = "";
	for (const s of sentences) {
		if (buffer.length + s.length > 220 && buffer) {
			out.push(buffer.trim());
			buffer = "";
		}
		buffer += s;
	}
	if (buffer.trim()) out.push(buffer.trim());
	return out;
}

function chunkSentences(text: string): string[] {
	return splitSentences(text);
}

export function createVoiceClient(callbacks: VoiceCallbacks = {}): VoiceClient {
	if (typeof window === "undefined") return new NoopVoiceClient(false, "");
	return hasWebSpeech()
		? new WebSpeechVoiceClient(callbacks)
		: new NoopVoiceClient(
				false,
				"Speech recognition is not supported in this browser.",
			);
}

function hasWebSpeech(): boolean {
	const w = window as unknown as Record<string, unknown>;
	return Boolean(
		(w.SpeechRecognition || w.webkitSpeechRecognition) && w.speechSynthesis,
	);
}

const VOICE_ERRORS: Record<string, string> = {
	"not-allowed":
		"Microphone permission was denied. Allow access in your browser.",
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
					this.spokenTranscript = `${this.spokenTranscript} ${text}`.trim();
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
			this.callbacks.onError?.(
				"Text-to-speech is not supported in this browser.",
			);
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

	constructor(
		supported: boolean,
		private readonly reason: string,
	) {
		this.supported = supported;
	}

	startListening(): void {}
	stopListening(): void {}
	cancelListening(): void {}
	async speak(): Promise<void> {}
	cancelSpeech(): void {}
}
