import { Toaster } from "@kiftet/ui/components/sonner";
import {
	isRouteErrorResponse,
	Links,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration,
} from "react-router";

import "./index.css";
import type { Route } from "./+types/root";
import Header from "./components/header";
import { ThemeProvider } from "./components/theme-provider";

export const links: Route.LinksFunction = () => [
	{ rel: "icon", href: "/logo-mark.svg", type: "image/svg+xml" },
	{ rel: "icon", href: "/favicon.ico", sizes: "32x32" },
	// The brand: an open ring with a question inside. Never stale — keep this
	// file in sync with what the client signs off as the logo.
	{ rel: "apple-touch-icon", href: "/apple-touch-icon-180x180.png" },
	{ rel: "preconnect", href: "https://fonts.googleapis.com" },
	{
		rel: "preconnect",
		href: "https://fonts.gstatic.com",
		crossOrigin: "anonymous",
	},
	{
		rel: "stylesheet",
		// Constrained on purpose — weak wifi has no budget for fonts nobody
		// uses. Fraunces + Inter load variable but only in the ranges that
		// actually appear (400–700, no italics); Ethiopic stays in the same
		// sheet, and Google's unicode-range means its WOFF2 only downloads
		// once an Amharic glyph shows up on screen.
		href: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400..700&family=Inter:wght@400..700&family=Noto+Sans+Ethiopic:wght@400..700&display=swap",
	},
];

// Site-wide metadata. This is the shared "name, slogan, logo" set — landing,
// OG/Twitter previews, and the iOS/Android home-screen label all inherit it;
// individual routes override only title + description.
export function meta(): ReturnType<Route.MetaFunction> {
	// og:image must be an absolute URL or social platforms refuse to render
	// the preview. VITE_SITE_URL (e.g. https://app.kiftet.com) turns the
	// relative path into one; devs without it get the relative fallback.
	const siteUrl = (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(
		/\/$/,
		"",
	);
	const logoUrl = siteUrl ? `${siteUrl}/logo-mark.png` : "/logo-mark.png";
	return [
		{ title: "Kiftet — Close the gap" },
		{ name: "application-name", content: "Kiftet" },
		{ name: "apple-mobile-web-app-title", content: "Kiftet" },
		{
			name: "description",
			content:
				"Kiftet listens to what you remember, catches the concepts that didn't stick, and teaches only those — spoken, calm, and built for Ethiopia's national exam.",
		},
		{ name: "theme-color", content: "#1B2340" },
		{ property: "og:type", content: "website" },
		{
			property: "og:site_name",
			content: "Kiftet — Close the gap",
		},
		{
			property: "og:title",
			content: "Kiftet — Close the gap",
		},
		{
			property: "og:description",
			content:
				"Kiftet listens to what you remember, catches the concepts that didn't stick, and teaches only those — spoken, calm, and built for Ethiopia's national exam.",
		},
		{
			property: "og:image",
			content: logoUrl,
		},
		{
			property: "og:image:alt",
			content: "Kiftet — an open ring and a question mark",
		},
		{ property: "og:image:width", content: "512" },
		{ property: "og:image:height", content: "512" },
		{ name: "twitter:card", content: "summary" },
		{ name: "twitter:title", content: "Kiftet — Close the gap" },
		{
			name: "twitter:description",
			content:
				"Kiftet listens to what you remember, catches the concepts that didn't stick, and teaches only those.",
		},
		{ name: "twitter:image", content: logoUrl },
		{ name: "robots", content: "index, follow" },
	];
}

export function Layout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<link rel="manifest" href="/manifest.webmanifest" />
				<script src="/registerSW.js" defer />

				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<meta name="format-detection" content="telephone=no" />
				{/* iOS Home Screen: give the installed app the brand name and a
				    dark status bar instead of the page title. */}
				<meta name="mobile-web-app-capable" content="yes" />
				<meta name="apple-mobile-web-app-capable" content="yes" />
				<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
				<script
					dangerouslySetInnerHTML={{
						__html: `(function(){try{var t=localStorage.getItem("kiftet-theme")||"dark";var c=["light","forest","dark","gold"];if(c.indexOf(t)<0)t="dark";document.documentElement.className=t;}catch(e){document.documentElement.className="dark"}})()`,
					}}
				/>
				<Meta />
				<Links />
			</head>
			<body>
				<a
					href="#main-content"
					className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-foreground"
				>
					Skip to content
				</a>
				{children}
				<ScrollRestoration />
				<Scripts />
			</body>
		</html>
	);
}

export default function App() {
	return (
		<ThemeProvider
			attribute="class"
			defaultTheme="dark"
			disableTransitionOnChange
			storageKey="kiftet-theme"
			themes={["light", "forest", "dark", "gold"]}
		>
			<div className="flex min-h-dvh flex-col">
				<Header />
				<div id="main-content" className="flex-1" tabIndex={-1}>
					<Outlet />
				</div>
			</div>
			<Toaster richColors />
		</ThemeProvider>
	);
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
	let message = "Oops!";
	let details = "An unexpected error occurred.";
	let stack: string | undefined;
	if (isRouteErrorResponse(error)) {
		message = error.status === 404 ? "404" : "Error";
		details =
			error.status === 404
				? "The requested page could not be found."
				: error.statusText || details;
	} else if (import.meta.env.DEV && error && error instanceof Error) {
		details = error.message;
		stack = error.stack;
	}
	return (
		<main className="container mx-auto p-4 pt-16">
			<h1>{message}</h1>
			<p>{details}</p>
			{stack && (
				<pre className="w-full overflow-x-auto p-4">
					<code>{stack}</code>
				</pre>
			)}
		</main>
	);
}
