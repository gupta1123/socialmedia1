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

  it("defaults local development to async jobs too", () => {
    expect(
      shouldUseAsyncCompileByDefault({
        apiUrl: "http://localhost:4000",
        envValue: "false"
      })
    ).toBe(true);
    expect(
      shouldUseAsyncCompileByDefault({
        apiUrl: "http://127.0.0.1:4000"
      })
    ).toBe(true);
  });

  it("keeps hosted api targets on async jobs", () => {
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
