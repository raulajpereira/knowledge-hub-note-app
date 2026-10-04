import { Logo } from '@/components/brand/Logo';

// Phase 0 placeholder at the app root — replaced by the Login / app shell in
// the next phases. Proves the deploy, base path, fonts and glass tokens.
export default function Home() {
  return (
    <main className="kh-bg relative flex min-h-screen items-center justify-center px-6 py-24">
      <section className="glass flex w-full max-w-[420px] flex-col gap-5 rounded-[var(--radius-panel)] p-[34px]">
        <Logo />
        <div className="flex flex-col gap-1.5">
          <span className="text-2xl font-semibold tracking-[-.02em]">Em construção</span>
          <span className="text-sm text-[var(--text-2)]">
            A versão 2.0 está a ser preparada. A versão atual continua disponível.
          </span>
        </div>
        <span className="font-mono text-xs text-[var(--text-3)]">v2.0.0 · fase 0</span>
      </section>
    </main>
  );
}
