import { env } from "./env.server";

function safeUrl(value: string | undefined): string {
	if (!value) return "<unset>";
	try {
		const u = new URL(value);
		return `${u.protocol}//***@${u.hostname}${u.port ? `:${u.port}` : ""}${u.pathname === "/" ? "" : u.pathname}`;
	} catch {
		return "<not-a-url>";
	}
}

export function logEnvProbe(): void {
	console.log("[env-probe] ==================== start");
	const names = Object.keys(process.env).sort();
	const dbish = names.filter((name) =>
		/(DB|DATABASE|POSTGRES|PG|SQL|NEON|POOLER|CONNECTION)/i.test(name),
	);
	if (dbish.length === 0) {
		console.log("[env-probe] no database-related variables in the container env at all");
	} else {
		console.log(`[env-probe] database-related env keys in the container: ${dbish.join(", ")}`);
	}
	for (const key of dbish) {
		const raw = process.env[key];
		if (/password|secret|token|key|pass\b/i.test(key)) {
			console.log(`[env-probe] process.env.${key} = <set, hidden>`);
		} else {
			console.log(`[env-probe] process.env.${key} = ${safeUrl(raw)}`);
		}
	}
	console.log(`[env-probe] resolved app env DATABASE_URL = ${safeUrl(env.DATABASE_URL)}`);
	console.log(`[env-probe] resolved app env DATABASE_URL_DIRECT = ${safeUrl(env.DATABASE_URL_DIRECT)}`);
	if (String(env.DATABASE_URL).includes("localhost:5432")) {
		console.log("[env-probe] WARNING: the app sees the localhost placeholder - no real database URL reached it");
	} else {
		console.log("[env-probe] OK: the app sees a real (non-placeholder) DATABASE_URL");
	}
	console.log("[env-probe] ==================== end");
}