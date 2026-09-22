import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import { type Language, type MessageKey, t as translate } from "@/lib/messages";

export const LANGUAGE_STORAGE_KEY = "kiftet-language";

type LanguageContextValue = {
	lang: Language;
	setLang: (lang: Language) => void;
	t: (key: MessageKey, params?: Record<string, string | number>) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function readStored(): Language {
	if (typeof window === "undefined") return "en";
	try {
		return window.localStorage.getItem(LANGUAGE_STORAGE_KEY) === "am"
			? "am"
			: "en";
	} catch {
		return "en";
	}
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
	const [lang, setLangState] = useState<Language>(readStored);

	useEffect(() => {
		document.documentElement.lang = lang;
	}, [lang]);

	const setLang = useCallback((next: Language) => {
		setLangState(next);
		try {
			window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
		} catch {
			// Storage can be unavailable (private mode) — the pref just won't
			// survive a reload; the UI still switches for this visit.
		}
		document.documentElement.lang = next;
	}, []);

	const value = useMemo<LanguageContextValue>(
		() => ({
			lang,
			setLang,
			t: (key, params) => translate(lang, key, params),
		}),
		[lang, setLang],
	);

	return (
		<LanguageContext.Provider value={value}>
			{children}
		</LanguageContext.Provider>
	);
}

export function useLanguage(): LanguageContextValue {
	const ctx = useContext(LanguageContext);
	if (!ctx) {
		// Every consuming surface sits under <LanguageProvider> in root.tsx; the
		// fallback keeps a shared component safe even if it is ever rendered
		// outside the app tree (storybooks, previews).
		return {
			lang: "en",
			setLang: () => {},
			t: (k, p) => translate("en", k, p),
		};
	}
	return ctx;
}
