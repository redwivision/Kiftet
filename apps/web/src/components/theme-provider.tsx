import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import * as React from "react";

/* The browser chrome around the app is part of the room. A static theme-color
   left the Android status bar true-black even in the light "Manuscript" room,
   which is the one place a student would notice a seam between the app and
   everything the OS draws around it. Each room publishes its own ground here
   and the meta tag follows the active one. */
const ROOM_CHROME: Record<string, string> = {
	dark: "#0a0b0d",
	ember: "#120d08",
	jade: "#0a1410",
	violet: "#110d1c",
	ochre: "#131009",
	midnight: "#0b0d18",
	meadow: "#0b130d",
	copper: "#140d0a",
	light: "#f6f1e6",
};

function useRoomChrome(theme: string | undefined) {
	React.useEffect(() => {
		const colour = ROOM_CHROME[theme ?? ""];
		if (!colour) return;
		// Two tags: the modern name, plus the legacy one iOS still reads.
		for (const name of ["theme-color", "msapplication-TileColor"]) {
			let tag = document.querySelector(`meta[name="${name}"]`);
			if (!tag) {
				tag = document.createElement("meta");
				tag.setAttribute("name", name);
				document.head.appendChild(tag);
			}
			tag.setAttribute("content", colour);
		}
	}, [theme]);
}

export function ThemeProvider({
	children,
	...props
}: React.ComponentProps<typeof NextThemesProvider>) {
	return (
		<NextThemesProvider {...props}>
			<RoomChrome />
			{children}
		</NextThemesProvider>
	);
}

/* Split out so it can read the theme from the context its own parent provides. */
function RoomChrome() {
	const { theme } = useTheme();
	useRoomChrome(theme);
	return null;
}

export { useTheme };
