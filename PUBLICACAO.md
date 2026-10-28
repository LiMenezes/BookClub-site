# Publicação do BookClub sem contratar planos pagos

## Preparação técnica incluída

- Configuração Render `plan: free` explícita, sem criar banco com prazo de expiração no Render.
- Backend Node.js e PostgreSQL externo com conexão TLS validada.
- Schema `bookclub` separado, sem acesso das funções públicas `anon` e `authenticated` do Supabase. A autenticação do site continua no próprio backend.
- Opções de envio transacional por Brevo/Resend via HTTPS e SMTP como alternativa.
- Confirmação de e-mail obrigatória em produção, sessão segura e validação do ambiente antes de iniciar.
- Dockerfile executando com usuário sem privilégios, lista restrita de arquivos e health check.
- Testes automáticos no GitHub, incluindo PostgreSQL 16 nativo e backup/restauração em um banco de teste separado.
- Scripts de backup, restauração sem sobrescrever um banco existente e preflight de configuração.
- Encerramento das conexões de eventos durante reinícios da hospedagem.

## Acessos ainda necessários

1. Render: autorizar a integração para criar um Web Service gratuito e conectar o repositório.
2. Supabase: autorizar a integração e selecionar/criar o projeto gratuito destinado ao site. Não utilizar ou alterar as tabelas do aplicativo mobile sem verificar como ele está configurado. O site utiliza schema separado.
3. E-mail transacional: escolher uma conta Brevo ou Resend, validar o remetente exigido pelo provedor e cadastrar a chave no ambiente secreto da hospedagem. Não colocar chaves em mensagens, GitHub ou ZIP.
4. Login Google/GitHub: registrar os aplicativos OAuth, autorizar o uso e cadastrar os respectivos client IDs/secrets. Os callbacks usam a URL HTTPS real do serviço, portanto só podem ser finalizados após criar a hospedagem.

Esses serviços pertencem à dupla. Criar contas, confirmar e-mails, aceitar termos e autorizar acesso pode exigir participação das responsáveis. Nenhum plano pago foi autorizado.

## Render

O `render.yaml` configura um serviço web gratuito e lê a URL final em `RENDER_EXTERNAL_URL`. A publicação automática fica condicionada aos checks do GitHub. Os valores `DATABASE_URL`, certificado CA, remetente e chave de e-mail devem ser cadastrados na hospedagem.

Não criar Render Postgres gratuito para armazenar os dados de longo prazo: o plano gratuito documentado expira após 30 dias. O serviço web gratuito também bloqueia SMTP nas portas comuns, por isso o projeto suporta API HTTPS para e-mails.

Fontes: [Render gratuito](https://render.com/docs/free), [Blueprints](https://render.com/docs/blueprint-spec).

## Supabase e banco

Use a conexão apropriada para backend persistente, preferencialmente o pooler de sessão quando precisar de IPv4. Guarde a URL exclusivamente no ambiente do servidor. Configure `DB_SSL=verify` e a CA fornecida pelo projeto em `DB_SSL_CA` quando necessária. O cliente não desativa a verificação TLS.

As migrações usam somente o schema configurado em `DB_SCHEMA`. Se existir uma base anterior em `public`, a mudança para `bookclub` não a transfere nem a apaga automaticamente. A migração dos dados locais precisa ser planejada antes de disponibilizar a instalação pública.

Fontes: [conexões Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres), [TLS](https://supabase.com/docs/guides/platform/ssl-enforcement).

## E-mail

Render gratuito usa envio HTTPS. Configure `BREVO_API_KEY` ou `RESEND_API_KEY` e `MAIL_FROM`. O provedor exige um remetente válido/autorizado e pode exigir autenticação de domínio. Não há remetente público fictício pronto para usar. O endpoint de configuração publica apenas disponibilidade, nunca chaves.

Fontes: [Brevo transacional](https://developers.brevo.com/docs/send-a-transactional-email), [remetentes Brevo](https://developers.brevo.com/docs/getting-started-with-senders-and-domains), [Resend oficial](https://github.com/resend/resend-node).

## Validação depois da implantação

1. Executar `npm run preflight` no ambiente do servidor.
2. Confirmar `GET /api/health` retornando 200.
3. Cadastrar uma conta de teste autorizada, receber e confirmar o e-mail.
4. Confirmar recuperação de senha, saída e revogação das sessões.
5. Testar Google/GitHub, caso configurados.
6. Conferir os fluxos com duas contas e em dispositivos reais.
7. Fazer backup e restaurá-lo em banco separado antes de depender dele.

Os testes usam mensagens capturadas e provedores simulados para não enviar e-mails reais sem configurar uma conta. Aprovação de testes locais não demonstra entrega real de e-mail nem confirma implantação pública.

## Backups

É preciso ter as ferramentas oficiais PostgreSQL no PATH. O script passa credenciais por ambiente, nunca pela linha de comando. Para TLS, configure `PGSSLROOTCERT` com o caminho do certificado usado pelas ferramentas PostgreSQL, quando exigido pelo provedor.

```sh
npm run backup -- backups/bookclub.dump
```

Para restaurar, configure `RESTORE_DATABASE_URL` apontando para outro banco vazio. O script recusa o banco de origem e destinos que já tenham tabelas. Não é necessário executar esse procedimento sobre o banco de produção para testar uma restauração.

```sh
npm run restore -- backups/bookclub.dump --empty-target
```

Backups contêm dados privados e devem ficar fora de repositórios e links públicos. Não há cópia automática dos cadastros locais para o banco externo.

## Limites desta primeira implantação

Uma instância do backend. Eventos e limite de requisições são locais ao processo. Os limites dos serviços gratuitos precisam ser acompanhados; nenhum plano gratuito equivale a disponibilidade garantida. Notificações push e mensagens agendadas por e-mail não foram acrescentadas. Não foi contratada auditoria externa de segurança.
