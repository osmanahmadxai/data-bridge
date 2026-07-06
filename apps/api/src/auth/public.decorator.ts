import { SetMetadata } from '@nestjs/common';

/** marks a route as reachable without a session (login, setup, status probe) */
export const IS_PUBLIC = 'auth:public';
export const Public = () => SetMetadata(IS_PUBLIC, true);
