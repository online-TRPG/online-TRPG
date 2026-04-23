import { BadRequestException, createParamDecorator, ExecutionContext } from "@nestjs/common";

export const CurrentUserId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>();
    // 여러 컨트롤러에서 같은 헤더 읽기 코드를 반복하지 않도록
    // x-user-id 값을 꺼내는 로직을 데코레이터로 공통화한다.
    // 나중에 JWT 같은 정식 인증으로 바뀌더라도 이 지점만 바꾸면 된다.
    const userId = request.headers["x-user-id"];

    if (!userId) {
      throw new BadRequestException("x-user-id header is required.");
    }

    return userId;
  },
);
