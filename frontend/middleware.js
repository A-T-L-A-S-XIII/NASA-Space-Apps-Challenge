// As outras rotas /api/* seguem pelo rewrite até o FastAPI. Se houver sessão, o Next coloca o
// Authorization a partir do cookie httpOnly (o navegador nunca vê o token).
import { NextResponse } from "next/server";
import { COOKIE } from "@/lib/auth.mjs";

export function middleware(req) {
  const headers = new Headers(req.headers);
  headers.delete("authorization"); // só vale o token do cookie
  const token = req.cookies.get(COOKIE)?.value;
  if (token) headers.set("authorization", `Bearer ${token}`);
  return NextResponse.next({ request: { headers } });
}

// /api/auth/* tem route handlers próprios
export const config = { matcher: "/api/((?!auth/).*)" };
