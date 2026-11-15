'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { sessaoAtual } from '@/lib/sessao';

/** Redireciona para o login se não houver sessão (falsa) ativa. */
export default function ProtegerRota({ children }) {
  const router = useRouter();
  const [ok, setOk] = useState(false);
  useEffect(() => { if (sessaoAtual()) setOk(true); else router.replace('/'); }, [router]);
  return ok ? children : <div className="carregando"><span className="carregando__gota" />Carregando…</div>;
}
