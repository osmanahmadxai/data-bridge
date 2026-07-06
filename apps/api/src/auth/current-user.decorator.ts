import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AppUser } from '@prisma/client';

/** injects the authenticated user attached by {@link AuthGuard} */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AppUser | undefined => {
    const req = ctx.switchToHttp().getRequest<Request & { user?: AppUser }>();
    return req.user;
  },
);
