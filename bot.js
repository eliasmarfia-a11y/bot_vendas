require('dotenv').config();
const http = require('http');
const { 
  Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, 
  ModalBuilder, TextInputBuilder, TextInputStyle, InteractionType, PermissionFlagsBits,
  REST, Routes, SlashCommandBuilder, ChannelType
} = require('discord.js');

// --- SERVIDOR HTTP (ANTI-SLEEP RENDER) ---
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Sistema de Vendas Ultra Profissional Online!\n');
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor HTTP na porta ${PORT}`));

// --- BANCO DE DADOS EM MEMÓRIA ---
let products = [];
let salesCount = 0;
let totalRevenue = 0;
let settings = { 
  pix_key: 'Não configurada',
  log_channel: null,
  feedback_channel: null,
  category_id: null
};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
});

// --- COMANDOS ---
const commands = [
  new SlashCommandBuilder().setName('admin').setDescription('Painel de Controle Ultra').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('loja').setDescription('Abrir a vitrine de produtos'),
  new SlashCommandBuilder().setName('setup').setDescription('Configurar canais automaticamente').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('limpar').setDescription('Limpar chat').addIntegerOption(opt => opt.setName('qtd').setDescription('1-100').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
].map(cmd => cmd.toJSON());

client.once('ready', async () => {
  console.log(`🚀 Bot Ultra Profissional online: ${client.user.tag}`);
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
  } catch (e) { console.error(e); }
});

client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;

    if (commandName === 'setup') {
      const category = await interaction.guild.channels.create({ name: '🛒 ÁREA DE VENDAS', type: ChannelType.GuildCategory });
      const logs = await interaction.guild.channels.create({ name: '📝-logs-vendas', type: ChannelType.GuildText, parent: category.id });
      const feedback = await interaction.guild.channels.create({ name: '⭐-depoimentos', type: ChannelType.GuildText, parent: category.id });
      
      settings.log_channel = logs.id;
      settings.feedback_channel = feedback.id;
      settings.category_id = category.id;

      await interaction.reply({ content: `✅ **Setup concluído!** Canais criados na categoria **${category.name}**.`, ephemeral: true });
    }

    if (commandName === 'admin') {
      const embed = new EmbedBuilder()
        .setTitle('👑 Painel de Administração Ultra')
        .setColor('#5865F2')
        .setThumbnail(client.user.displayAvatarURL())
        .addFields(
          { name: '📊 Estatísticas', value: `💰 Total: **R$ ${totalRevenue.toFixed(2)}**\n📦 Vendas: **${salesCount}**`, inline: true },
          { name: '🔑 PIX', value: `\`${settings.pix_key}\``, inline: true }
        );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('adm_pix').setLabel('Alterar PIX').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('adm_add').setLabel('Adicionar Produto').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('adm_reset').setLabel('Zerar Stats').setStyle(ButtonStyle.Danger)
      );

      await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    if (commandName === 'loja') {
      if (products.length === 0) return interaction.reply({ content: '❌ A loja está sem estoque no momento.', ephemeral: true });

      const embed = new EmbedBuilder()
        .setTitle('✨ VITRINE DE PRODUTOS ✨')
        .setDescription('Selecione o produto desejado abaixo para abrir um ticket de compra.')
        .setColor('#2F3136')
        .setImage('https://i.imgur.com/u8M6X6X.png'); // Banner opcional

      const rows = [];
      let currentRow = new ActionRowBuilder();

      products.forEach((p, i) => {
        embed.addFields({ name: `🎁 ${p.name}`, value: `> 💵 **Preço:** R$ ${p.price.toFixed(2)}\n> 📦 **Estoque:** ${p.stock}\n> 📝 ${p.desc}`, inline: false });
        
        const btn = new ButtonBuilder().setCustomId(`buy_${i}`).setLabel(`Comprar ${p.name}`).setStyle(ButtonStyle.Secondary).setEmoji('🛒').setDisabled(p.stock <= 0);

        if (currentRow.components.length < 5) currentRow.addComponents(btn);
        else { rows.push(currentRow); currentRow = new ActionRowBuilder().addComponents(btn); }
      });
      rows.push(currentRow);

      await interaction.reply({ embeds: [embed], components: rows });
    }
  }

  if (interaction.isButton()) {
    if (interaction.customId === 'adm_add') {
      const modal = new ModalBuilder().setCustomId('mod_add').setTitle('Novo Produto');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('n').setLabel('Nome').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('p').setLabel('Preço (Ex: 15.00)').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('s').setLabel('Estoque').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('d').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setRequired(true))
      );
      await interaction.showModal(modal);
    }

    if (interaction.customId === 'adm_pix') {
      const modal = new ModalBuilder().setCustomId('mod_pix').setTitle('Configurar PIX');
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('px').setLabel('Chave PIX').setStyle(TextInputStyle.Short).setRequired(true)));
      await interaction.showModal(modal);
    }

    if (interaction.customId.startsWith('buy_')) {
      const idx = parseInt(interaction.customId.split('_')[1]);
      const p = products[idx];

      // CRIAR TICKET DE COMPRA
      const ticket = await interaction.guild.channels.create({
        name: `🛒-${interaction.user.username}`,
        type: ChannelType.GuildText,
        parent: settings.category_id,
        permissionOverwrites: [
          { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
        ],
      });

      const embed = new EmbedBuilder()
        .setTitle('💳 Checkout de Pagamento')
        .setDescription(`Olá ${interaction.user}, você iniciou a compra de **${p.name}**.\n\n💰 **Valor:** R$ ${p.price.toFixed(2)}\n🔑 **Chave PIX:** \`${settings.pix_key}\`\n\n*Envie o comprovante neste chat para receber seu produto.*`)
        .setColor('#FEE75C')
        .setFooter({ text: 'Ticket de Compra Ativo' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('close_ticket').setLabel('Fechar Ticket').setStyle(ButtonStyle.Danger)
      );

      await ticket.send({ content: `${interaction.user}`, embeds: [embed], components: [row] });
      await interaction.reply({ content: `✅ Ticket criado em ${ticket}!`, ephemeral: true });

      // LOG
      if (settings.log_channel) {
        const log = interaction.guild.channels.cache.get(settings.log_channel);
        log?.send({ content: `🔔 **Novo Pedido:** ${interaction.user.tag} iniciou a compra de **${p.name}**.` });
      }
    }

    if (interaction.customId === 'close_ticket') {
      await interaction.reply('🔒 Fechando ticket em 5 segundos...');
      setTimeout(() => interaction.channel.delete(), 5000);
    }
  }

  if (interaction.type === InteractionType.ModalSubmit) {
    if (interaction.customId === 'mod_add') {
      const name = interaction.fields.getTextInputValue('n');
      const price = parseFloat(interaction.fields.getTextInputValue('p').replace(',', '.'));
      const stock = parseInt(interaction.fields.getTextInputValue('s'));
      const desc = interaction.fields.getTextInputValue('d');
      products.push({ name, price, stock, desc });
      await interaction.reply({ content: `✅ **${name}** adicionado à vitrine!`, ephemeral: true });
    }
    if (interaction.customId === 'mod_pix') {
      settings.pix_key = interaction.fields.getTextInputValue('px');
      await interaction.reply({ content: '✅ Chave PIX salva!', ephemeral: true });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
                           
