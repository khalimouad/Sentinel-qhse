import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Request } from 'express';
import type { readConfig } from './config.mjs';

export const CONFIG = Symbol('configuration');
export type Config = ReturnType<typeof readConfig>;
export interface Principal { issuer: string; subject: string; authentication: 'oidc' | 'development' }
export interface AuthenticatedRequest extends Request { principal: Principal }

@Injectable()
export class IdentityGuard implements CanActivate {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet> | undefined;
  constructor(@Inject(CONFIG) private readonly config: Config) {
    if (config.jwksUri) this.jwks = createRemoteJWKSet(new URL(config.jwksUri), { timeoutDuration: 5000 });
  }
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    if (!authorization && this.config.devAuth) {
      request.principal = { issuer: this.config.devIssuer, subject: this.config.devSubject, authentication: 'development' };
      return true;
    }
    if (!authorization?.startsWith('Bearer ') || !this.jwks) throw new UnauthorizedException('A valid access token is required.');
    try {
      const { payload } = await jwtVerify(authorization.slice(7), this.jwks, {
        issuer: this.config.issuer, audience: this.config.audience,
        algorithms: ['RS256', 'ES256'], requiredClaims: ['exp', 'iat', 'iss', 'sub', 'aud'], clockTolerance: 5,
      });
      if (!payload.sub) throw new Error('Missing subject');
      request.principal = { issuer: this.config.issuer, subject: payload.sub, authentication: 'oidc' };
      return true;
    } catch { throw new UnauthorizedException('The access token is invalid or expired.'); }
  }
}
