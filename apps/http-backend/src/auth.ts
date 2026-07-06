import jwt from "jsonwebtoken";
import { z } from "zod";
import { prismaClient } from "@repo/db/client";
import { corsResponse } from "./response";
import { rateLimit, getClientIp } from "./ratelimit";

/** Shared JWT secret matching middleware and WS backend */
const JWT_SECRET = process.env.JWT_SECRET;

/** Max auth attempts per IP per minute */
const AUTH_RATE_LIMIT = 10;
const AUTH_RATE_WINDOW = 60_000;

/** Validation schema for POST /signup */
const CreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1).max(100),
});

/** Validation schema for POST /signin */
const SigninSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

/**
 * POST /signup
 * Create a new user account. Password is hashed with bcrypt before storing.
 * Returns the new user's id.
 */
export async function signupHandler(req: Request) {
  const ip = getClientIp(req);
  if (!rateLimit(`signup:${ip}`, AUTH_RATE_LIMIT, AUTH_RATE_WINDOW)) {
    return corsResponse(
      { message: "Too many requests. Please try again later." },
      { status: 429 },
      req,
    );
  }

  const body = await req.json();
  const parsedData = CreateUserSchema.safeParse(body);
  if (!parsedData.success) {
    return corsResponse({ message: "Incorrect inputs" }, { status: 400 }, req);
  }

  try {
    const hashedPassword = await Bun.password.hash(parsedData.data.password, {
      algorithm: "bcrypt",
      cost: 10,
    });
    const user = await prismaClient.user.create({
      data: {
        email: parsedData.data.email,
        password: hashedPassword,
        name: parsedData.data.name,
      },
    });
    return corsResponse({ userId: user.id }, {}, req);
  } catch {
    // Generic message to prevent user enumeration — same response whether the
    // email is taken or a DB error occurred.
    return corsResponse(
      { message: "If this email is available, your account has been created" },
      { status: 200 },
      req,
    );
  }
}

/**
 * POST /signin
 * Authenticate with email + password. Returns a JWT token on success.
 */
export async function signinHandler(req: Request) {
  const ip = getClientIp(req);
  if (!rateLimit(`signin:${ip}`, AUTH_RATE_LIMIT, AUTH_RATE_WINDOW)) {
    return corsResponse(
      { message: "Too many requests. Please try again later." },
      { status: 429 },
      req,
    );
  }

  const body = await req.json();
  const parsedData = SigninSchema.safeParse(body);
  if (!parsedData.success) {
    return corsResponse({ message: "Incorrect inputs" }, { status: 400 }, req);
  }

  const user = await prismaClient.user.findFirst({
    where: { email: parsedData.data.email },
  });

  if (!user) {
    return corsResponse({ message: "Not authorized" }, { status: 403 }, req);
  }

  const valid = await Bun.password.verify(
    parsedData.data.password,
    user.password,
  );
  if (!valid) {
    return corsResponse({ message: "Not authorized" }, { status: 403 }, req);
  }

  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });
  return corsResponse({ token }, {}, req);
}
