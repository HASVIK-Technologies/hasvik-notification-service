import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
@Injectable()
export class InternalAuthGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const expected = process.env.NOTIFICATION_SERVICE_TOKEN;
    if (!expected || expected === 'REPLACE_WITH_LONG_RANDOM_SECRET')
      throw new ServiceUnavailableException('Service token not configured');
    const authorization =
      ctx.switchToHttp().getRequest<{ headers: { authorization?: string } }>().headers
        .authorization || '';
    const supplied = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    const a = Buffer.from(supplied);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b))
      throw new UnauthorizedException('Invalid service token');
    return true;
  }
}
