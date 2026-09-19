import "varlock/auto-load";
import { ENV } from "./env";

export { ENV } from "./env";

const env = new Proxy(ENV, {
	get(target, prop, receiver) {
		if (typeof prop === "string") {
			const raw = process.env[prop];
			if (raw && raw.length > 0) return raw;
		}
		return Reflect.get(target, prop, receiver);
	},
});

export { env };