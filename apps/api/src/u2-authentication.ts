import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { canonicalJson, OmsError, requireCondition, ExecutionBudget } from '@oms/contracts';
import type { Ref, ServiceContext, U2PurposeContext } from '@oms/contracts';
import type { IdentityRecovery } from '@oms/core';
import { ref } from '@oms/core';
import type { ProtectedStore } from '@oms/persistence';
import type { Request, Response } from 'express';
import { ApiSecurity } from './security.js';

export type HttpEnrollmentPurpose = 'INVITATION_ACCEPTANCE' | 'MFA_REENROLMENT';
export interface PurposeCookieMaterial {
  version: 1;
  purpose: HttpEnrollmentPurpose;
  authorityRef: Ref;
  handle: string;
  expiresAt: string;
}
export const u2HttpCall = new AsyncLocalStorage<{
  ingress: unknown;
  network: string;
  purposeResult?: PurposeCookieMaterial;
}>();

export class U2WorkQueue {
  private active = 0;
  private readonly waiting: {
    start: () => void;
    reject: (reason: unknown) => void;
    timer: ReturnType<typeof setTimeout>;
    abort: () => void;
    signal: AbortSignal;
  }[] = [];
  constructor(
    readonly maximum: number,
    readonly queued: number,
    readonly waitMilliseconds = 250,
  ) {
    requireCondition(
      Number.isInteger(maximum) &&
        maximum > 0 &&
        maximum <= 32 &&
        Number.isInteger(queued) &&
        queued >= 0 &&
        queued <= 32 &&
        waitMilliseconds > 0 &&
        waitMilliseconds <= 250,
      503,
      'U2_QUEUE_CONFIGURATION',
      '등록된 유한 실행/대기 예산이 필요합니다.',
    );
  }
  async run<T>(budget: ExecutionBudget, operation: () => Promise<T>): Promise<T> {
    budget.check();
    if (this.active >= this.maximum) {
      requireCondition(
        this.waiting.length < this.queued,
        503,
        'U2_QUEUE_FULL',
        '처리 상한에서 원래 요청을 대조하고 잠시 후 다시 시도하세요.',
      );
      await new Promise<void>((start, reject) => {
        const remove = (error: unknown) => {
          const index = this.waiting.indexOf(entry);
          if (index < 0) return;
          this.waiting.splice(index, 1);
          clearTimeout(entry.timer);
          budget.signal.removeEventListener('abort', entry.abort);
          reject(error);
        };
        const entry = {
          start: () => {
            clearTimeout(entry.timer);
            budget.signal.removeEventListener('abort', entry.abort);
            start();
          },
          reject,
          timer: setTimeout(
            () =>
              remove(
                new OmsError(503, 'U2_QUEUE_WAIT', '원래 대기 예산 안에서 처리할 수 없습니다.'),
              ),
            Math.min(this.waitMilliseconds, budget.remaining()),
          ),
          abort: () =>
            remove(new OmsError(503, 'U2_QUEUE_ABORTED', '원래 요청 기한/연결을 확인하세요.')),
          signal: budget.signal,
        };
        this.waiting.push(entry);
        budget.signal.addEventListener('abort', entry.abort, { once: true });
        if (budget.signal.aborted) entry.abort();
      });
    } else this.active++;
    try {
      budget.check();
      return await operation();
    } finally {
      const next = this.waiting.shift();
      if (next) next.start();
      else this.active--;
    }
  }
}
// 두 audience composition이 같은 replica의 상한을 공유한다. 원래 host total admission은 유지한다.
export const u2PublicWork = new U2WorkQueue(16, 16),
  u2PrivateWork = new U2WorkQueue(16, 16),
  u2CryptoWork = new U2WorkQueue(4, 16);
