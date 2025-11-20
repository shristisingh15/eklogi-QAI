import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface JwtUser {
  id: string;
  name: string;
  locale: string;
}

const ACCESS_TTL_MIN = Number(process.env.ACCESS_TTL_MIN || 15);
const REFRESH_TTL_HOURS = Number(process.env.REFRESH_TTL_HOURS || 24);
const SECRET = process.env.JWT_SECRET || "dev_secret";

export function signTokens(user: JwtUser) {
  const accessToken = jwt.sign(user, SECRET, { expiresIn: `${ACCESS_TTL_MIN}m` });
  const refreshToken = jwt.sign({ sub: user.id, typ: "refresh" }, SECRET, { expiresIn: `${REFRESH_TTL_HOURS}h` });
  return { accessToken, refreshToken };
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.header("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return res.status(401).json({ code: "E001", message: "Unauthorized" });
  }
  try {
    const token = auth.slice(7);
    (req as any).user = jwt.verify(token, SECRET) as JwtUser;
    next();
  } catch {
    return res.status(401).json({ code: "E001", message: "Unauthorized" });
  }
}
