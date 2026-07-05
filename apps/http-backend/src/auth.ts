import jwt from "jsonwebtoken";
import { z } from "zod";
import { prismaClient } from "@repo/db/client";
import { corsResponse } from "./response";

/** Shared JWT secret matching middleware and WS backend */
const JWT_SECRET = process.env.JWT_SECRET;

/** Validation schema for POST /signup */
const CreateUserSchema = z.object({
  username: z.string().min(3).max(20),
  password: z.string(),
  name: z.string(),
});

/** Validation schema for POST /signin */
const SigninSchema = z.object({
  username: z.string().min(3).max(20),
  password: z.string(),
});

/**
 * POST /signup
 * Create a new user account. Password is hashed with bcrypt before storing.
 * Returns the new user's id.
 */
export async function signupHandler(req: Request) {
  const body = await req.json();
  const parsedData = CreateUserSchema.safeParse(body);
  if (!parsedData.success) {
    return corsResponse({ message: "Incorrect inputs" }, { status: 400 });
  }

  try {
    const hashedPassword = await Bun.password.hash(parsedData.data.password, {
      algorithm: "bcrypt",
      cost: 10,
    });
    const user = await prismaClient.user.create({
      data: {
        email: parsedData.data.username,
        password: hashedPassword,
        name: parsedData.data.name,
      },
    });
    return corsResponse({ userId: user.id });
  } catch {
    return corsResponse(
      { message: "User already exists with this username" },
      { status: 411 },
    );
  }
}

/**
 * POST /signin
 * Authenticate with email + password. Returns a JWT token on success.
 */
export async function signinHandler(req: Request) {
  const body = await req.json();
  const parsedData = SigninSchema.safeParse(body);
  if (!parsedData.success) {
    return corsResponse({ message: "Incorrect inputs" }, { status: 400 });
  }

  const user = await prismaClient.user.findFirst({
    where: { email: parsedData.data.username },
  });

  if (!user) {
    return corsResponse({ message: "Not authorized" }, { status: 403 });
  }

  const valid = await Bun.password.verify(
    parsedData.data.password,
    user.password,
  );
  if (!valid) {
    return corsResponse({ message: "Not authorized" }, { status: 403 });
  }

  const token = jwt.sign({ userId: user.id }, JWT_SECRET);
  return corsResponse({ token });
}
