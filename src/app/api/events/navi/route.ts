/**
 * 딥링크 클릭 기록 — ARCHITECTURE.md §6.4·§10 Phase 8.
 * fire-and-forget. 실제 저장은 Phase 11(search_event/navi_click_event) 범위이며
 * 지금은 event-service.logNaviClick이 no-op입니다.
 */

import { NaviEventSchema } from "@/app/api/_lib/schema";
import { parseJsonBody } from "@/app/api/_lib/validate";
import { logNaviClick } from "@/services/event-service";

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, NaviEventSchema);
  if (!parsed.ok) return parsed.response;

  await logNaviClick(parsed.data);
  return new Response(null, { status: 204 });
}
