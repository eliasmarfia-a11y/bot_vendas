require('dotenv').config();
const http = require('http');
const { 
  Client, 
  GatewayIntentBits, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle, 
  InteractionType, 
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder
} = require('discord.js');
const { drizzle } = require('drizzle-orm/better-sqlite3');
const Database = require('better-sqlite3');
const { products, settings } = require('./schema');
const { eq } = require('drizzle-orm');

// --- SERVIDOR HTTP PARA O RENDER (PLANO GRÁTIS) ---
// Isso faz o Render achar que o bot é um site e não dar erro de "Failed"
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot de Vendas Online 24h!\n');
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor HTTP rodando na porta ${PORT}`);
});
// --------------------------------------------------

const sqlite = new Database('/tmp/vendas.db');
const db = drizzle(sqlite);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Definição dos Slash Commands
const commands = [
  new SlashCommandBuilder()
    .setName('config')
    .setDescription('Configurações administrativas do bot (Apenas Admin)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('loja')
    .setDescription('Mostra a lista de produtos disponíveis para compra'),
  new SlashCommandBuilder()
    .setName('estoque')
    .setDescription('Gerencia o estoque dos produtos (Apenas Admin)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('limpar')
    .setDescription('Limpa mensagens do chat')
    .addIntegerOption(option => 
      option.setName('quantidade')
        .setDescription('Número de mensagens para apagar (1-100)')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
].map(command => command.toJSON());

// Registrar comandos ao iniciar
client.once('ready', async () => {
  console.log(`Bot de Vendas online como ${client.user.tag}!`);
  
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  try {
    console.log('Iniciando atualização dos Slash Commands (/)');
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands },
    );
    console.log('Slash Commands registrados com sucesso!');
  } catch (error) {
    console.error('Erro ao registrar comandos:', error);
  }
});

// Lidar com interações (Slash Commands, Botões, Modais)
client.on('interactionCreate', async (interaction) => {
  
  // 1. Lidar com Slash Commands
  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;

    if (commandName === 'config') {
      const embed = new EmbedBuilder()
        .setTitle('⚙️ Configurações do Bot')
        .setDescription('Escolha uma opção para configurar sua loja.')
        .setColor('#0099ff');

      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('config_payment')
            .setLabel('Configurar PIX')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('add_product')
            .setLabel('Adicionar Produto')
            .setStyle(ButtonStyle.Success)
        );

      await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    if (commandName === 'loja') {
      const allProducts = db.select().from(products).all();

      if (allProducts.length === 0) {
        return interaction.reply({ content: 'Não há produtos cadastrados no momento.', ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setTitle('🛒 Nossa Loja')
        .setDescription('Confira nossos produtos disponíveis abaixo:')
        .setColor('#2f3136');

      const rows = [];
      let currentRow = new ActionRowBuilder();

      allProducts.forEach((product) => {
        embed.addFields({
          name: `${product.name} - R$ ${product.price.toFixed(2)}`,
          value: `${product.description || 'Sem descrição'}\nEstoque: ${product.stock}`,
          inline: false
        });

        const buyButton = new ButtonBuilder()
          .setCustomId(`buy_${product.id}`)
          .setLabel(`Comprar ${product.name}`)
          .setStyle(ButtonStyle.Primary)
          .setDisabled(product.stock <= 0);

        if (currentRow.components.length < 5) {
          currentRow.addComponents(buyButton);
        } else {
          rows.push(currentRow);
          currentRow = new ActionRowBuilder().addComponents(buyButton);
        }
      });
      rows.push(currentRow);

      await interaction.reply({ embeds: [embed], components: rows });
    }

    if (commandName === 'estoque') {
      const allProducts = db.select().from(products).all();
      if (allProducts.length === 0) return interaction.reply({ content: 'Nenhum produto para gerenciar.', ephemeral: true });

      const embed = new EmbedBuilder()
        .setTitle('📦 Gestão de Estoque')
        .setDescription('Lista de produtos e quantidades atuais:')
        .setColor('#ffaa00');

      allProducts.forEach(p => {
        embed.addFields({ name: p.name, value: `Estoque: ${p.stock}`, inline: true });
      });

      await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (commandName === 'limpar') {
      const amount = interaction.options.getInteger('quantidade');
      if (amount < 1 || amount > 100) return interaction.reply({ content: 'Escolha entre 1 e 100.', ephemeral: true });

      await interaction.channel.bulkDelete(amount, true);
      await interaction.reply({ content: `✅ Limpei ${amount} mensagens!`, ephemeral: true });
    }
  }

  // 2. Lidar com Botões
  if (interaction.isButton()) {
    if (interaction.customId === 'add_product') {
      const modal = new ModalBuilder()
        .setCustomId('modal_add_product')
        .setTitle('Adicionar Novo Produto');

      const nameInput = new TextInputBuilder().setCustomId('product_name').setLabel('Nome').setStyle(TextInputStyle.Short).setRequired(true);
      const priceInput = new TextInputBuilder().setCustomId('product_price').setLabel('Preço (Ex: 10.50)').setStyle(TextInputStyle.Short).setRequired(true);
      const stockInput = new TextInputBuilder().setCustomId('product_stock').setLabel('Estoque').setStyle(TextInputStyle.Short).setRequired(true);
      const descInput = new TextInputBuilder().setCustomId('product_desc').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(nameInput),
        new ActionRowBuilder().addComponents(priceInput),
        new ActionRowBuilder().addComponents(stockInput),
        new ActionRowBuilder().addComponents(descInput)
      );
      await interaction.showModal(modal);
    }

    if (interaction.customId === 'config_payment') {
      const modal = new ModalBuilder().setCustomId('modal_config_pix').setTitle('Configurar Chave PIX');
      const pixInput = new TextInputBuilder().setCustomId('pix_key').setLabel('Sua Chave PIX').setStyle(TextInputStyle.Short).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(pixInput));
      await interaction.showModal(modal);
    }

    if (interaction.customId.startsWith('buy_')) {
      const productId = parseInt(interaction.customId.split('_')[1]);
      const product = db.select().from(products).where(eq(products.id, productId)).get();

      if (!product || product.stock <= 0) return interaction.reply({ content: 'Fora de estoque!', ephemeral: true });

      const pixKey = db.select().from(settings).where(eq(settings.key, 'pix_key')).get();
      
      const embed = new EmbedBuilder()
        .setTitle('🛒 Pedido Gerado!')
        .setDescription(`Produto: **${product.name}**\nValor: **R$ ${product.price.toFixed(2)}**`)
        .addFields({ name: 'Pagamento via PIX', value: pixKey ? `Chave: \`${pixKey.value}\`` : 'Chave PIX não configurada.' })
        .setColor('#ffff00');

      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }

  // 3. Lidar com Modais
  if (interaction.type === InteractionType.ModalSubmit) {
    if (interaction.customId === 'modal_add_product') {
      const name = interaction.fields.getTextInputValue('product_name');
      const price = parseFloat(interaction.fields.getTextInputValue('product_price').replace(',', '.'));
      const stock = parseInt(interaction.fields.getTextInputValue('product_stock'));

      if (isNaN(price) || isNaN(stock)) return interaction.reply({ content: 'Dados inválidos!', ephemeral: true });

      db.insert(products).values({ name, price, stock, description: interaction.fields.getTextInputValue('product_desc') }).run();
      await interaction.reply({ content: `✅ Produto **${name}** adicionado!`, ephemeral: true });
    }

    if (interaction.customId === 'modal_config_pix') {
      const pixKey = interaction.fields.getTextInputValue('pix_key');
      db.insert(settings).values({ key: 'pix_key', value: pixKey }).onConflictDoUpdate({ target: settings.key, set: { value: pixKey } }).run();
      await interaction.reply({ content: '✅ Chave PIX salva!', ephemeral: true });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
