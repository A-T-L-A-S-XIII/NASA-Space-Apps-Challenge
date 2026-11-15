'use client';
import { useEffect } from 'react';
import { instalarOndulacao } from '@/lib/efeitos';
/** Instala os efeitos globais: ondulação de água ao clicar e botões magnéticos. */
export default function Efeitos() {
  useEffect(() => { instalarOndulacao(); }, []);   // efeito de "seguir o cursor" removido a pedido
  return null;
}
