# Migrar o banco atual para o seu projeto Supabase

Objetivo: replicar no SEU projeto Supabase toda a estrutura, os dados e as fotos que hoje existem no banco do PontoScan, mantendo o banco atual funcionando normalmente (nada aqui é apagado).

## O que será copiado

1. **Estrutura** — os tipos (polo, etapa, área, tipo de incidente, papéis), as 11 tabelas (`profiles`, `registros`, `bases`, `incidentes`, `equipe_areas`, `equipe_incidentes`, `equipe_membros_override`, `equipe_area_logs`, `form_questions`, `app_settings`, `user_roles`), as 2 views (`vw_registros_admin`, `vw_tempos`), as funções e triggers de validação/log, as permissões (GRANTs) e todas as regras de segurança (RLS).
2. **Dados** — todas as linhas de todas as tabelas, na ordem correta de dependência (bases e perfis antes de registros e incidentes).
3. **Storage** — o bucket `incidentes-fotos` (privado) recriado no destino, com todos os arquivos copiados e as políticas de acesso equivalentes.

## Sobre os logins (o ponto da sua dúvida)

As senhas dos usuários **não podem ser copiadas**: elas ficam em uma área protegida do Supabase à qual nem eu nem você temos acesso de leitura por aqui. Então o caminho é:

- Recrio as contas no seu projeto com o mesmo **e-mail e o mesmo ID interno** de cada usuário. Isso é essencial, porque é esse ID que liga a conta aos perfis, registros e incidentes — sem ele os dados ficariam órfãos.
- Cada usuário define a senha na primeira entrada (recuperação de senha) — ou, se preferir, eu defino uma senha padrão inicial para todos (por exemplo o padrão de polo + 123 que já usamos) e eles trocam depois.

Sim, você pode ficar com os **dois bancos ao mesmo tempo**: a cópia não altera nada aqui. O que precisa decidir é qual deles o app passa a usar depois — ver a última seção.

## Como vou fazer

1. Você me envia a **connection string do banco de destino** (Postgres URI do seu projeto) e a **service role key + URL** dele, para as fotos. Guardo tudo como segredo, nunca aparece no código.
2. Gero o script de estrutura lendo o catálogo do banco atual e aplico no destino.
3. Exporto os dados tabela a tabela e carrego no destino, conferindo a contagem de linhas de cada uma no final.
4. Recrio as contas de autenticação (mesmos IDs e e-mails) e depois carrego os perfis e papéis.
5. Copio os arquivos do bucket e recrio as políticas do storage.
6. Entrego um **relatório de conferência**: linhas por tabela na origem x no destino, contas criadas e arquivos copiados.

## Depois da cópia

O app hoje aponta para o banco do Lovable Cloud. Apontar o app para o seu projeto é um passo separado (trocar as chaves de conexão), e ele tem efeitos: as ferramentas de banco do Lovable deixam de enxergar o banco em uso e passam a ser gerenciadas por você. Faço isso só se você pedir — por padrão a cópia é só um espelho e o app continua como está.

## Detalhes técnicos

- Estrutura extraída via catálogo (`pg_catalog`/`information_schema`) e reescrita como SQL idempotente; sem `pg_dump` (indisponível neste ambiente).
- Dados via `COPY ... TO STDOUT (CSV)` na origem e `COPY ... FROM STDIN` no destino, com triggers de log/validação desabilitadas durante a carga para preservar timestamps e não gerar logs duplicados.
- Contas recriadas via Auth Admin API do projeto de destino (`auth.admin.createUser` com `id` e `email_confirm: true`); o trigger `handle_new_user` fica desativado durante a criação para não duplicar perfis.
- Arquivos do storage baixados com URL assinada na origem e enviados com service role no destino, mantendo os mesmos caminhos, para que a coluna `fotos` de `incidentes` continue válida.
