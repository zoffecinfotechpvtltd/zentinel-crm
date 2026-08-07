import { describe, it, expect, vi } from "vitest";
import { requireRole, type AuthUser } from "../auth";

function mockRes() {
  const res: { statusCode?: number; body?: unknown; status: (c: number) => typeof res; json: (b: unknown) => typeof res } = {
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(body) {
      res.body = body;
      return res;
    },
  };
  return res;
}

function mockReq(user?: AuthUser) {
  return { user } as unknown as import("express").Request;
}

describe("requireRole", () => {
  it("401s when there's no authenticated user at all", () => {
    const res = mockRes();
    const next = vi.fn();
    requireRole("admin")(mockReq(undefined), res as unknown as import("express").Response, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("403s an authenticated user whose role isn't in the allowed list", () => {
    const res = mockRes();
    const next = vi.fn();
    const salesUser: AuthUser = { id: "u1", email: "rep@zoffec.com", name: "Rep", role: "sales" };
    requireRole("admin", "finance")(mockReq(salesUser), res as unknown as import("express").Response, next);
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: "forbidden" });
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next() for a role that IS in the allowed list, without touching the response", () => {
    const res = mockRes();
    const next = vi.fn();
    const adminUser: AuthUser = { id: "u2", email: "admin@zoffec.com", name: "Admin", role: "admin" };
    requireRole("admin", "finance")(mockReq(adminUser), res as unknown as import("express").Response, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBeUndefined();
  });

  it("allows any one of multiple permitted roles, not just the first", () => {
    const res = mockRes();
    const next = vi.fn();
    const financeUser: AuthUser = { id: "u3", email: "fin@zoffec.com", name: "Finance", role: "finance" };
    requireRole("admin", "finance")(mockReq(financeUser), res as unknown as import("express").Response, next);
    expect(next).toHaveBeenCalledOnce();
  });
});
