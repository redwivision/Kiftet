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

// Container platforms often capture only one stream in the boot log — some
// surface just stderr (which is where node's crash drill prints), silently
// dropping stdout where these lines would normally land. Emit every probe
// line to BOTH streams so the block shows up no matter which one the runtime
// log viewer reads.
function emit(line: string): void {
	console.log(line);
	process.stderr.write(`${line}\n`);
}

export function logEnvProbe(): void {
	emit("[env-probe] ==================== start");
	const names = Object.keys(process.env).sort();
	const dbish = names.filter((name) =>
		/(DB|DATABASE|POSTGRES|PG|SQL|NEON|POOLER|CONNECTION)/i.test(name),
	);
	if (dbish.length === 0) {
		emit(
			"[env-probe] no database-related variables in the container env at all",
		);
	} else {
		emit(
			`[env-probe] database-related env keys in the container: ${dbish.join(", ")}`,
		);
	}
	for (const key of dbish) {
		const raw = process.env[key];
		if (/password|secret|token|key|pass\b/i.test(key)) {
			emit(`[env-probe] process.env.${key} = <set, hidden>`);
		} else {
			emit(`[env-probe] process.env.${key} = ${safeUrl(raw)}`);
		}
	}
	emit(
		`[env-probe] resolved app env DATABASE_URL = ${safeUrl(env.DATABASE_URL)}`,
	);
	emit(
		`[env-probe] resolved app env DATABASE_URL_DIRECT = ${safeUrl(env.DATABASE_URL_DIRECT)}`,
	);
	if (String(env.DATABASE_URL).includes("localhost:5432")) {
		emit(
			"[env-probe] WARNING: the app sees the localhost placeholder - no real database URL reached it",
		);
	} else {
		emit("[env-probe] OK: the app sees a real (non-placeholder) DATABASE_URL");
	}
	emit("[env-probe] ==================== end");
}
