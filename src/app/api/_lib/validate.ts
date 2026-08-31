/**
 * 요청 바디/쿼리 파싱 공용 헬퍼. 실패 시 일관된 400 응답을 만듭니다.
 * 라우트 핸들러에 zod 에러 포매팅이 반복해서 섞이지 않게 합니다.
 */

import { NextResponse } from "next/server";
import type { ZodType } from "zod";

export interface ParseFailure {
  ok: false;
  response: NextResponse;
}

export interface ParseSuccess<T> {
  ok: true;
  data: T;
}

export type ParseResult<T> = ParseSuccess<T> | ParseFailure;

function invalidRequest(message: string): NextResponse {
  return NextResponse.json({ code: "INVALID_REQUEST", message }, { status: 400 });
}

export async function parseJsonBody<T>(request: Request, schema: ZodType<T>): Promise<ParseResult<T>> {
  const json = await request.json().catch(() => null);
  if (json === null) {
    return { ok: false, response: invalidRequest("요청 본문이 올바른 JSON이 아닙니다.") };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, response: invalidRequest(parsed.error.message) };
  }
  return { ok: true, data: parsed.data };
}

export function parseSearchParams<T>(url: URL, schema: ZodType<T>): ParseResult<T> {
  const parsed = schema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return { ok: false, response: invalidRequest(parsed.error.message) };
  }
  return { ok: true, data: parsed.data };
}
