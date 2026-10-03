import "varlock/auto-load";
import { ENV } from "./env";

export { ENV } from "./env";

const env = new Proxy(ENV, {
  get(target, prop, receiver) {
    if (typeof prop === "string") {
      const raw = process.env[prop];
      if (raw !== undefined && raw !== "") return raw;
      try {
        const val = Reflect.get(target, prop, receiver);
        if (val !== undefined && val !== "") return val;
      } catch {
        return undefined;
      }
      return undefined;
    }
    try {
      return Reflect.get(target, prop, receiver);
    } catch {
      return undefined;
    }
  },
});

export { env };
