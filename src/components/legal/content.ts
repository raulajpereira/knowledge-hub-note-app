// Terms of Service and Privacy Policy (draft, decision D50): written for the
// way the service actually works — sales outside the app, EU hosting, an
// end-to-end encrypted vault, 30-day retention after revocation, only
// strictly necessary cookies. {entity}, {nif}, {address}, {email} come from
// LEGAL_* in .env. To be reviewed by a lawyer before LEGAL_REVIEWED=true.

export type LegalSection = { h: string; p: string[] };
export type LegalDoc = { title: string; intro: string; sections: LegalSection[] };
type Lang = 'pt' | 'en';

const terms: Record<Lang, LegalDoc> = {
  pt: {
    title: 'Termos de Utilização',
    intro:
      'Estes termos regulam a utilização do KnowledgeHub, prestado por {entity} (NIF {nif}, {address}). Ao criar conta ou usar o serviço aceita estes termos.',
    sections: [
      {
        h: '1. O serviço',
        p: [
          'O KnowledgeHub é uma aplicação web para organizar notas, tarefas, calendário, palavras-passe, emails, código, sistemas e processos SAP e a gestão de equipas, disponibilizada por módulos consoante o plano contratado.',
        ],
      },
      {
        h: '2. Conta e acesso',
        p: [
          'O registo exige um código de licença ou um convite válido, um email confirmado e uma palavra-passe. É responsável por manter as credenciais em segurança e por toda a atividade feita na sua conta; recomendamos ativar a autenticação de dois fatores.',
          'Num pacote de equipa, o administrador do cliente gere os lugares e os convites. As contas são pessoais e não podem ser partilhadas.',
        ],
      },
      {
        h: '3. Planos, preços e pagamento',
        p: [
          'Os planos e preços em vigor são os indicados na aplicação. A contratação de planos pagos, a faturação e os pagamentos são feitos fora da aplicação, nos termos da proposta aceite. Os pedidos de plano feitos na aplicação não constituem compra até serem confirmados por nós.',
          'Uma subscrição paga não renovada até à data de renovação fica "em atraso" e, 7 dias depois, a conta passa a só leitura até à regularização. Os períodos de experiência terminam na data indicada.',
        ],
      },
      {
        h: '4. Utilização aceitável',
        p: [
          'Não pode usar o serviço para atividades ilegais, para guardar ou distribuir conteúdo ilícito ou malicioso, para tentar aceder a dados de outros clientes, para contornar limites técnicos ou de licença, nem para sobrecarregar ou atacar a infraestrutura. O API Playground só pode ser usado contra sistemas que esteja autorizado a testar.',
        ],
      },
      {
        h: '5. O seu conteúdo',
        p: [
          'O conteúdo que cria ou importa é seu. Concede-nos apenas a autorização necessária para o guardar, processar e mostrar a quem decidir partilhar, com o único fim de prestar o serviço.',
          'Pode exportar os seus dados e eliminar a conta a qualquer momento em Conta e Dados.',
        ],
      },
      {
        h: '6. Cofre de palavras-passe',
        p: [
          'O cofre é cifrado no seu navegador com uma palavra-passe mestra que nunca chega aos nossos servidores. Sem a palavra-passe mestra e sem a chave de recuperação, os dados do cofre não podem ser recuperados — nem por nós.',
        ],
      },
      {
        h: '7. Disponibilidade e alterações do serviço',
        p: [
          'Fazemos o possível por manter o serviço disponível e seguro, com manutenções anunciadas sempre que possível, mas não garantimos funcionamento ininterrupto. Podemos evoluir funcionalidades; alterações relevantes a um plano contratado são comunicadas com antecedência.',
        ],
      },
      {
        h: '8. Suspensão e cessação',
        p: [
          'Podemos suspender o acesso em caso de violação destes termos, risco de segurança ou falta de pagamento. Quando uma licença é revogada ou o contrato termina, o acesso é cortado e os dados ficam guardados 30 dias, durante os quais podem ser restaurados; depois são eliminados definitivamente, incluindo os ficheiros.',
        ],
      },
      {
        h: '9. Responsabilidade',
        p: [
          'O serviço é prestado com a diligência devida. Na medida permitida por lei, não respondemos por danos indiretos ou lucros cessantes, e a nossa responsabilidade total fica limitada ao valor pago pelo serviço nos 12 meses anteriores ao facto. Nada nestes termos limita direitos que a lei não permita afastar.',
        ],
      },
      {
        h: '10. Alterações a estes termos',
        p: [
          'Podemos atualizar estes termos; a data da última atualização está no topo. Alterações substanciais são comunicadas por email ou na aplicação antes de entrarem em vigor.',
        ],
      },
      {
        h: '11. Lei aplicável e contacto',
        p: [
          'Aplica-se a lei portuguesa. Para qualquer questão contacte {email}. Os litígios são resolvidos nos tribunais da comarca da sede de {entity}, sem prejuízo das normas imperativas aplicáveis a consumidores, que podem também recorrer a uma entidade de resolução alternativa de litígios.',
        ],
      },
    ],
  },
  en: {
    title: 'Terms of Service',
    intro:
      'These terms govern the use of KnowledgeHub, provided by {entity} (VAT {nif}, {address}). By creating an account or using the service you accept these terms.',
    sections: [
      {
        h: '1. The service',
        p: [
          'KnowledgeHub is a web application to organise notes, tasks, calendar, passwords, emails, code, SAP systems and processes and team management, available in modules according to the plan you have.',
        ],
      },
      {
        h: '2. Account and access',
        p: [
          'Signing up requires a valid license code or invitation, a confirmed email and a password. You are responsible for keeping your credentials safe and for all activity in your account; we recommend turning on two-factor authentication.',
          "In a team plan, the client's administrator manages seats and invitations. Accounts are personal and may not be shared.",
        ],
      },
      {
        h: '3. Plans, prices and payment',
        p: [
          'Current plans and prices are those shown in the application. Paid plans, invoicing and payments are handled outside the application, under the accepted proposal. Plan requests made in the application are not a purchase until we confirm them.',
          'A paid subscription not renewed by its renewal date becomes "past due" and, 7 days later, the account becomes read-only until it is settled. Trial periods end on the date shown.',
        ],
      },
      {
        h: '4. Acceptable use',
        p: [
          "You may not use the service for illegal activities, to store or distribute unlawful or malicious content, to try to access other clients' data, to circumvent technical or license limits, or to overload or attack the infrastructure. The API Playground may only be used against systems you are authorised to test.",
        ],
      },
      {
        h: '5. Your content',
        p: [
          'The content you create or import is yours. You only grant us the permission needed to store it, process it and show it to whoever you choose to share it with, solely to provide the service.',
          'You can export your data and delete your account at any time in Account & Data.',
        ],
      },
      {
        h: '6. Password vault',
        p: [
          'The vault is encrypted in your browser with a master password that never reaches our servers. Without the master password and without the recovery key, vault data cannot be recovered — not even by us.',
        ],
      },
      {
        h: '7. Availability and changes to the service',
        p: [
          'We do our best to keep the service available and secure, announcing maintenance whenever possible, but we do not guarantee uninterrupted operation. We may evolve features; relevant changes to a plan you have are announced in advance.',
        ],
      },
      {
        h: '8. Suspension and termination',
        p: [
          'We may suspend access in case of a breach of these terms, a security risk or non-payment. When a license is revoked or the contract ends, access stops and the data is kept for 30 days, during which it can be restored; after that it is permanently deleted, files included.',
        ],
      },
      {
        h: '9. Liability',
        p: [
          'The service is provided with due care. To the extent permitted by law, we are not liable for indirect damages or loss of profit, and our total liability is limited to the amount paid for the service in the 12 months before the event. Nothing in these terms limits rights that the law does not allow to be excluded.',
        ],
      },
      {
        h: '10. Changes to these terms',
        p: [
          'We may update these terms; the date of the last update is at the top. Substantial changes are announced by email or in the application before they take effect.',
        ],
      },
      {
        h: '11. Governing law and contact',
        p: [
          'Portuguese law applies. For any question contact {email}. Disputes are settled in the courts of the registered office of {entity}, without prejudice to mandatory consumer rules; consumers may also use an alternative dispute resolution body.',
        ],
      },
    ],
  },
};

