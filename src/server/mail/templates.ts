import type { Lang } from '@/i18n';

// Transactional emails (verify, reset, password changed, first access).
// Plain, table-free HTML that renders in every client; text part included.
export type MailMessage = { to: string; subject: string; text: string; html: string; kind: string };

type Copy = { subject: string; title: string; body: string; cta?: string; foot: string };

const COPY: Record<string, Record<Lang, Copy>> = {
  shared: {
    pt: {
      subject: '{who} partilhou "{folder}" consigo · KnowledgeHub',
      title: 'Nova pasta partilhada',
      body: '{who} partilhou a pasta "{folder}" ({kind}) consigo. Já a encontra na página respetiva do KnowledgeHub.',
      cta: 'Abrir o KnowledgeHub',
      foot: 'Se não conhece quem partilhou, pode ignorar este email.',
    },
    en: {
      subject: '{who} shared "{folder}" with you · KnowledgeHub',
      title: 'New shared folder',
      body: '{who} shared the folder "{folder}" ({kind}) with you. You will find it in its page in KnowledgeHub.',
      cta: 'Open KnowledgeHub',
      foot: "If you don't know who shared it, you can ignore this email.",
    },
  },
  shareInvite: {
    pt: {
      subject: '{who} convidou-o para o KnowledgeHub',
      title: 'Convite para uma pasta partilhada',
      body: '{who} quer partilhar a pasta "{folder}" ({kind}) consigo no KnowledgeHub. Crie a sua conta gratuita com este email para a ver.',
      cta: 'Criar conta gratuita',
      foot: 'Se não esperava este convite, ignore este email.',
    },
    en: {
      subject: '{who} invited you to KnowledgeHub',
      title: 'Invitation to a shared folder',
      body: '{who} wants to share the folder "{folder}" ({kind}) with you on KnowledgeHub. Create your free account with this email to see it.',
      cta: 'Create Free Account',
      foot: "If you weren't expecting this invitation, ignore this email.",
    },
  },
  paymentReminder: {
    pt: {
      subject: 'Pagamento em atraso · KnowledgeHub',
      title: 'Pagamento em atraso',
      body: 'A subscrição {plan} de {client} tem um pagamento em atraso desde {date}. Para manter o acesso da equipa, regularize-o ou responda a este email se já o fez.',
      cta: 'Abrir o KnowledgeHub',
      foot: 'Se já tratou do pagamento, ignore este email.',
    },
    en: {
      subject: 'Overdue payment · KnowledgeHub',
      title: 'Overdue payment',
      body: "The {plan} subscription of {client} has an overdue payment since {date}. To keep your team's access, please settle it or reply to this email if you already did.",
      cta: 'Open KnowledgeHub',
      foot: 'If you already took care of the payment, ignore this email.',
    },
  },
  planRequest: {
    pt: {
      subject: 'Novo pedido de plano: {plan} · {client}',
      title: 'Novo pedido de plano',
      body: '{who} ({email}) de {client} pediu {plan} ({seats} lugares, {cycle}). {notes}',
      cta: 'Abrir os Pedidos na consola',
      foot: 'Recebe este email por ser administrador da Consola do KnowledgeHub.',
    },
    en: {
      subject: 'New plan request: {plan} · {client}',
      title: 'New plan request',
      body: '{who} ({email}) from {client} requested {plan} ({seats} seats, {cycle}). {notes}',
      cta: 'Open Requests in the console',
      foot: 'You receive this email as an administrator of the KnowledgeHub Console.',
    },
  },
  planApproved: {
    pt: {
      subject: 'O seu pedido de plano foi aprovado · KnowledgeHub',
      title: 'Pedido aprovado',
      body: 'O pedido de {plan} para {client} foi aprovado e já está ativo. {extra}',
      cta: 'Abrir o KnowledgeHub',
      foot: 'Obrigado por usar o KnowledgeHub.',
    },
    en: {
      subject: 'Your plan request was approved · KnowledgeHub',
      title: 'Request approved',
      body: 'The {plan} request for {client} was approved and is active now. {extra}',
      cta: 'Open KnowledgeHub',
      foot: 'Thank you for using KnowledgeHub.',
    },
  },
  planRejected: {
    pt: {
      subject: 'Sobre o seu pedido de plano · KnowledgeHub',
      title: 'Pedido não aprovado',
      body: 'Não foi possível aprovar o pedido de {plan} para {client}. {extra} Responda a este email se quiser falar connosco.',
      foot: 'Obrigado por usar o KnowledgeHub.',
    },
    en: {
      subject: 'About your plan request · KnowledgeHub',
      title: 'Request not approved',
      body: "We couldn't approve the {plan} request for {client}. {extra} Reply to this email if you'd like to talk to us.",
      foot: 'Thank you for using KnowledgeHub.',
    },
  },
  monitorAlert: {
    pt: {
      subject: 'Alerta · KnowledgeHub com problemas',
      title: 'Algo não está a funcionar',
      body: 'A verificação automática encontrou estes problemas:\n{list}\nVolta a avisar a cada 6 horas enquanto durarem, e quando ficarem resolvidos.',
      cta: 'Abrir a consola',
      foot: 'Recebe este email por ser administrador da consola.',
    },
    en: {
      subject: 'Alert · KnowledgeHub has problems',
      title: 'Something is not working',
      body: 'The automatic check found these problems:\n{list}\nYou will be told again every 6 hours while they last, and when they are solved.',
      cta: 'Open the console',
      foot: 'You receive this email as a console administrator.',
    },
  },
  monitorRecovered: {
    pt: {
      subject: 'Resolvido · KnowledgeHub voltou ao normal',
      title: 'Tudo a funcionar',
      body: 'Os problemas detetados pela verificação automática já não se verificam.',
      cta: 'Abrir a consola',
      foot: 'Recebe este email por ser administrador da consola.',
    },
    en: {
      subject: 'Resolved · KnowledgeHub is back to normal',
      title: 'All working',
      body: 'The problems found by the automatic check are gone.',
      cta: 'Open the console',
      foot: 'You receive this email as a console administrator.',
    },
  },
  accountDeleted: {
    pt: {
      subject: 'A sua conta foi eliminada · KnowledgeHub',
      title: 'Conta eliminada',
      body: 'Olá {name}, a sua conta do KnowledgeHub e os dados que lhe pertenciam foram eliminados, como pediu. Os ficheiros são removidos do armazenamento nas próximas 48 horas e as cópias de segurança expiram de acordo com a política de privacidade.',
      cta: '',
      foot: 'Se não foi você a pedir, responda a este email imediatamente.',
    },
    en: {
      subject: 'Your account was deleted · KnowledgeHub',
      title: 'Account deleted',
      body: 'Hi {name}, your KnowledgeHub account and the data that belonged to it were deleted, as you asked. Files are removed from storage within 48 hours and backups expire according to the privacy policy.',
      cta: '',
      foot: "If you didn't ask for this, reply to this email right away.",
    },
  },
  renewalReminder: {
    pt: {
      subject: 'A sua subscrição renova em {days} dias · KnowledgeHub',
      title: 'Renovação próxima',
      body: 'A subscrição {plan} de {client} renova a {date}. Se precisar de mudar de plano ou de lugares, responda a este email.',
      cta: 'Abrir o KnowledgeHub',
      foot: 'Recebe este email por ser administrador da conta.',
    },
    en: {
      subject: 'Your subscription renews in {days} days · KnowledgeHub',
      title: 'Upcoming renewal',
      body: 'The {plan} subscription of {client} renews on {date}. If you need to change plan or seats, reply to this email.',
      cta: 'Open KnowledgeHub',
      foot: 'You receive this email as the account administrator.',
    },
  },
  verify: {
    pt: {
      subject: 'Confirme o seu email · KnowledgeHub',
      title: 'Confirme o seu email',
      body: 'Obrigado por se registar no KnowledgeHub. Confirme o seu endereço para ativar a conta. O link é válido durante 24 horas.',
      cta: 'Confirmar email',
      foot: 'Se não criou esta conta, ignore este email.',
    },
    en: {
      subject: 'Confirm your email · KnowledgeHub',
      title: 'Confirm your email',
      body: 'Thanks for signing up to KnowledgeHub. Confirm your address to activate your account. The link is valid for 24 hours.',
      cta: 'Confirm Email',
      foot: "If you didn't create this account, ignore this email.",
    },
  },
  reset: {
    pt: {
      subject: 'Recuperar password · KnowledgeHub',
      title: 'Recuperar a password',
      body: 'Recebemos um pedido para definir uma nova password. O link é válido durante 30 minutos e só pode ser usado uma vez.',
      cta: 'Definir nova password',
      foot: 'Se não fez este pedido, ignore este email — a sua password não muda.',
    },
    en: {
      subject: 'Reset your password · KnowledgeHub',
      title: 'Reset your password',
      body: 'We received a request to set a new password. The link is valid for 30 minutes and can only be used once.',
      cta: 'Set New Password',
      foot: "If you didn't ask for this, ignore this email — your password won't change.",
    },
  },
  emailChanged: {
    pt: {
      subject: 'O email da sua conta foi alterado · KnowledgeHub',
      title: 'Email da conta alterado',
      body: 'A administração do KnowledgeHub alterou o email da sua conta para {email}. A partir de agora entre com esse endereço.',
      foot: 'Se não pediu esta alteração, responda a este email de imediato.',
    },
    en: {
      subject: 'Your account email was changed · KnowledgeHub',
      title: 'Account email changed',
      body: 'The KnowledgeHub administration changed your account email to {email}. From now on, sign in with that address.',
      foot: "If you didn't ask for this change, reply to this email right away.",
    },
  },
  changed: {
    pt: {
      subject: 'A sua password foi alterada · KnowledgeHub',
      title: 'Password alterada',
      body: 'A password da sua conta KnowledgeHub foi alterada e todas as sessões abertas foram terminadas. A palavra-passe mestra do cofre de Passwords não mudou.',
      foot: 'Se não foi você, recupere já a password no ecrã de início de sessão e contacte o suporte.',
    },
    en: {
      subject: 'Your password was changed · KnowledgeHub',
      title: 'Password changed',
      body: 'Your KnowledgeHub password was changed and every open session was signed out. Your Passwords vault master password did not change.',
      foot: "If this wasn't you, reset your password from the sign-in screen now and contact support.",
    },
  },
  setup: {
    pt: {
      subject: 'Defina a sua password · KnowledgeHub',
      title: 'Bem-vindo ao KnowledgeHub',
      body: 'Foi criada uma conta para si. Defina a sua password para entrar. O link é válido durante 7 dias.',
      cta: 'Definir password',
      foot: 'Se não esperava este email, ignore-o.',
    },
    en: {
      subject: 'Set your password · KnowledgeHub',
      title: 'Welcome to KnowledgeHub',
      body: 'An account was created for you. Set your password to sign in. The link is valid for 7 days.',
      cta: 'Set Password',
      foot: "If you weren't expecting this email, ignore it.",
    },
  },
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function renderMail(
  kind: keyof typeof COPY,
  lang: Lang,
  to: string,
  link?: string,
  vars: Record<string, string> = {},
): MailMessage {
  const fill = (s: string) => s.replace(/\{(\w+)\}/g, (_m, k: string) => vars[k] ?? '');
  const c0 = COPY[kind]![lang];
  const c = { ...c0, subject: fill(c0.subject), title: fill(c0.title), body: fill(c0.body) };
  const text = [c.title, '', c.body, link ? `\n${c.cta}: ${link}` : '', '', c.foot].join('\n');
  const button =
    link && c.cta
      ? `<p style="margin:28px 0"><a href="${esc(link)}" style="display:inline-block;padding:13px 24px;border-radius:999px;background:#2a211c;color:#fbf8f5;font-weight:600;text-decoration:none">${esc(c.cta)}</a></p>
         <p style="font-size:12px;color:#7a6e66;word-break:break-all">${esc(link)}</p>`
      : '';
  const html = `<!doctype html><html lang="${lang}"><body style="margin:0;background:#f4efe9;font-family:Geist,Inter,Segoe UI,Helvetica,Arial,sans-serif;color:#2a211c">
  <div style="max-width:520px;margin:0 auto;padding:40px 24px">
    <div style="font-size:20px;font-weight:700;letter-spacing:-.02em;margin-bottom:24px">Knowledge<span style="color:#1f7ae0">Hub</span></div>
    <div style="background:#fff;border-radius:24px;padding:32px;border:1px solid #e8dfd5">
      <h1 style="margin:0 0 12px;font-size:22px;letter-spacing:-.02em">${esc(c.title)}</h1>
      <p style="margin:0;font-size:15px;line-height:1.6">${esc(c.body).replace(/\n/g, '<br>')}</p>
      ${button}
    </div>
    <p style="font-size:12px;line-height:1.5;color:#7a6e66;margin:20px 8px 0">${esc(c.foot)}</p>
  </div></body></html>`;
  return { to, subject: c.subject, text, html, kind };
}
