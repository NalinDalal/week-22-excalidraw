import { NextFunction, Request, Response } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { JWT_SECRET } from "@repo/backend-common/config";

export function middleware(req: Request, res: Response, next: NextFunction) {
  const token = req.headers["authorization"] ?? "";

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    if (typeof decoded === "string") {
      res.status(403).json({ message: "Unauthorized" });
      return;
    }

    (req as any).userId = (decoded as JwtPayload).userId;
    next();
  } catch {
    res.status(403).json({ message: "Unauthorized" });
  }
}
