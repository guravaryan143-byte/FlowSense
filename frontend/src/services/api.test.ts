import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UNAUTHORIZED_EVENT, api, errorMessage, tokenStore, wsUrl } from "./api";

const response = (status: number, data: unknown) => ({ status, data, statusText: "", headers: {}, config: {} as InternalAxiosRequestConfig }) as AxiosResponse;

describe("errorMessage", () => {
  it("explains an unreachable server", () => expect(errorMessage(new AxiosError("Network Error", "ERR_NETWORK"))).toMatch(/cannot reach/i));
  it("explains a timeout", () => expect(errorMessage(new AxiosError("t", "ECONNABORTED"))).toMatch(/too long/i));
  it("uses the API's message", () => {
    const e = new AxiosError("x", "ERR_BAD_REQUEST", undefined, undefined, response(409, { error: "conflict", message: "Email already exists" }));
    expect(errorMessage(e)).toBe("Email already exists");
  });
  it("lists validation problems by field", () => {
    const e = new AxiosError("x", "ERR_BAD_REQUEST", undefined, undefined, response(422, { error: "validation_error", message: "Invalid request", details: [{ field: "email", message: "bad email" }] }));
    expect(errorMessage(e)).toBe("email: bad email");
  });
  it("falls back to the status code, and handles non-axios errors", () => {
    expect(errorMessage(new AxiosError("x", "ERR", undefined, undefined, response(500, "oops")))).toBe("Request failed (500).");
    expect(errorMessage(new Error("boom"))).toBe("boom");
    expect(errorMessage("weird")).toBe("Something went wrong.");
  });
});

describe("axios client", () => {
  beforeEach(() => localStorage.clear());
  const echoAuth = async (config: InternalAxiosRequestConfig) => ({ ...response(200, config.headers.get("Authorization")), config });

  it("sends the bearer token when signed in, and nothing when not", async () => {
    expect((await api.get("/x", { adapter: echoAuth })).data).toBeFalsy();
    tokenStore.set("abc123");
    expect((await api.get("/x", { adapter: echoAuth })).data).toBe("Bearer abc123");
  });

  it("a 401 clears the token and announces it (expired session)", async () => {
    tokenStore.set("expired");
    const heard = vi.fn();
    window.addEventListener(UNAUTHORIZED_EVENT, heard);
    const fail = async (config: InternalAxiosRequestConfig) => { throw new AxiosError("x", "ERR_BAD_REQUEST", config, undefined, response(401, {})); };
    await expect(api.get("/api/auth/me", { adapter: fail })).rejects.toBeTruthy();
    expect(tokenStore.get()).toBeNull();
    expect(heard).toHaveBeenCalledOnce();
    window.removeEventListener(UNAUTHORIZED_EVENT, heard);
  });

  it("a failed LOGIN (401) must not be treated as an expired session", async () => {
    tokenStore.set("still-valid");
    const heard = vi.fn();
    window.addEventListener(UNAUTHORIZED_EVENT, heard);
    const fail = async (config: InternalAxiosRequestConfig) => { throw new AxiosError("x", "ERR_BAD_REQUEST", config, undefined, response(401, {})); };
    await expect(api.post("/api/auth/login", {}, { adapter: fail })).rejects.toBeTruthy();
    expect(tokenStore.get()).toBe("still-valid");
    expect(heard).not.toHaveBeenCalled();
    window.removeEventListener(UNAUTHORIZED_EVENT, heard);
  });

  it("builds the WebSocket URL from the page origin", () => expect(wsUrl()).toMatch(/^wss?:\/\/[^/]+\/ws\/traffic$/));

  it("survives blocked storage", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(tokenStore.get()).toBeNull();
    spy.mockRestore();
  });
});
