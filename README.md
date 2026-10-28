# BookClub 2.3

Rede social literária com interface em preto, creme e azul claro, baseada nas telas mobile fornecidas por Alicia e Yasmin. O frontend ativo está em `public/` e o backend em `backend/`. As páginas antigas de `src/` redirecionam pelo servidor para os fluxos novos. O navegador não é mais a fonte de verdade dos dados.

## Abrir na sua máquina

Requisitos: Node.js 22 ou superior.

```sh
npm install
npm start
```

Abra **http://localhost:3000**. Também é possível abrir `INICIAR-BOOKCLUB.cmd` no Windows depois de instalar as dependências. Não abra o HTML por duplo clique: login, banco e catálogo dependem do servidor.

`npm start` usa **PGlite**, uma compilação real do PostgreSQL em WebAssembly, com dados persistidos em `data/postgres-local/`. Serve para desenvolvimento e demonstração local. Não precisa instalar Docker. Esse modo aceita uma única instância do servidor por diretório de dados. Não abra o mesmo banco simultaneamente em dois processos e não sincronize o diretório do banco durante uso.

O PostgreSQL externo continua disponível com:

```sh
npm run start:postgres
```

Esse comando usa `DATABASE_URL` do `.env`. Não há fallback silencioso entre bancos. Dados do modo local e do PostgreSQL externo são bases separadas.

## O que está conectado ao banco

- Contas com senha bcrypt, sessão em cookie HttpOnly, saída e revogação de sessões na troca de senha.
- Confirmação de e-mail, recuperação com token de uso único e expiração, envio por HTTPS (Brevo/Resend) ou SMTP configurável.
- Login Google e GitHub com fluxo de autorização no servidor, estado temporário e PKCE, condicionado às credenciais dos provedores.
- Perfil com nome, bio, avatar, banner, até cinco links HTTPS e até quatro livros favoritos.
- Contas privadas: pedidos para seguir e aprovação, com checagem no backend para estante, resenhas, comentários, listas e relações de seguidores.
- Busca em livros locais, leitores e listas, além de consulta a Open Library ou Google Books. Não há catálogo falso pré-carregado.
- ISBN-10/13 com dígito verificador. A validação matemática não comprova a autenticidade de uma edição. Normalização e comparação de similaridade para detectar duplicatas.
- Cadastro manual não verificado, denúncia e fila de moderação. O selo exige aprovação de um moderador.
- Estante com lendo, quero ler, lido, pausado e abandonado; progresso por página ou percentual, etiquetas e datas.
- Diário de conclusões e releituras, com proteção contra contagem dupla ao salvar novamente uma conclusão.
- Metas com quantidade e intervalo livre, sugestões anual/mensal/semanal, contagem por data de conclusão, ritmo e selos de progresso.
- Resenhas com meias estrelas, aviso de spoiler, edição/exclusão pelo autor, curtidas e comentários.
- Feed de resenhas gerais ou de seguidos, atividades de leitura e de metas atingidas, sugestões por livros em comum.
- Eventos do servidor (SSE) para avisar a interface sobre alterações e atualizar notificações/resenhas. Sem depender de localStorage para troca de dados.
- Listas públicas/privadas, capa, título, descrição, curtidas e organização por arrastar/soltar ou botões, notas e data de cadastro do livro.
- Notificações de seguidores, curtidas, comentários e metas completas; lembretes de metas dentro da central. Não há envio agendado de lembretes por e-mail ou notificações push.
- Estatísticas por período: conclusões, páginas de livros concluídos, gêneros e autores. A média de notas considera todas as resenhas do leitor e está identificada como geral na interface.
- Citações privadas e exportação pessoal em JSON.

## Serviços externos: configurações necessárias

O `.env` existente foi preservado. Veja `.env.example` para os campos novos. Nunca publique `.env`, `data/`, backups ou credenciais.

### E-mail

Configure `BREVO_API_KEY` ou `RESEND_API_KEY` e um `MAIL_FROM` verificado no provedor. SMTP também é suportado por `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` e `SMTP_PASSWORD`. Sem provedor, a conta local ainda funciona para demonstração, mas envio de confirmação e recuperação ficam indisponíveis. A interface não finge enviar e-mail. Para exigir e-mail confirmado também no desenvolvimento, configure `REQUIRE_EMAIL=true`.

### Google e GitHub

Crie um aplicativo OAuth em cada serviço e configure o client ID e o client secret no servidor. Cadastre exatamente os callbacks:

