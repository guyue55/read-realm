import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const ShareToken = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    const token = request.headers['x-share-token'];
    if (!token || typeof token !== 'string') {
      return 'default';
    }
    return token.trim();
  },
);
