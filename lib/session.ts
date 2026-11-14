import type { Relation } from "@/types/chat";
import { DISPLAY_NAME_RANGE } from "@/lib/config";

// 메인 화면 입력값을 브라우저 탭(sessionStorage)에 보관합니다. 서버에는 저장하지 않습니다.
// 브라우저 전용: "use client" 컴포넌트의 이벤트 핸들러·effect 안에서만 호출하세요.

export type Session = { relation: Relation; displayName: string; team: string };

const KEY = "yachinja:session";

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null; // 사파리 개인 정보 보호 모드 등
  }
}

export function getSession(): Session | null {
  try {
    const raw = storage()?.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Session>;
    if (v.relation !== "boss" && v.relation !== "friend") return null;
    if (typeof v.displayName !== "string" || typeof v.team !== "string") return null;
    const displayName = v.displayName.trim();
    if (displayName.length < DISPLAY_NAME_RANGE.min || displayName.length > DISPLAY_NAME_RANGE.max || !v.team) return null;
    return { relation: v.relation, displayName, team: v.team };
  } catch {
    return null;
  }
}

export function setSession(session: Session): void {
  try {
    storage()?.setItem(KEY, JSON.stringify({ ...session, displayName: session.displayName.trim() }));
  } catch {
    // 저장 실패해도 화면은 계속 동작합니다.
  }
}

export function clearSession(): void {
  try {
    storage()?.removeItem(KEY);
  } catch {
    // 무시
  }
}
