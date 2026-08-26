/**
 * Phase 0 검증 스크립트 공통 유틸
 *
 * 사용법: 각 스크립트에서 import
 * 실행:  npx tsx scripts/verify/<name>.ts
 *        (tsx가 없으면 pnpm add -D tsx 또는 npx tsx 직접 사용)
 */

export const RESET  = '\x1b[0m';
export const RED    = '\x1b[31m';
export const GREEN  = '\x1b[32m';
export const YELLOW = '\x1b[33m';
export const CYAN   = '\x1b[36m';
export const BOLD   = '\x1b[1m';

export function ok(msg: string) {
  console.log(`${GREEN}  ✔ ${msg}${RESET}`);
}

export function fail(msg: string) {
  console.log(`${RED}  ✖ ${msg}${RESET}`);
}

export function warn(msg: string) {
  console.log(`${YELLOW}  ⚠ ${msg}${RESET}`);
}

export function info(msg: string) {
  console.log(`${CYAN}  → ${msg}${RESET}`);
}

export function header(msg: string) {
  console.log(`\n${BOLD}${msg}${RESET}`);
  console.log('─'.repeat(50));
}

export function summary(passed: string[], failed: string[]) {
  console.log('\n' + '─'.repeat(50));
  if (failed.length === 0) {
    console.log(`${GREEN}${BOLD}전체 통과 (${passed.length}/${passed.length})${RESET}`);
  } else {
    console.log(`${RED}${BOLD}실패 항목 (${failed.length}/${passed.length + failed.length}):${RESET}`);
    failed.forEach(f => console.log(`${RED}  • ${f}${RESET}`));
  }
  return failed.length === 0;
}

/** 환경변수 확인. 없으면 즉시 종료 */
export function requireEnv(names: string[]): Record<string, string> {
  const missing = names.filter(n => !process.env[n]);
  if (missing.length > 0) {
    console.error(`${RED}필수 환경변수가 없습니다:${RESET} ${missing.join(', ')}`);
    console.error('  .env.local 또는 .env 파일을 확인하십시오.');
    process.exit(1);
  }
  return Object.fromEntries(names.map(n => [n, process.env[n]!]));
}
