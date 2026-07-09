import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { normalizeShareToken } from '../request-boundary';

export const ShareToken = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    return normalizeShareToken(request.headers['x-share-token']);
  },
);
