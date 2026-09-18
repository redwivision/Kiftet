import { ENV as env } from "./env";
import { migrateDb } from "./index";

await migrateDb(env);
console.log("[kiftet:db] migrations applied");

export {};