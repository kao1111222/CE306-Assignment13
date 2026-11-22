import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";

export type Role = "STUDENT" | "STAFF" | "ADMIN";
export interface AuthUser {
  id: string;
  role: Role;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me";

export function signToken(user: AuthUser) {
  return jwt.sign(user, SECRET, { expiresIn: "8h" });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "กรุณาเข้าสู่ระบบ" });
  }
  try {
    const payload = jwt.verify(header.slice(7), SECRET) as AuthUser;
    req.user = { id: payload.id, role: payload.role };
    next();
  } catch {
    res.status(401).json({ error: "Token ไม่ถูกต้องหรือหมดอายุ" });
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "ไม่มีสิทธิ์ใช้งานส่วนนี้" });
    }
    next();
  };
}
