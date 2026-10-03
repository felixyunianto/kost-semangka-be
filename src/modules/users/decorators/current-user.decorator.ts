import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { TCurrentUser } from "../types/current-user.type";

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user: TCurrentUser }>();

    return request.user;
  },
);
