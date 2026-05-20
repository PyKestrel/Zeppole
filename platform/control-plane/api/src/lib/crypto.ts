import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

export async function hashSecret(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifySecret(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
