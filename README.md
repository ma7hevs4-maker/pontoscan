# PontoScan

Crie um web app responsivo para controle de ponto operacional via QR Code para eletricistas, com autenticação, registro de eventos e painel administrativo completo.

--- nome PontoScan

## 🔐 AUTENTICAÇÃO

O sistema deve ter:

* Tela de login

* Tela de cadastro

### Campos de cadastro:

* Nome completo (texto obrigatório)

* Polo (dropdown com valores fixos):

  * Magé

  * Niterói

  * São Gonçalo

  * Serrana

  * Sul

  * Campos

  * Lagos

  * Macaé

  * Noroeste

* Prefixo (campo com validação e máscara obrigatória):

  * Formato: LLNNNLLL-L

  * Apenas letras maiúsculas e números

  * Exemplo válido: SG010SOE-A

  * Deve ser único

* Senha

---

## 👤 TIPOS DE USUÁRIO

O sistema deve ter 3 níveis de acesso:

* ELETRICISTA

* ADMIN_POLO

* ADMIN_DISPATCH

---

## 👨‍💼 CONTAS ADMINISTRATIVAS

Criar automaticamente contas administrativas fixas:

* 1 ADMIN_POLO para cada polo (visualiza apenas dados do próprio polo)

* 1 ADMIN_DISPATCH (visualiza todos os polos)

Essas contas devem:

* Já existir no sistema

* Ter login e senha padrão editáveis

---

## 📱 TELA DO ELETRICISTA

Após login, exibir 3 botões grandes:

* "Ponto"

* "Pós DDS"

* "Sair da Base"

Interface otimizada para celular.

---

## 📷 FLUXO DE REGISTRO

Ao clicar em qualquer botão:

1. Abrir câmera do dispositivo

2. Ler QR Code

3. Após leitura bem-sucedida:

Registrar automaticamente:

* usuario_id

* nome

* prefixo

* polo

* etapa (PONTO, POS_DDS, SAIDA_BASE)

* timestamp (data/hora do servidor)

* qr_code (conteúdo lido)

* latitude (opcional)

* longitude (opcional)

Mostrar feedback visual:

* Sucesso

* Erro

---

## 🎯 REGRAS DE NEGÓCIO (OBRIGATÓRIO)

* Não permitir fluxo inválido:

  * POS_DDS só pode após PONTO

  * SAIDA_BASE só pode após POS_DDS

* Impedir múltiplos registros duplicados da mesma etapa em sequência

* Todos os horários devem ser do servidor (não do dispositivo)

---

## 🗄️ BANCO DE DADOS (SUPABASE)

### Tabela: usuarios

* id (uuid)

* nome

* prefixo (único)

* polo

* role (ELETRICISTA, ADMIN_POLO, ADMIN_DISPATCH)

* ativo

* created_at

### Tabela: bases

* id (uuid)

* nome

* polo

* codigo_qr (único)

* ativo

* created_at

### Tabela: registros

* id (uuid)

* usuario_id (fk)

* base_id (fk)

* etapa (PONTO, POS_DDS, SAIDA_BASE)

* timestamp

* latitude

* longitude

* created_at

---

## 🚀 PERFORMANCE

Criar índices:

* usuario_id

* base_id

* timestamp

* etapa

---

## 🧮 CÁLCULO DE TEMPOS

Criar uma view chamada "vw_tempos" que calcule:

Para cada usuário por dia:

* horário de PONTO

* horário de POS_DDS

* horário de SAIDA_BASE

E os tempos:

* tempo_ponto_pos_dds (minutos)

* tempo_pos_dds_saida (minutos)

---

## 📊 PAINEL ADMINISTRATIVO

Ao logar como ADMIN:

Redirecionar para dashboard com:

### 1. Tabela de registros

* Filtros:

  * Data

  * Polo

  * Usuário

Regras:

* ADMIN_POLO → vê apenas seu polo

* ADMIN_DISPATCH → vê todos

---

### 2. Métricas

Exibir:

* Tempo médio por eletricista

* Tempo médio por polo

* Tempo total por usuário

* Ranking de desempenho

---

## 🧾 QR CODE

Criar área no painel administrativo:

Funcionalidades:

* Criar QR Code para bases

* Campo para nome da base

* Gerar QR com identificador único

* Exibir QR na tela

* Botão "Imprimir QR Code"

---

## 🔒 SEGURANÇA

* Usar Supabase Auth para login

* Implementar Row Level Security:

  * ADMIN_POLO → acesso apenas ao próprio polo

  * ADMIN_DISPATCH → acesso total

---

## 📍 MELHORIAS (IMPLEMENTAR SE POSSÍVEL)

* Capturar GPS no momento do registro

* Validar distância mínima da base (anti-fraude)

* Bloquear registro se fora da área permitida

---

## 🎨 INTERFACE

* Design simples e operacional

* Botões grandes

* Feedback rápido

* Layout mobile-first

---

## ⚡ OBJETIVO

O sistema deve ser:

* Rápido

* Confiável

* Simples de usar em campo

* Preparado para análise operacional posterior com função de exportação

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://pontoscan.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/64994463-ac2f-4553-b17c-7f022311d8f1).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