export class U2RateAdmission {
  private lastAt: number | null = null;
  constructor(
    private readonly store: ProtectedStore,
    private readonly key: Buffer | undefined,
    private readonly now: () => Date,
  ) {}
  async admit(network: string, identifier?: string, invitationId?: string): Promise<void> {
    requireCondition(
      this.key && this.key.length >= 32,
      503,
      'U2_RATE_KEY_UNREGISTERED',
      '공유 목적 rate 원본/키가 필요합니다.',
    );
    const at = this.now();
    requireCondition(
      Number.isFinite(at.getTime()) && (this.lastAt === null || at.getTime() >= this.lastAt),
      503,
      'U2_CLOCK_UNCONFIRMED',
      '현재 서버 시각을 다시 확인하기 전 민감 단계를 보류합니다.',
    );
    this.lastAt = at.getTime();
    const windows: [string, string, number, number][] = [
      ['u2-global', 'all', 50, 1000],
      ['u2-network', network, 120, 60000],
    ];
    if (identifier !== undefined) windows.push(['u2-identifier', identifier, 10, 300000]);
    if (invitationId !== undefined) windows.push(['u2-invitation', invitationId, 10, 300000]);
    let denied = false;
    const seed = randomBytes(16).toString('hex');
    await this.store.execute(
      {
        principalId: 'u2-admission',
        audience: 'SYSTEM',
        owner: 'IdentityRecovery',
        operation: 'u2-admission',
        target: null,
        idempotencyKey: seed,
        input: { admission: seed },
        correlationId: seed,
        epoch: await this.store.currentEpoch(),
      },
      async (tx) => {
        const count = await tx.countCurrentAuthWindows(at.toISOString());
        requireCondition(
          count <= 2000 - windows.length,
          503,
          'U2_RATE_CAPACITY',
          '현재 유한 인증 window 상한을 확인하세요.',
        );
        for (const [kind, value, maximum, duration] of windows) {
          const id = createHmac('sha256', this.key!)
              .update('oms-u2-admission:1\0' + kind + '\0' + value)
              .digest('hex'),
            previous = await tx.get('AuthAttemptWindow', id);
          requireCondition(
            !previous || Date.parse(String(previous.resetAt)) - duration <= at.getTime(),
            503,
            'U2_CLOCK_UNCONFIRMED',
            '현재 보호 window보다 이전 서버 시각의 민감 단계는 보류합니다.',
          );
          const live = previous && Date.parse(String(previous.resetAt)) > at.getTime(),
            nextCount = live ? Number(previous.count) + 1 : 1;
          denied ||= nextCount > maximum;
          await tx.put(
            'AuthAttemptWindow',
            {
              windowId: id,
              count: nextCount,
              resetAt: live ? previous.resetAt : new Date(at.getTime() + duration).toISOString(),
              revision: Number(previous?.revision ?? 0) + 1,
            },
            previous ? Number(previous.revision) : null,
          );
        }
      },
    );
    requireCondition(
      !denied,
      429,
      'U2_RATE_LIMIT',
      '인증 시도 상한에서 잠시 후 원래 접점을 다시 확인하세요.',
    );
  }
}
interface CapturedPurpose {
  opaque: ServiceContext;
  canonical: string;
  material: PurposeCookieMaterial;
  ingress: unknown;
  allowHeld: boolean;
}
// The cookie carries encrypted bearer material, never business authority.
// Every request verifies the REAL registered core handle/current source again.
export class U2Authentication {
  readonly cookie: string;
  private readonly key: Buffer;
  private readonly contexts = new WeakMap<U2PurposeContext, CapturedPurpose>();
  constructor(
    private readonly store: ProtectedStore,
    private readonly identity: Pick<IdentityRecovery, 'authenticatePurpose'>,
    private readonly security: ApiSecurity,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.cookie = security.cookie + '-purpose';
    this.key = createHmac('sha256', security.configuration.cookieKey)
      .update('oms-u2-purpose-cookie:1\0')
      .digest();
  }
  private aad(browser: string): Buffer {
    requireCondition(
      /^[A-Za-z0-9_-]{43}$/.test(browser),
      401,
      'PURPOSE_BROWSER_REQUIRED',
      '현재 목적 접점을 다시 확인하세요.',
    );
    return Buffer.from(
      canonicalJson({
        profile: 'oms-u2-purpose-cookie:1',
        audience: this.security.configuration.audience,
        origin: this.security.configuration.origin,
        browser,
      }),
    );
  }
  private validate(value: unknown): PurposeCookieMaterial {
    const row = value as PurposeCookieMaterial;
    requireCondition(
      row &&
        typeof row === 'object' &&
        !Array.isArray(row) &&
        Object.keys(row).sort().join(',') === 'authorityRef,expiresAt,handle,purpose,version' &&
        row.version === 1 &&
        ['INVITATION_ACCEPTANCE', 'MFA_REENROLMENT'].includes(row.purpose) &&
        /^[A-Za-z0-9_-]{43}$/.test(row.handle) &&
        Number.isFinite(Date.parse(row.expiresAt)) &&
        this.now().getTime() < Date.parse(row.expiresAt),
      401,
      'PURPOSE_COOKIE_REQUIRED',
      '남은 현재 목적 접점을 다시 확인하세요.',
    );
    this.store.schema.validateUri(
      'urn:oms:contract:u2-access-additions:1#/$defs/EnrollmentAuthority',
      row.authorityRef,
    );
    return row;
  }
  async establish(
    response: Response,
    material: PurposeCookieMaterial,
    browser: string,
  ): Promise<string> {
    this.validate(material);
    const source = await this.store.currentProtected(
      'EnrollmentAuthority',
      material.authorityRef.id,
    );
    requireCondition(
      source &&
        source.revision === material.authorityRef.revision &&
        source.audience === this.security.configuration.audience &&
        source.purpose === material.purpose &&
        source.expiresAt === material.expiresAt &&
        ['ACTIVE', 'HOLD', 'COMPLETED'].includes(String(source.state)) &&
        Date.parse(material.expiresAt) - this.now().getTime() <= 300000,
      503,
      'PURPOSE_COOKIE_PRODUCER',
      '원래 보호된 제한 결과/기한만 cookie로 전달합니다.',
    );
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(this.aad(browser));
    const bytes = Buffer.from(canonicalJson(material));
    let encrypted: Buffer;
    try {
      encrypted = Buffer.concat([cipher.update(bytes), cipher.final()]);
    } finally {
      bytes.fill(0);
    }
    const cookie = [
        iv.toString('base64url'),
        encrypted.toString('base64url'),
        cipher.getAuthTag().toString('base64url'),
      ].join('.'),
      maxAge = Math.max(
        1,
        Math.floor((Date.parse(material.expiresAt) - this.now().getTime()) / 1000),
      );
    response.append(
      'Set-Cookie',
      `${this.cookie}=${cookie}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`,
    );
    return cookie;
  }
  material(request: Request, browser: string): PurposeCookieMaterial {
    const cookie = this.security.cookieValue(request, this.cookie);
    requireCondition(
      cookie && cookie.length <= 4096,
      401,
      'PURPOSE_COOKIE_REQUIRED',
      '현재 목적 접점을 확인하세요.',
    );
    let bytes: Buffer | null = null;
    try {
      const parts = cookie.split('.');
      requireCondition(
        parts.length === 3 &&
          parts.every(
            (part) =>
              /^[A-Za-z0-9_-]+$/.test(part) &&
              Buffer.from(part, 'base64url').toString('base64url') === part,
          ),
        401,
        'PURPOSE_COOKIE_REQUIRED',
        '현재 목적 접점을 확인하세요.',
      );
      const [iv, encrypted, tag] = parts.map((part) => Buffer.from(part, 'base64url'));
      requireCondition(
        iv!.length === 12 && tag!.length === 16,
        401,
        'PURPOSE_COOKIE_REQUIRED',
        '현재 목적 접점을 확인하세요.',
      );
      const decipher = createDecipheriv('aes-256-gcm', this.key, iv!, { authTagLength: 16 });
      decipher.setAAD(this.aad(browser));
      decipher.setAuthTag(tag!);
      bytes = Buffer.concat([decipher.update(encrypted!), decipher.final()]);
      return this.validate(JSON.parse(bytes.toString('utf8')));
    } catch {
      throw new OmsError(401, 'PURPOSE_COOKIE_REQUIRED', '현재 목적 접점을 다시 확인하세요.');
    } finally {
      bytes?.fill(0);
    }
  }
  async authenticate(
    request: Request,
    browser: string,
    purpose: HttpEnrollmentPurpose,
    correlationId: string,
    ingress: unknown,
    allowHeld = false,
  ): Promise<U2PurposeContext> {
    const material = this.material(request, browser);
    requireCondition(
      material.purpose === purpose,
      401,
      'PURPOSE_COOKIE_REQUIRED',
      '이 작업의 현재 목적 접점이 필요합니다.',
    );
    const opaque = await this.identity.authenticatePurpose(
        material.authorityRef,
        material.handle,
        purpose,
        correlationId,
        ingress,
        allowHeld,
      ),
      row = await this.store.currentProtected('EnrollmentAuthority', material.authorityRef.id);
    requireCondition(
      row && opaque.audience === this.security.configuration.audience,
      401,
      'PURPOSE_COOKIE_REQUIRED',
      '현재 같은 대상의 제한 권위가 필요합니다.',
    );
    const source = (purpose === 'INVITATION_ACCEPTANCE' ? row.invitationRef : row.sourceRef) as Ref;
    requireCondition(
      source,
      503,
      'PURPOSE_SOURCE_REQUIRED',
      '원래 목적의 보호 source가 필요합니다.',
    );
    const context: U2PurposeContext = {
      audience: opaque.audience as 'CUSTOMER' | 'STAFF',
      subjectAccountRef: row.accountRef as Ref,
      bindingRef: row.bindingRef as Ref,
      bindingGeneration: Number(row.bindingGeneration),
      securityGeneration: Number(row.securityGeneration),
      recoveryEpoch: String(row.epoch),
      purpose,
      sourceRef: source,
      enrollmentTarget: purpose === 'MFA_REENROLMENT' ? source : null,
      challengeId: String(row.challengeId),
      authorityRef: ref('EnrollmentAuthority', row),
      verificationRef: row.verificationRef as Ref | null,
      partyContextRef: row.partyContextRef as Ref | null,
      expiresAt: String(row.expiresAt),
      correlationId,
      deadlineAt: opaque.deadlineAt,
    };
    this.store.schema.validateUri(
      'urn:oms:contract:u2-access-additions:1#/$defs/PurposeContext',
      context,
    );
    this.contexts.set(context, {
      opaque,
      canonical: canonicalJson(context),
      material,
      ingress,
      allowHeld,
    });
    return context;
  }
  resolve(context: U2PurposeContext): ServiceContext {
    const captured = this.contexts.get(context);
    requireCondition(
      captured && captured.canonical === canonicalJson(context),
      401,
      'PURPOSE_HOST_REQUIRED',
      '서버가 검증한 원래 목적 객체가 필요합니다.',
    );
    return captured.opaque;
  }
  async assertCurrent(context: U2PurposeContext): Promise<void> {
    const captured = this.contexts.get(context);
    this.resolve(context);
    await this.identity.authenticatePurpose(
      captured!.material.authorityRef,
      captured!.material.handle,
      context.purpose,
      context.correlationId,
      captured!.ingress,
      captured!.allowHeld,
    );
  }
}

