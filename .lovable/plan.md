# Construtor de formulários dinâmicos

Um ícone de engrenagem no cabeçalho administrativo (apenas para `ADMIN_DISPATCH`) abrirá um modal para gerenciar as perguntas dos formulários de incidentes sem depender de novas modificações no código.

## Escopo

Para preservar o que já funciona (validação de nº do incidente, GPS, fotos obrigatórias, print de ligação, cruzamento e dash-forms), o construtor gerencia **perguntas extras** anexadas a cada tipo de incidente (`ATENDIMENTO_INDIVIDUAL`, `ORDEM_2`, `IMPRODUTIVO`). O núcleo estruturado dos três formulários continua fixo; o admin adiciona/edita/remove perguntas complementares por tipo.

Tipos de pergunta suportados:
- **Texto curto** (input)
- **Texto longo** (textarea)
- **Escolha única** (radio com opções)

Cada pergunta tem: rótulo, chave interna (autogerada a partir do rótulo), tipo, opções (se choice), obrigatória (sim/não), ordem.

## Fluxo do usuário

1. Dispatch clica na engrenagem ao lado dos botões de ajuda/contas no cabeçalho.
2. Modal abre com abas: **Atendimento Individual · Ordem 2 · Improdutivo**.
3. Em cada aba: lista de perguntas custom (drag simples via botões ↑/↓), botão "Adicionar pergunta" e edição/exclusão inline.
4. Salvar persiste no banco. Eletricistas (mobile) e Parceiras passam a ver as perguntas novas imediatamente.
5. Cards de detalhe do incidente e o dash-forms leem os rótulos corretos a partir dessa configuração.

## Detalhes técnicos

### Banco
Nova tabela `public.form_questions`:
- `tipo tipo_incidente_enum`, `chave text`, `rotulo text`, `campo_tipo text` (`text|textarea|choice`), `opcoes jsonb` (array de strings), `obrigatoria boolean`, `ordem integer`, `ativa boolean`
- Unique (`tipo`, `chave`)
- RLS: SELECT aberto para `authenticated` e `anon` (parceira precisa ler sem login); INSERT/UPDATE/DELETE só para `ADMIN_DISPATCH`
- GRANTs de acordo

### Frontend
- `src/lib/form-config.ts`: fetch e cache das perguntas custom por tipo.
- `src/components/admin/FormBuilder.tsx`: modal com abas, editor de perguntas, salvar/reordenar/excluir.
- `src/routes/admin.tsx`: novo botão engrenagem visível só quando `role === "ADMIN_DISPATCH"`.
- `src/components/IncidenteDialog.tsx` (eletricista) e `src/routes/parceira.tsx`: após o bloco fixo de cada tipo, renderiza dinamicamente as perguntas custom e as inclui em `dados`.
- `src/routes/admin.incidentes.tsx` (detalhe) e `src/routes/admin.dash-forms.tsx`: usam os rótulos vindos do banco para exibir e agrupar respostas de perguntas custom (a lógica existente para `ligacaoCliente`, `correlacaoDefeito` etc. continua igual).

### Chaves internas
Geradas por slugify do rótulo (ex.: "Houve religamento?" → `houveReligamento`), evitando colisões e mantendo compatibilidade com o esquema atual (`dados jsonb`).

## Fora do escopo (por ora)
- Remover/renomear perguntas fixas dos três formulários.
- Tipos avançados (data, número, upload de foto extra, condicionais entre perguntas). Podemos adicionar depois.
- Criar tipos de incidente totalmente novos além dos três existentes.
