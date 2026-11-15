// POST /api/auth/login: o token do FastAPI vai para o cookie httpOnly; a página recebe só nome e cidade
import { login } from "@/lib/auth.mjs";

export const dynamic = "force-dynamic";
export const POST = (req) => login(req);
