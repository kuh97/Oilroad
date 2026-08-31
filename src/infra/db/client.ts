/**
 * Neon HTTP 드라이버 기반 Drizzle 클라이언트.
 * ARCHITECTURE.md §14 — 서버리스 인스턴스마다 새로 뜨므로 TCP 커넥션 풀 대신
 * HTTP 드라이버를 씁니다 (배치 스크립트는 예외 없이 이 클라이언트를 재사용합니다).
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { env } from "@/infra/env";
import * as schema from "./schema";

let _db: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function getDb() {
  if (!_db) {
    _db = drizzle(neon(env.DATABASE_URL), { schema });
  }
  return _db;
}

export type Db = ReturnType<typeof getDb>;
