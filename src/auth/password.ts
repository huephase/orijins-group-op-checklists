import { hash, verify } from 'argon2';
export const hashPassword = (password: string) => hash(password, { type: 2 });
export const verifyPassword = (hashValue: string, password: string) => verify(hashValue, password);
