// GET /api/auth/me: valida a sessão do cookie no FastAPI
import { me } from "@/lib/auth.mjs";

export const dynamic = "force-dynamic";
export const GET = (req) => me(req);
