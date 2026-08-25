import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './public.decorator';
import { AuthService } from './auth.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const token = request.cookies?.[this.authService.cookieName] as string | undefined;

    if (token) {
      const user = await this.authService.getUserByToken(token);
      if (!user) throw new UnauthorizedException('SESSION_EXPIRED');
      request.user = user;
      return true;
    }

    // Dev-only fallback for local joint debugging. x-user-id is NEVER trusted in
    // production, otherwise any client could impersonate any user by simply
    // setting the header. In production the only valid identity is the session
    // cookie issued by /auth/verify-code.
    if (process.env.NODE_ENV !== 'production') {
      const devUserId = request.headers['x-user-id'] || request.headers['X-User-Id'];
      if (devUserId) {
        try {
          const user = await this.authService.getUserById(devUserId);
          request.user = user;
          return true;
        } catch {
          // fall through to 401 below
        }
      }
    }

    throw new UnauthorizedException('AUTH_REQUIRED');
  }
}
