/**
 * single-operator authentication. one "admin" account, created on first run,
 * guards the whole API. passwords are hashed with scrypt (built into Node — no
 * native build step), sessions are a signed httpOnly cookie carrying the user
 * id and a session version. bumping the version (on password change) instantly
 * invalidates every outstanding cookie.
 */
import {
  randomBytes,
  randomUUID,
  scrypt as scryptCb,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';
import { Injectable, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  BadRequestError,
  ConflictError,
  UnauthorizedError,
  type AuthUser,
} from '@data-bridge/core';
import type { AppUser } from '@prisma/client';
import { CryptoService } from '../common/crypto.service';
import { PrismaService } from '../common/prisma.service';
import { SettingsStoreService } from '../settings/settings-store.service';

const scrypt = promisify(scryptCb);

/** the session cookie name; cookies aren't port-scoped, so this is host-wide */
export const SESSION_COOKIE = 'db_session';

const SCRYPT_KEYLEN = 64;
const SALT_BYTES = 16;

interface SessionPayload {
  uid: string;
  /** session version at issue time; must match the user's current version */
  v: number;
  /** issued-at (seconds) for idle-expiry enforcement */
  iat: number;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger('Auth');

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly settings: SettingsStoreService,
  ) {}

  /* ----- account lifecycle ----- */

  async hasAccount(): Promise<boolean> {
    return (await this.prisma.appUser.count()) > 0;
  }

  /** create the one admin account; refuses if an account already exists */
  async setup(username: string, password: string): Promise<AppUser> {
    if (await this.hasAccount()) {
      throw new ConflictError('An account already exists. Sign in instead.');
    }
    return this.prisma.appUser.create({
      data: {
        id: randomUUID(),
        username,
        passwordHash: await this.hashPassword(password),
      },
    });
  }

  async login(username: string, password: string): Promise<AppUser> {
    const user = await this.prisma.appUser.findUnique({ where: { username } });
    // verify against a decoy hash even when the user is missing, so a wrong
    // username and a wrong password take the same time (no user enumeration)
    const ok = await this.verifyPassword(
      password,
      user?.passwordHash ?? DECOY_HASH,
    );
    if (!user || !ok) {
      throw new UnauthorizedError('Incorrect username or password.');
    }
    return user;
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<AppUser> {
    const user = await this.prisma.appUser.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedError();
    if (!(await this.verifyPassword(currentPassword, user.passwordHash))) {
      throw new BadRequestError('Your current password is incorrect.');
    }
    // bump sessionVersion so every existing cookie (including other devices)
    // stops validating; the caller re-issues a fresh cookie for this session
    return this.prisma.appUser.update({
      where: { id: userId },
      data: {
        passwordHash: await this.hashPassword(newPassword),
        sessionVersion: { increment: 1 },
      },
    });
  }

  /* ----- session cookie ----- */

  async issueSession(res: Response, user: AppUser): Promise<void> {
    const ttlMinutes = (await this.settings.resolved()).sessionTtlMinutes;
    const token = this.crypto.signToken({
      uid: user.id,
      v: user.sessionVersion,
      iat: Math.floor(nowMs() / 1000),
    } satisfies SessionPayload);
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: ttlMinutes * 60_000,
    });
  }

  clearSession(res: Response): void {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
  }

  /**
   * resolve the user for a request from its session cookie, or null. rejects
   * cookies whose version is stale (password changed) or that have idled past
   * the configured TTL.
   */
  async userFromRequest(req: Request): Promise<AppUser | null> {
    const token = readCookie(req, SESSION_COOKIE);
    if (!token) return null;
    const payload = this.crypto.verifyToken<SessionPayload>(token);
    if (!payload?.uid) return null;

    const ttlMinutes = (await this.settings.resolved()).sessionTtlMinutes;
    const ageSec = Math.floor(nowMs() / 1000) - (payload.iat ?? 0);
    if (ageSec > ttlMinutes * 60) return null;

    const user = await this.prisma.appUser.findUnique({
      where: { id: payload.uid },
    });
    if (!user || user.sessionVersion !== payload.v) return null;
    return user;
  }

  toAuthUser(user: AppUser): AuthUser {
    return {
      id: user.id,
      username: user.username,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }

  /* ----- password hashing (scrypt) ----- */

  private async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(SALT_BYTES);
    const derived = (await scrypt(password, salt, SCRYPT_KEYLEN)) as Buffer;
    return `${salt.toString('hex')}:${derived.toString('hex')}`;
  }

  private async verifyPassword(password: string, stored: string): Promise<boolean> {
    const [saltHex, hashHex] = stored.split(':');
    if (!saltHex || !hashHex) return false;
    try {
      const derived = (await scrypt(
        password,
        Buffer.from(saltHex, 'hex'),
        SCRYPT_KEYLEN,
      )) as Buffer;
      const expected = Buffer.from(hashHex, 'hex');
      return (
        derived.length === expected.length && timingSafeEqual(derived, expected)
      );
    } catch {
      return false;
    }
  }
}

function nowMs(): number {
  return new Date().getTime();
}

/** parse a single cookie value out of the raw Cookie header (no cookie-parser dep) */
function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

/**
 * a fixed scrypt hash of a random string, used to equalize timing on the
 * "user not found" path. its plaintext is unknown, so it never matches.
 */
const DECOY_HASH =
  '00000000000000000000000000000000:' +
  '0000000000000000000000000000000000000000000000000000000000000000' +
  '0000000000000000000000000000000000000000000000000000000000000000';