export interface PartyCookieMaterial {
  partyContextRef: Ref;
  challengeId: string;
  partySecret: string;
  expiresAt: string;
}
export class U2PartyCookies {
  readonly cookie: string;
  private readonly key: Buffer;
  constructor(
    private readonly security: ApiSecurity,
    private readonly now: () => Date,
  ) {
    this.cookie = security.cookie + '-party';
    this.key = createHmac('sha256', security.configuration.cookieKey)
      .update('oms-u2-party-cookie:1\0')
      .digest();
  }
  private aad(browser: string): Buffer {
    return Buffer.from(
      canonicalJson({
        profile: 'oms-u2-party-cookie:1',
        audience: this.security.configuration.audience,
        origin: this.security.configuration.origin,
        browser,
      }),
    );
  }
  establish(response: Response, material: PartyCookieMaterial, browser: string): void {
    requireCondition(
      Date.parse(material.expiresAt) > this.now().getTime() &&
        Date.parse(material.expiresAt) - this.now().getTime() <= 300000,
      503,
      'PARTY_COOKIE_PRODUCER',
      '원래 당사자 진행의 남은 기한이 필요합니다.',
    );
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(this.aad(browser));
    const bytes = Buffer.from(canonicalJson(material));
    let encoded: Buffer;
    try {
      encoded = Buffer.concat([cipher.update(bytes), cipher.final()]);
    } finally {
      bytes.fill(0);
    }
    response.append(
      'Set-Cookie',
      `${this.cookie}=${[iv.toString('base64url'), encoded.toString('base64url'), cipher.getAuthTag().toString('base64url')].join('.')}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${Math.max(1, Math.floor((Date.parse(material.expiresAt) + 300000 - this.now().getTime()) / 1000))}`,
    );
  }
  material(request: Request, browser: string, originalRead = false): PartyCookieMaterial {
    let bytes: Buffer | null = null;
    try {
      const encoded = this.security.cookieValue(request, this.cookie);
      requireCondition(
        encoded && encoded.length <= 4096,
        401,
        'PARTY_COOKIE_REQUIRED',
        '원래 당사자 접점이 필요합니다.',
      );
      const parts = encoded.split('.');
      requireCondition(
        parts.length === 3 &&
          parts.every(
            (part) =>
              /^[A-Za-z0-9_-]+$/.test(part) &&
              Buffer.from(part, 'base64url').toString('base64url') === part,
          ),
        401,
        'PARTY_COOKIE_REQUIRED',
        '원래 당사자 접점이 필요합니다.',
      );
      const [iv, cipher, tag] = parts.map((part) => Buffer.from(part, 'base64url'));
      requireCondition(
        iv!.length === 12 && tag!.length === 16,
        401,
        'PARTY_COOKIE_REQUIRED',
        '원래 당사자 접점이 필요합니다.',
      );
      const decoder = createDecipheriv('aes-256-gcm', this.key, iv!, { authTagLength: 16 });
      decoder.setAAD(this.aad(browser));
      decoder.setAuthTag(tag!);
      bytes = Buffer.concat([decoder.update(cipher!), decoder.final()]);
      const value = JSON.parse(bytes.toString()) as PartyCookieMaterial;
      requireCondition(
        value &&
          Object.keys(value).sort().join(',') ===
            'challengeId,expiresAt,partyContextRef,partySecret' &&
          /^[A-Za-z0-9_-]{43}$/.test(value.partySecret) &&
          Number.isFinite(Date.parse(value.expiresAt)) &&
          Date.parse(value.expiresAt) + (originalRead ? 300000 : 0) > this.now().getTime(),
        401,
        'PARTY_COOKIE_REQUIRED',
        '원래 당사자 접점의 남은 기한이 필요합니다.',
      );
      return value;
    } catch {
      throw new OmsError(401, 'PARTY_COOKIE_REQUIRED', '원래 당사자 접점을 다시 확인하세요.');
    } finally {
      bytes?.fill(0);
    }
  }
}
