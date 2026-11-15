// POST /api/auth/logout: apaga o cookie da sessão
import { logout } from "@/lib/auth.mjs";

export const dynamic = "force-dynamic";
export const POST = () => logout();
