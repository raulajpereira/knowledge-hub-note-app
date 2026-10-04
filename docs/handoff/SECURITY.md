# Segurança

## 1. Estado no protótipo (NÃO usar em produção)
- Credenciais demo `raul.a.j.pereira@gmail.com` / `admin` embutidas no JS; hash SHA-256 em `localStorage`.
- Permissões (plano, admin, partilha) verificadas apenas no browser — contornáveis.
- Dados em claro no `localStorage` (exceto o cofre, já AES-GCM).
- Feeds RSS via proxies públicos (rss2json, allorigins); meteorologia direta do cliente.

## 2. Autenticação
- Passwords: **Argon2id** (m=64 MB, t=3, p=1) no servidor. Mín. 8 chars + verificação contra lista de passwords comprometidas (HIBP k-anonymity).
- Sessões: cookie `httpOnly; Secure; SameSite=Lax`, rotação no login, expiração 30 dias com "Lembrar-me", 12 h sem. Revogação em `sessions`.
- Rate limit (Redis): 5 tentativas/15 min por email+IP no login, lock-screen e reset; backoff progressivo; CAPTCHA (Turnstile) após falhas.
- Reset password (`/login` → "Esqueceu-se?" → email → `/reset-password?token=`): token aleatório 32 bytes, guardado como hash, validade 30 min, uso único; resposta genérica (não revelar se email existe); rate-limit por email e IP; ao gravar: Argon2id, invalidar **todas** as sessões, email de confirmação "a sua password foi alterada". Não altera a palavra-passe mestra do cofre.
- Verificação de email obrigatória antes de ativar conta.
- 2FA TOTP opcional (obrigatório para admins da consola). Códigos de recuperação.
- Ecrã de bloqueio (app e consola): é UX — o desbloqueio deve **re-autenticar no servidor** (endpoint `/auth/reauth`) e a sessão continua válida no backend; após N min de inatividade, exigir re-auth para ações sensíveis.
- Registo exige código válido (`codes`), validado e consumido **transacionalmente** (`SELECT … FOR UPDATE`, incrementa `uses`, verifica `max_uses`, `expires_at`, `status`).

## 3. Autorização
- Middleware servidor: resolve `user → tenant → entitlements → admin role`.
- Cada endpoint verifica módulo (`requireModule('passwords')`) e limites do FREE.
- Postgres **RLS** em todas as tabelas de conteúdo: `tenant_id = current_setting('app.tenant_id')::uuid` e (`owner_id = app.user_id` OR membro ativo da pasta partilhada).
- Admin Console: rotas separadas, papel em `admins`, 2FA obrigatório, IP allowlist opcional; todas as ações → `audit_log` (imutável, append-only).
- Pausar código/utilizador/pasta → efeito imediato (invalidar cache de entitlements e sessões).

## 4. Cofre de passwords (modelo Passbolt / zero-knowledge)
Já desenhado e parcialmente implementado no protótipo (ver `ZNotes.dc.html` funções `vDerive`, `vEnc`, `vDec`, `vWrap`, e `VaultKeys.dc.html`):
- **DEK** (data encryption key) aleatória 256 bits por utilizador; itens cifrados com **AES-256-GCM** no cliente.
- DEK embrulhada duas vezes: com chave derivada da **palavra-passe mestra** (PBKDF2-SHA256 310 000 it., migrar para Argon2id via WASM) e com a **chave de recuperação** (gerada no setup, mostrada uma vez, download do kit).
- Servidor guarda apenas ciphertext + wraps + salt + verifier; **nunca** a master password nem a DEK.
- Mudar master password = re-embrulhar DEK (sem re-cifrar itens). Recuperação = desembrulhar DEK com a chave de recuperação e definir nova master.
- Sem chave de recuperação e sem master → dados irrecuperáveis (comunicado ao utilizador).
- Partilha de itens do cofre: par de chaves por utilizador (X25519) e item key cifrada para cada destinatário (fase 2).
- Auto-bloqueio configurável; chave só em memória; limpar ao bloquear/fechar; copiar password limpa clipboard após 30 s.
- CSP rigorosa na página do cofre.

## 5. Conteúdo e XSS
- Notas: guardar TipTap JSON (não HTML livre). Ao colar HTML, sanitizar com **DOMPurify** (whitelist) — o protótipo já remove script/iframe/on*/javascript:.
- Artifacts (HTML do utilizador): renderizar **só** em `<iframe sandbox="allow-scripts">` num **domínio separado** (ex. `usercontent.knowledgehub.app`), sem cookies, com CSP própria.
- Feeds RSS: buscar no servidor, sanitizar HTML, proxy de imagens.
- Emails importados: parse no servidor ou worker isolado, sanitizar HTML, anexos com scan antivírus (ClamAV) antes de servir.
- CSP global, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS.

## 6. Partilha
- Links públicos: token ≥128 bits, opção password (argon2), expiração, contador de views, revogar; página pública só-leitura, `noindex`.
- Pastas partilhadas: convites por email com token assinado; utilizador inexistente recebe convite para registar. Permissões `read`/`edit`. Dono pode pausar/remover membros ou a pasta.

## 7. API Playground e SAP
- Pedidos do API Playground: executar a partir do **cliente** (CORS) ou de um proxy servidor com allowlist e bloqueio de IPs privados (SSRF). Segredos (tokens, passwords) cifrados em repouso.
- SAP GUI: o botão gera ficheiro `.sap` / URI `sapgui://` no cliente — nunca guardar passwords SAP em claro.

## 8. RGPD / compliance
- Dados alojados na UE (escolher datacenter europeu da Hostinger); DPA com subprocessadores (Hostinger, SMTP, armazenamento de backups).
- Exportar dados (já existe botão no perfil) e apagar conta → endpoints reais.
- Registo de consentimentos, política de privacidade, termos, cookies estritamente necessários.
- Retenção: logs de auditoria 1–2 anos; dados de códigos revogados 30 dias; backups encriptados fora da VPS (7 diários, 4 semanais, 6 mensais).

## 9. Checklist antes de produção
- [ ] Remover credenciais demo e seeds do bundle
- [ ] Auth servidor + rate-limit + verificação email + 2FA admins
- [ ] RLS ativa e testada (testes automáticos por tenant)
- [ ] Entitlements no servidor
- [ ] Cofre E2E + testes de recuperação
- [ ] Sanitização (DOMPurify) + iframe sandbox para artifacts
- [ ] CSP/headers + HSTS
- [ ] VPS endurecida (SSH por chave, UFW, fail2ban, updates automáticos) — ver DECISIONS_AND_INFRA §3
- [ ] Backups externos + restore testado; purge de revogados (30 dias) testado
- [ ] Pentest básico (OWASP ASVS L2)