const privacy: Record<Lang, LegalDoc> = {
  pt: {
    title: 'Política de Privacidade',
    intro:
      'Esta política explica que dados pessoais o KnowledgeHub trata, porquê, durante quanto tempo e quais os seus direitos, nos termos do Regulamento Geral sobre a Proteção de Dados (RGPD).',
    sections: [
      {
        h: '1. Responsável pelo tratamento',
        p: [
          '{entity}, NIF {nif}, {address}. Contacto para questões de privacidade: {email}.',
          'Quando um cliente (empresa) contrata o serviço para a sua equipa, esse cliente é responsável pelos dados que os seus utilizadores lá colocam e nós atuamos como subcontratante, nos termos do contrato.',
        ],
      },
      {
        h: '2. Que dados tratamos',
        p: [
          'Conta: nome, email, palavra-passe (guardada só como hash Argon2id), idioma, foto e preferências, e o segredo da autenticação de dois fatores (cifrado).',
          'Conteúdo: o que cria ou importa (notas, tarefas, emails, ficheiros, código, dados de projetos e equipas). O cofre de palavras-passe é cifrado no seu navegador e não o conseguimos ler.',
          'Dados técnicos e de segurança: endereço IP, navegador, sessões ativas, tentativas de início de sessão e um registo de auditoria das ações relevantes.',
        ],
      },
      {
        h: '3. Finalidades e fundamentos',
        p: [
          'Prestar o serviço contratado e dar suporte (execução do contrato); proteger as contas e a infraestrutura, prevenir abusos e manter a auditoria (interesse legítimo); cumprir obrigações legais, nomeadamente fiscais (obrigação legal); enviar emails de serviço como confirmações, avisos de segurança e de renovação (execução do contrato). Não fazemos publicidade nem vendemos dados.',
        ],
      },
      {
        h: '4. Subcontratantes e transferências',
        p: [
          'Hostinger (alojamento do servidor, base de dados e ficheiros num centro de dados na União Europeia, e envio de email). Quando ativado, Cloudflare Turnstile para o desafio anti-robô no início de sessão. O serviço consulta ainda, a partir do nosso servidor e sem dados pessoais, a previsão do tempo (Open-Meteo) e verifica se uma nova palavra-passe consta de fugas conhecidas (Have I Been Pwned, só com parte do hash).',
          'Os dados ficam na União Europeia. Se algum subcontratante tratar dados fora do Espaço Económico Europeu, fá-lo com as garantias exigidas pelo RGPD.',
        ],
      },
      {
        h: '5. Durante quanto tempo',
        p: [
          'Enquanto a conta existir. Ao eliminar a conta, os dados são apagados de imediato e os ficheiros no prazo de 48 horas. Após a revogação de uma licença ou o fim do contrato: 30 dias (para permitir restauro), depois eliminação definitiva. Registo de auditoria: 2 anos. Cópias de segurança cifradas: até 6 meses, após o que expiram.',
        ],
      },
      {
        h: '6. Cookies',
        p: [
          'Só usamos cookies estritamente necessários: a sessão (kh_session), o idioma (kh_lang), o fuso horário para a saudação (kh_tz) e o desbloqueio de links partilhados com palavra-passe. Não usamos cookies de análise nem de publicidade, por isso não é pedido consentimento.',
        ],
      },
      {
        h: '7. Os seus direitos',
        p: [
          'Pode aceder aos seus dados e exportá-los (Conta e Dados › Exportar), corrigi-los, eliminá-los (Conta e Dados › Eliminar conta), opor-se a tratamentos baseados em interesse legítimo, pedir a limitação e a portabilidade. Para exercer qualquer direito contacte {email}; respondemos no prazo de um mês. Pode também apresentar reclamação à Comissão Nacional de Proteção de Dados (www.cnpd.pt).',
        ],
      },
      {
        h: '8. Segurança',
        p: [
          'Ligações cifradas (HTTPS), isolamento dos dados de cada cliente na base de dados, palavras-passe com Argon2id, cofre cifrado ponta a ponta, autenticação de dois fatores, limites de tentativas, cabeçalhos de segurança e auditoria. Em caso de violação de dados que o afete, será informado nos termos da lei.',
        ],
      },
      {
        h: '9. Alterações',
        p: [
          'Esta política pode ser atualizada; a data da última atualização está no topo. Alterações relevantes são comunicadas por email ou na aplicação.',
        ],
      },
    ],
  },
  en: {
    title: 'Privacy Policy',
    intro:
      'This policy explains which personal data KnowledgeHub processes, why, for how long and what your rights are, under the General Data Protection Regulation (GDPR).',
    sections: [
      {
        h: '1. Controller',
        p: [
          '{entity}, VAT {nif}, {address}. Contact for privacy matters: {email}.',
          'When a client (company) contracts the service for its team, that client is the controller of the data its users put in it and we act as its processor, under the contract.',
        ],
      },
      {
        h: '2. Which data we process',
        p: [
          'Account: name, email, password (stored only as an Argon2id hash), language, photo and preferences, and the two-factor authentication secret (encrypted).',
          'Content: what you create or import (notes, tasks, emails, files, code, project and team data). The password vault is encrypted in your browser and we cannot read it.',
          'Technical and security data: IP address, browser, active sessions, sign-in attempts and an audit log of relevant actions.',
        ],
      },
      {
        h: '3. Purposes and legal bases',
        p: [
          'To provide the contracted service and support (performance of contract); to protect accounts and infrastructure, prevent abuse and keep the audit log (legitimate interest); to meet legal obligations, namely tax ones (legal obligation); to send service emails such as confirmations, security and renewal notices (performance of contract). We do not advertise or sell data.',
        ],
      },
      {
        h: '4. Processors and transfers',
        p: [
          'Hostinger (hosting of the server, database and files in a data centre in the European Union, and email delivery). When enabled, Cloudflare Turnstile for the anti-bot challenge at sign-in. From our server and without personal data, the service also fetches the weather forecast (Open-Meteo) and checks whether a new password appears in known breaches (Have I Been Pwned, with only part of the hash).',
          'Data stays in the European Union. If a processor handles data outside the European Economic Area, it does so with the safeguards required by the GDPR.',
        ],
      },
      {
        h: '5. How long',
        p: [
          'While the account exists. When you delete the account, the data is deleted at once and files within 48 hours. After a license is revoked or the contract ends: 30 days (to allow a restore), then permanent deletion. Audit log: 2 years. Encrypted backups: up to 6 months, after which they expire.',
        ],
      },
      {
        h: '6. Cookies',
        p: [
          'We only use strictly necessary cookies: the session (kh_session), the language (kh_lang), the time zone for the greeting (kh_tz) and the unlocking of password-protected shared links. We use no analytics or advertising cookies, so no consent is asked.',
        ],
      },
      {
        h: '7. Your rights',
        p: [
          'You can access and export your data (Account & Data › Export), correct it, delete it (Account & Data › Delete account), object to processing based on legitimate interest, and ask for restriction and portability. To exercise any right contact {email}; we reply within one month. You may also lodge a complaint with the Portuguese data protection authority (CNPD, www.cnpd.pt).',
        ],
      },
      {
        h: '8. Security',
        p: [
          "Encrypted connections (HTTPS), isolation of each client's data in the database, Argon2id passwords, end-to-end encrypted vault, two-factor authentication, attempt limits, security headers and auditing. If a data breach affects you, you will be informed as required by law.",
        ],
      },
      {
        h: '9. Changes',
        p: [
          'This policy may be updated; the date of the last update is at the top. Relevant changes are announced by email or in the application.',
        ],
      },
    ],
  },
};

export const LEGAL = { terms, privacy };