```text
https://SEU-DOMINIO/api/auth/oauth/google/callback
https://SEU-DOMINIO/api/auth/oauth/github/callback
```

Use `http://localhost:3000` para callbacks locais permitidos pelo provedor. Os botões aparecem quando as respectivas credenciais estão configuradas. O usuário precisa aprovar o login no provedor. Essas integrações não foram exercitadas contra contas reais nesta revisão, pois as credenciais não foram fornecidas.

### Catálogos e câmera

Google Books pode exigir uma chave para quota estável. Open Library e Google Books dependem de disponibilidade e limites externos. Resultados externos passam pela mesma validação de cadastro e não recebem verificação automática apenas por trazer um ID de provedor.

O scanner usa `BarcodeDetector` quando o navegador oferece a API e depende de permissão de câmera e contexto seguro (HTTPS ou localhost). Caso contrário, o ISBN pode ser digitado. Não é preciso permitir câmera para usar o restante do site.

## Moderação

Uma conta comum não pode promover a si mesma a moderadora. O responsável pelo servidor pode executar:

```sh
npm run moderator -- nome_do_usuario
```

No modo local, **pare o servidor antes** e use `DB_DRIVER=pglite` no ambiente para esse comando. Em PostgreSQL externo, use o mesmo `DATABASE_URL` do servidor. Depois de entrar novamente, o perfil do moderador mostra o acesso à fila. A aprovação deve incluir conferência humana da obra. As denúncias são registradas, não apagadas automaticamente.

## Publicação para usuários reais

O modo local escuta apenas nesta máquina. Para disponibilizar à comunidade é preciso escolher hospedagem Node.js e PostgreSQL gerenciado, configurar um domínio HTTPS e os serviços de e-mail/OAuth. Não foi feita publicação nem alteração de contas externas.

No servidor de produção, defina `NODE_ENV=production`, `DB_DRIVER=postgres`, `DATABASE_URL`, `APP_ORIGIN=https://SEU-DOMINIO` e um provedor de e-mail. Veja `.env.production.example` e `PUBLICACAO.md`. Execute `npm run start:postgres`. `HOST` pode ser configurado; produção usa `0.0.0.0` por padrão. Se houver proxy reverso, defina `TRUST_PROXY` com o número exato de proxies confiáveis. Os limitadores e avisos SSE desta versão ficam no processo Node, portanto use uma única instância até introduzir armazenamento compartilhado de limites e eventos.

Use credenciais de banco próprias, backups automáticos e restauração testada na hospedagem. O `docker-compose.yml` é somente para desenvolvimento local. Para uma base que já contém dados, faça backup antes de migrar: as migrações validam índices únicos e podem parar caso existam duplicatas antigas. Não removem esses dados automaticamente.

## Testes

```sh
npm test
```

Os testes usam PostgreSQL embutido em memória, sem tocar no banco pessoal, e exercitam autenticação, CSRF, arquivos protegidos, ISBN, duplicatas, estante, releituras, metas, notas, spoilers, interação, privacidade, aprovação, rollback de listas, exportação, confirmação e recuperação de senha. Também foram conferidos os fluxos no navegador. Testes automatizados reduzem regressões, mas não garantem ausência absoluta de bugs, disponibilidade de serviços externos ou segurança auditada de produção.

## Organização

- `public/index.html`, `public/app.js`, `public/style.css`: interface ativa.
- `backend/server.js`: API e acesso autorizado.
- `backend/schema.sql`: schema original compatível.
- `backend/migrate.sql`: extensões do schema, sem apagar registros.
- `backend/db.js`: conexão PostgreSQL/PGlite e transações.
- `backend/validation.js`: regras de entrada e ISBN.
- `tests/integration.cjs`: jornadas de API com duas contas independentes.

Os arquivos originais foram preservados no backup da revisão. O servidor usa uma lista explícita de arquivos públicos e não disponibiliza fontes do backend, segredos, SQL ou bancos para download.

## Validação de produção

`npm test`: 16 testes passaram nesta revisão. `npm run test:postgres` exige TEST_DATABASE_URL e ferramentas PostgreSQL; sua execução na infraestrutura externa ainda está pendente. `npm run preflight` verifica configuração e conexão. Backups e restauração em banco separado usam `npm run backup` e `npm run restore`; veja PUBLICACAO.md. Auditoria das dependências: zero vulnerabilidades informadas nesta revisão.
