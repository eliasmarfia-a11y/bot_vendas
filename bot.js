require('dotenv').config();
const http = require('http');
const { 
  Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, 
  ModalBuilder, TextInputBuilder, TextInputStyle, InteractionType, PermissionFlagsBits,
  REST, Routes, SlashCommandBuilder
} = require('discord.js');

// --- SERVIDOR HTTP PARA O RENDER (PLANO GRÁTIS) ---
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot de Vendas Online 24h!\n');
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor HTTP na porta ${PORT}`));

// --- BANCO DE DADOS EM MEMÓRIA (EVITA REINICIAR NO RENDER) ---
let products = [];
let settings = { pix_key: 'Não configurada' };

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const commands = [
  new SlashCommandBuilder().setName('config').setDescription('Configurações (Admin)').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('loja').setDescription('Ver produtos'),
  new SlashCommandBuilder().setName('estoque').setDescription('Ver estoque (Admin)').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('limpar').setDescription('Limpar chat').addIntegerOption(opt => opt.setName('qtd').setDescription('1-100').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
].map(cmd => cmd.toJSON());

client.once('ready', async () => {
  console.log(`Bot online como ${client.user.tag}!`);
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('Slash Commands registrados!');
  } catch (e) { console.error(e); }
});

client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;
    if (commandName === 'config') {
      const embed = new EmbedBuilder().setTitle('⚙️ Configurações').setDescription('Escolha uma opção:').setColor('#0099ff');
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('config_payment').setLabel('Configurar PIX').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('add_product').setLabel('Adicionar Produto').setStyle(ButtonStyle.Success)
      );
      await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }
    if (commandName === 'loja') {
      if (products.length === 0) return interaction.reply({ content: 'Sem produtos.', ephemeral: true });
      const embed = new EmbedBuilder().setTitle('🛒 Loja').setColor('#2f3136');
      const rows = [];
      let currentRow = new ActionRowBuilder();
      products.forEach((p, i) => {
        embed.addFields({ name: `${p.name} - R$ ${p.price.toFixed(2)}`, value: `Estoque: ${p.stock}` });
        const btn = new ButtonBuilder().setCustomId(`buy_${i}`).setLabel(`Comprar ${p.name}`).setStyle(ButtonStyle.Primary).setDisabled(p.stock <= 0);
        if (currentRow.components.length < 5) currentRow.addComponents(btn);
        else { rows.push(currentRow); currentRow = new ActionRowBuilder().addComponents(btn); }
      });
      rows.push(currentRow);
      await interaction.reply({ embeds: [embed], components: rows });
    }
    if (commandName === 'estoque') {
      const embed = new EmbedBuilder().setTitle('📦 Estoque').setColor('#ffaa00');
      products.forEach(p => embed.addFields({ name: p.name, value: `Qtd: ${p.stock}`, inline: true }));
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
    if (commandName === 'limpar') {
      const qtd = interaction.options.getInteger('qtd');
      await interaction.channel.bulkDelete(qtd, true);
      await interaction.reply({ content: `✅ Limpei ${qtd} mensagens!`, ephemeral: true });
    }
  }

  if (interaction.isButton()) {
    if (interaction.customId === 'add_product') {
      const modal = new ModalBuilder().setCustomId('modal_add').setTitle('Novo Produto');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nome').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('price').setLabel('Preço').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('stock').setLabel('Estoque').setStyle(TextInputStyle.Short).setRequired(true))
      );
      await interaction.showModal(modal);
    }
    if (interaction.customId === 'config_payment') {
      const modal = new ModalBuilder().setCustomId('modal_pix').setTitle('Configurar PIX');
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('pix').setLabel('Chave PIX').setStyle(TextInputStyle.Short).setRequired(true)));
      await interaction.showModal(modal);
    }
    if (interaction.customId.startsWith('buy_')) {
      const idx = parseInt(interaction.customId.split('_')[1]);
      const p = products[idx];
      const embed = new EmbedBuilder().setTitle('🛒 Pedido').setDescription(`Produto: **${p.name}**\nValor: **R$ ${p.price.toFixed(2)}**\nPIX: \`${settings.pix_key}\``).setColor('#ffff00');
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }

  if (interaction.type === InteractionType.ModalSubmit) {
    if (interaction.customId === 'modal_add') {
      const name = interaction.fields.getTextInputValue('name');
      const price = parseFloat(interaction.fields.getTextInputValue('price').replace(',', '.'));
      const stock = parseInt(interaction.fields.getTextInputValue('stock'));
      products.push({ name, price, stock });
      await interaction.reply({ content: `✅ Produto **${name}** adicionado!`, ephemeral: true });
    }
    if (interaction.customId === 'modal_pix') {
      settings.pix_key = interaction.fields.getTextInputValue('pix');
      await interaction.reply({ content: '✅ PIX salvo!', ephemeral: true });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
  
