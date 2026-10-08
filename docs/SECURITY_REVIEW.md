# Revisão de segurança (Fase 11) — checklist do `SECURITY.md §9` e OWASP ASVS L2

Estado à data da Fase 11.1. ✅ feito e testado · 🟡 feito, depende de configuração na VPS · ⏳ depende do utilizador.

## SECURITY.md §9
| Item | Estado | Onde / como |
|---|---|---|
| Remover credenciais demo e seeds do bundle | ✅ | Sem credenciais no código; o seed só cria o catálogo e o Manager (`SUPERADMIN_EMAIL`, sem password utilizável, recebe link). Todas as variáveis em `.env.example`. |
| Auth servidor + rate-limit + verificação de email + 2FA admins | ✅ | Argon2id, HIBP, bloqueio progressivo por email+IP, **Turnstile opcional** após 3 falhas (ou 10 por IP/hora), sessões 12 h / 30 dias, email obrigatório, 2FA obrigatório na consola, re-autenticação para ações sensíveis. |
| RLS ativa e testada | ✅ | `tests/integration/rls.test.ts` + testes de partilha; app liga-se como `kh_app` sem BYPASSRLS. |
| Entitlements no servidor | ✅ | `requireModule` / limites do FREE em cada endpoint; testes por fase. |
| Cofre E2E + testes de recuperação | ✅ | Argon2id (WASM) + AES-256-GCM no browser; E2E de setup, bloqueio e recuperação. |
| Sanitização + iframe sandbox para artefactos | ✅ | Notas em JSON validado; emails limpos no servidor; artefactos servidos por `/view` com `CSP: sandbox` (origem opaca), enquadráveis só pela própria app. |
| CSP/headers + HSTS | ✅ | CSP com **nonce por pedido** e `strict-dynamic` em todas as páginas, `frame-ancestors 'none'`, `object-src 'none'`, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS. Varrimento de 26 ecrãs + consola sem violações. |
| VPS endurecida | 🟡 | `infra/vps/setup.sh` (SSH só por chave, UFW, fail2ban, updates automáticos) — correr na VPS. |
| Backups externos + restore testado; purga 30 dias testada | 🟡/✅ | Purga testada (`tests/integration/plans.test.ts`); scripts `infra/backup/` prontos, **agendamento adiado (D17)** — precisa de destino externo. |
| Pentest básico (ASVS L2) | ✅ (auto-revisão) | Ver abaixo. Recomenda-se um pentest externo antes de dados de clientes. |

## ASVS L2 — pontos verificados
- **V2 Autenticação**: passwords ≥ 8 + HIBP; Argon2id; bloqueio e CAPTCHA opcional; reposição com token de uso único (30 min) que termina todas as sessões; 2FA TOTP com códigos de recuperação; mensagens genéricas (sem enumeração de emails).
- **V3 Sessões**: cookie `httpOnly; Secure; SameSite=Lax`, rotação no login, revogação no servidor, terminar outras sessões, desativar/eliminar termina sessões.
- **V4 Controlo de acesso**: RLS por tenant + dono + partilha; papéis da consola verificados no servidor; consola devolve 404 a quem não é admin; **allowlist de IPs opcional** (`ADMIN_IP_ALLOWLIST`); cliente suspenso só leitura.
- **V5 Validação/encoding**: Zod em todos os corpos; JSON do TipTap por lista de nós; HTML de emails limpo; SSRF bloqueado no API Playground, RSS e favicons.
- **V8 Dados**: cofre E2E; credenciais do API Playground e segredos TOTP cifrados em repouso (`ENCRYPTION_KEY`); exportar e **eliminar conta** (RGPD) na app; ficheiros órfãos removidos do MinIO pelo job diário.
- **V9 Comunicações**: HSTS; o proxy (Nginx agora, Caddy depois do corte) termina TLS e passa `X-Real-IP`.
- **V12 Ficheiros**: tamanhos limitados, tipos verificados, servidos com `nosniff` e `CSP: default-src 'none'`; anexos de email só como download (sem antivírus — D37).
- **V13 API**: CSRF por verificação de `Origin` em todas as mutações; erros sem detalhes internos.
- **V14 Configuração**: `npm audit` sem vulnerabilidades (postcss do Next forçado para 8.5.x com `overrides`); headers de segurança; sem `X-Powered-By`.

## Riscos aceites / pendentes
- Anexos de email sem antivírus (D37, memória do KVM 1).
- `style-src 'unsafe-inline'` (atributos `style` do React no HTML do servidor); os scripts continuam só com nonce.
- Pentest externo e backups fora da VPS: decisão e custo do utilizador.
