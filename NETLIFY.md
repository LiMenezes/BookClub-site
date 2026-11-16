# Publicação BookClub no Netlify (Free)

Estado: preparação local, ainda sem publicação no Netlify. O Render continua ativo.

## Configuração

- Conectar o repositório LiMenezes/BookClub-site, usando inicialmente uma branch da migração.
- Build: npm run build:netlify. Publish: dist. Functions: netlify/functions.
- O netlify.toml contém as rotas e os cabeçalhos de segurança. Somente dist é público.
- Não usar upload apenas de dist: as funções também são necessárias para login, livros e dados.
- Usar Free, sem recarga automática ou adicionais pagos. A franquia de créditos pode pausar o projeto ao atingir o limite.
- Preservar o projeto PostgreSQL Supabase atual e o schema bookclub. Não criar outro banco e não importar cadastros locais.

## Variáveis privadas (escopo Functions)

Copiar apenas estas configurações do serviço BookClub no Render para o projeto Netlify, após autorização da proprietária:
NODE_ENV=production
DB_DRIVER=postgres
DB_SCHEMA=bookclub
DB_SSL=verify
DB_POOL_MAX=2
DATABASE_URL (mesma conexão Supabase)
DB_PASSWORD (senha atual, não redefinir)
DB_SSL_CA (certificado oficial atual)
REQUIRE_EMAIL=true
TRUST_PROXY=1
MAIL_FROM (BookClub <bookclub374@gmail.com>)
BREVO_API_KEY
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_BOOKS_API_KEY
APP_ORIGIN=https://ENDERECO-REAL.netlify.app

Nunca colocar senhas, chaves, .env ou exportações de ambiente em GitHub, ZIP ou dist.
Não reutilizar RENDER_EXTERNAL_URL: o endereço confiável é APP_ORIGIN.

## Compatibilidade

- index.html e assets são entregues pela CDN; APIs usam Netlify Functions com Express/serverless-http.
- Inicialização única por função aquecida, com nova tentativa após falha.
- O banco registra a versão aplicada do schema para não repetir todas as alterações a cada inicialização.
- Migração e proteções transacionais: falhas não gravam a versão aplicada.
- Novos objetos auxiliares privados: schema_releases e request_limits, com RLS.
- Limites de tentativas compartilhados no PostgreSQL, preservados entre instâncias.
- Notificações atualizadas a cada 30 segundos enquanto a aba está visível; sem conexão de duração ilimitada.
- Cookies seguros, CSRF e origem restrita continuam ativos.

## Antes de anunciar o novo link

1. Backup do schema bookclub antes da primeira função que aplica a migração.
2. Confirmar Free e configurar as variáveis privadas; nenhum segredo vai para o build estático.
3. Executar build e testes, incluindo PostgreSQL nativo no CI.
4. Publicar e validar /api/health e /api/config no endereço real.
5. Adicionar a origem real e /api/auth/oauth/google/callback ao Google, com aprovação específica; manter localhost/Render enquanto houver transição.
6. Testar login Google real, conta existente, nova conta manual, confirmação e recuperação de e-mail, estante, resenha, listas e perfil.
7. Validar em celular. Só então divulgar o link. Não apagar o serviço antigo durante a validação.

O Netlify remove a página de despertar do Render. Funções ainda podem ter uma pequena inicialização; o plano gratuito não garante disponibilidade ilimitada.

## Referência do app

Código recebido: https://github.com/yasmin-sntgo/BookClub
O app usa Supabase Auth; o site usa autenticação própria no backend. Esta mudança de hospedagem não unifica automaticamente as contas dos dois produtos.
