// backend/src/routes/auth.ts
import { Router } from "express";
import { z } from "zod";
import jwt from "jsonwebtoken";

const router = Router();

const schema = z.object({
  username: z.string().min(3),
  password: z.string().min(3),
  otp: z.string().length(6),
});

const SECRET = process.env.JWT_SECRET || "dev_secret";
const ACCESS_TTL_MIN = Number(process.env.ACCESS_TTL_MIN || 15);   // 15m
const REFRESH_TTL_HOURS = Number(process.env.REFRESH_TTL_HOURS || 24); // 24h

router.post("/login", (req, res) => {
  const parse = schema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ code: "E003", message: "Invalid payload" });
  }
  const { username, password, otp } = parse.data;

  // Demo creds — change later
  if (!(username === "demo" && password === "Demo@123" && otp === "000000")) {
    return res.status(401).json({ code: "E001", message: "Incorrect username or password." });
  }

  const user = { id: "u_123", name: "Asha Verma", locale: "en-IN" };

  const accessToken = jwt.sign(user, SECRET, { expiresIn: `${ACCESS_TTL_MIN}m` });
  const refreshToken = jwt.sign({ sub: user.id, typ: "refresh" }, SECRET, { expiresIn: `${REFRESH_TTL_HOURS}h` });

  return res.json({ user, accessToken, refreshToken });
});

export const authRouter = router;
