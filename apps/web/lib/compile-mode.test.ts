import { describe, expect, it } from "vitest";
import { shouldUseAsyncCompileByDefault } from "./compile-mode";

describe("shouldUseAsyncCompileByDefault", () => {
  it("uses async when explicitly enabled", () => {
    expect(
      shouldUseAsyncCompileByDefault({
        apiUrl: "http://localhost:4000",
        envValue: "true"
      })
    ).toBe(true);
  });

  it("keeps local development on sync by default", () => {
    expect(
      shouldUseAsyncCompileByDefault({
        apiUrl: "http://localhost:4000",
        envValue: "false"
      })
    ).toBe(false);
    expect(
      shouldUseAsyncCompileByDefault({
        apiUrl: "http://127.0.0.1:4000"
      })
    ).toBe(false);
  });

  it("defaults hosted api targets to async even if the env toggle is stale", () => {
    expect(
      shouldUseAsyncCompileByDefault({
        apiUrl: "https://socialapp1-c83bcf63dc0d.herokuapp.com",
        envValue: "false"
      })
    ).toBe(true);
    expect(
      shouldUseAsyncCompileByDefault({
        apiUrl: "https://briefly-api.example.com"
      })
    ).toBe(true);
  });
});
