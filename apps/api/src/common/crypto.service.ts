/**
 * credential encryption at rest (AES-256-GCM).
 *
 * key precedence: DATABRIDGE_MASTER_KEY (base64, 32 bytes) when set, otherwise a
 * random key generated once and persisted to the data dir with 0600 perms.
 * ciphertext format is "iv:tag:data", all base64
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { Injectable, Logger } from '@nestjs/common';
import { runtimeConfig } from './runtime-config';

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12;

@Injectable()
export class CryptoService {
  private key: Buffer | null = null;

  private loadKey(): Buffer {
    if (this.key) return this.key;

    if (runtimeConfig.masterKey) {
      const key = Buffer.from(runtimeConfig.masterKey, 'base64');
      if (key.length !== 32) {
        throw new Error(
          'DATABRIDGE_MASTER_KEY must be a base64-encoded 32-byte value',
        );
      }
      this.key = key;
      return key;
    }

    if (existsSync(runtimeConfig.keyFile)) {
      this.key = Buffer.from(
        readFileSync(runtimeConfig.keyFile, 'utf8').trim(),
        'base64',
      );
      return this.key;
    }

    const key = randomBytes(32);
    // fine for local dev, but the key then lives beside the data it protects —
    // a backup of the data dir carries both. production must set the env key
    new Logger('Crypto').warn(
      `DATABRIDGE_MASTER_KEY is not set — generated a key at ${runtimeConfig.keyFile}. ` +
        'Set DATABRIDGE_MASTER_KEY in production.',
    );
    writeFileSync(runtimeConfig.keyFile, key.toString('base64'), {
      mode: 0o600,
    });
    try {
      chmodSync(runtimeConfig.keyFile, 0o600);
    } catch {
      /* best effort */
    }
    this.key = key;
    return key;
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGO, this.loadKey(), iv);
    const data = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('base64')}:${tag.toString('base64')}:${data.toString('base64')}`;
  }

  decrypt(payload: string): string {
    const [ivB64, tagB64, dataB64] = payload.split(':');
    if (!ivB64 || !tagB64 || !dataB64) throw new Error('Malformed ciphertext');
    const decipher = createDecipheriv(
      ALGO,
      this.loadKey(),
      Buffer.from(ivB64, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
}
