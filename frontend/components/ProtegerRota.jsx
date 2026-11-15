'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { sair, validarSessao } from '@/lib/sessao';

/** Redireciona para o login se não houver sessão ou se a API recusar o token (401). */
export default function ProtegerRota({ children }) {
  const router = useRouter();
  const [ok, setOk] = useState(false);
  useEffect(() => {
    let ativo = true;
    validarSessao().then((valida) => {
      if (!ativo) return;
      if (valida) setOk(true);
      else { sair(); router.replace('/'); }
    });
    return () => { ativo = false; };
  }, [router]);
  return ok ? children : <div className="carregando"><span className="carregando__gota" />Carregando…</div>;
}
