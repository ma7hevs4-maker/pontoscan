## Objetivo
Atualizar o `PontoScan-Manual.docx` incluindo capturas reais do app do eletricista (que antes não foi possível, pois eu estava logado como ADMIN_DISPATCH).

## Telas que vou capturar (você já está logado como ELETRICISTA)
1. `/eletricista` — tela inicial com botão "Escanear QR", header com nome/prefixo/polo
2. Diálogo do scanner de QR aberto
3. Diálogo "Meu histórico" (com filtros Hoje / 7 dias / 30 dias)
4. Diálogo "Prefixo provisório"
5. Banner amarelo de prefixo provisório ativo (se possível ativar um de teste)

Vou usar viewport mobile (~390x844) para refletir o uso real.

## Conteúdo a adicionar/expandir no manual
Nova seção **"App do Eletricista"** detalhando:
- Header: histórico, prefixo provisório, nome, prefixo, polo, sair
- Botão grande "Escanear QR"
- Fluxo de scan: lê QR `codigo_base|etapa` → valida base ativa → pede GPS → checa raio (`raio_metros`, padrão 200m) → grava registro
- Mensagens de erro (QR inválido, fora do raio, GPS negado)
- Histórico pessoal (Hoje / 7 dias / 30 dias)
- Prefixo provisório (válido só até o fim do dia, gravado no `localStorage`, aparece como `prefixo_override` no registro)
- Etapas vistas pelo eletricista: **Ponto**, **Pré DDS**, **Sair da Base**

## Entrega
Novo arquivo versionado: `PontoScan-Manual_v2.docx` em `/mnt/documents/` (mantendo o v1 intacto), com as imagens incorporadas nas seções correspondentes.

## Confirmação
Posso prosseguir capturando as telas no viewport atual (você está em `/eletricista`)? Se quiser que eu também ative um prefixo provisório de teste para mostrar o banner amarelo, me avise — caso contrário, deixo essa tela apenas com o diálogo aberto e vazio.