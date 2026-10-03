import { describe, expect, it } from "bun:test";
import { resolveBrowserServerRoot } from "./server-url";

describe("resolveBrowserServerRoot", () => {
  it("uses a configured LAN API URL from a phone or other remote host", () => {
    expect(
      resolveBrowserServerRoot(
        "192.168.1.42",
        "http://192.168.1.42:5173",
        "http://192.168.1.5:3000",
      ),
    ).toBe("http://192.168.1.5:3000");
  });

  it("does not send a remote browser to its own localhost", () => {
    expect(
      resolveBrowserServerRoot(
        "192.168.1.42",
        "http://192.168.1.42:5173",
        "http://localhost:3000",
      ),
    ).toBe("http://192.168.1.42:5173");
  });

  it("uses localhost configuration on the development machine", () => {
    expect(
      resolveBrowserServerRoot(
        "localhost",
        "http://localhost:5173",
        "http://localhost:3000/api",
      ),
    ).toBe("http://localhost:3000");
  });
});
