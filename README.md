# Bot de Vendas Discord (VendasBot)

Este é um bot de vendas completo para Discord, com suporte a gerenciamento de produtos e pagamentos via Pix (Mercado Pago).

## Funcionalidades
- **!admin**: Abre o painel administrativo para adicionar produtos e configurar pagamentos.
- **Adicionar Produto**: Modal interativo para cadastrar nome, preço e descrição.
- **Pagamento Pix**: Integração com Mercado Pago para gerar QR Codes de pagamento.

## Como Configurar
1. Crie um arquivo `.env` na raiz do projeto com as seguintes chaves:
   ```env
   DISCORD_TOKEN=seu_token_do_bot
   MP_ACCESS_TOKEN=seu_token_do_mercado_pago
   ```
2. Instale as dependências:
   ```bash
   npm install
   ```
3. Inicie o bot:
   ```bash
   node bot.js
   ```

## Comandos
- `!admin`: Acesso restrito ao administrador para gerenciar a loja.
- `!loja`: Exibe os produtos disponíveis para os usuários (em desenvolvimento).

## Tecnologias
- Discord.js v14
- Mercado Pago SDK
- SQLite3 + Drizzle ORM
- Node.js
