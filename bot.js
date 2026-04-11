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
  res.end('Sistema de Vendas com PIX Profissional Online!\n');
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor HTTP na porta ${PORT}`));

// --- BANCO DE DADOS EM MEMÓRIA ---
let products = []; 
let settings = { 
  pix_key: 'Não configurada',
  pix_name: 'LOJA DISCORD',
  category_id: null
};

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
});

// --- GERADOR DE PIX PROFISSIONAL (PADRÃO BRCODE) ---
function generatePix(key, amount, name) {
  const cleanKey = key.replace(/\s/g, '');
  const cleanName = name.substring(0, 25).toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const amountStr = amount.toFixed(2);
  
  const merchantAccount = `0014BR.GOV.BCB.PIX01${cleanKey.length.toString().padStart(2, '0')}${cleanKey}`;
  
  const payload = [
    '000201',
    `26${merchantAccount.length.toString().padStart(2, '0')}${merchantAccount}`,
    '52040000',
    '5303986',
    `54${amountStr.length.toString().padStart(2, '0')}${amountStr}`,
    '5802BR',
    `59${cleanName.length.toString().padStart(2, '0')}${cleanName}`,
    '6009SAO PAULO',
    '62070503***',
    '6304'
  ].join('');

  // Função simples de CRC16 para validar o código PIX
  function crc16(data) {
    let crc = 0xFFFF;
    for (let i = 0; i < data.length; i++) {
      crc ^= data.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) {
        if ((crc & 0x8000) !== 0) crc = (crc << 1) ^ 0x1021;
        else crc <<= 1;
      }
    }
    return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
  }

  return payload + crc16(payload);
}

// --- COMANDOS ---
const commands = [
  new SlashCommandBuilder().setName('admin').setDescription('Painel de Controle').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('loja').setDescription('Abrir a vitrine de produtos'),
  new SlashCommandBuilder().setName('gerenciar').setDescription('Editar ou Apagar produtos').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('setup').setDescription('Configurar canais automaticamente').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
].map(cmd => cmd.toJSON());

client.once('ready', async () => {
  console.log(`🚀 Bot PIX Profissional online: ${client.user.tag}`);
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try { await rest.put(Routes.applicationCommands(client.user.id), { body: commands }); } catch (e) { console.error(e); }
});

client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;

    if (commandName === 'setup') {
      const category = await interaction.guild.channels.create({ name: '🛒 ÁREA DE VENDAS', type: ChannelType.GuildCategory });
      settings.category_id = category.id;
      await interaction.reply({ content: `✅ Setup concluído! Categoria de tickets criada.`, ephemeral: true });
    }

    if (commandName === 'admin') {
      const embed = new EmbedBuilder().setTitle('👑 Painel Admin').setColor('#5865F2').addFields(
        { name: '🔑 Chave PIX', value: `\`${settings.pix_key}\`` },
        { name: '👤 Nome no PIX', value: `\`${settings.pix_name}\`` }
      );
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('adm_pix').setLabel('Configurar PIX').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('adm_add').setLabel('Novo Produto').setStyle(ButtonStyle.Success)
      );
      await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    if (commandName === 'gerenciar') {
      if (products.length === 0) return interaction.reply({ content: '❌ Não há produtos.', ephemeral: true });
      const select = new StringSelectMenuBuilder().setCustomId('sel_man').setPlaceholder('Escolha um produto...')
        .addOptions(products.map((p, i) => ({ label: p.name, description: `R$ ${p.price.toFixed(2)}`, value: i.toString() })));
      await interaction.reply({ content: '🛠️ Gerenciar Produtos:', components: [new ActionRowBuilder().addComponents(select)], ephemeral: true });
    }

    if (commandName === 'loja') {
      if (products.length === 0) return interaction.reply({ content: '❌ Sem estoque.', ephemeral: true });
      const embed = new EmbedBuilder().setTitle('🛒 NOSSO CATÁLOGO').setDescription('Escolha um produto abaixo:').setColor('#2F3136');
      const rows = [];
      let currentRow = new ActionRowBuilder();
      products.forEach((p, i) => {
        embed.addFields({ name: `🎁 ${p.name}`, value: `💵 **R$ ${p.price.toFixed(2)}** | Estoque: ${p.stock}` });
        const btn = new ButtonBuilder().setCustomId(`buy_${i}`).setLabel(`Comprar ${p.name}`).setStyle(ButtonStyle.Primary).setDisabled(p.stock <= 0);
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
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('s').setLabel('Estoque').setStyle(TextInputStyle.Short).setRequired(true))
      );
      await interaction.showModal(modal);
    }
    if (interaction.customId === 'adm_pix') {
      const modal = new ModalBuilder().setCustomId('mod_pix').setTitle('Configurar PIX');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('px').setLabel('Chave PIX (CPF, Email ou Aleatória)').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nm').setLabel('Seu Nome (Sem acentos)').setStyle(TextInputStyle.Short).setRequired(true))
      );
      await interaction.showModal(modal);
    }
    if (interaction.customId.startsWith('buy_')) {
      const idx = parseInt(interaction.customId.split('_')[1]);
      const p = products[idx];
      if (settings.pix_key === 'Não configurada') return interaction.reply({ content: '❌ O dono da loja ainda não configurou o PIX!', ephemeral: true });
      
      const pixCode = generatePix(settings.pix_key, p.price, settings.pix_name);
      const ticket = await interaction.guild.channels.create({
        name: `🛒-${interaction.user.username}`,
        type: ChannelType.GuildText,
        parent: settings.category_id,
        permissionOverwrites: [
          { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
        ],
      });
      const embed = new EmbedBuilder().setTitle('💳 Checkout PIX').setDescription(`Olá ${interaction.user}, você está comprando **${p.name}**.\n\n💰 **Valor:** R$ ${p.price.toFixed(2)}\n\n**PIX COPIA E COLA:**\n\`\`\`${pixCode}\`\`\`\n\n*Copie o código acima e pague no seu banco.*`).setColor('#FEE75C');
      await ticket.send({ content: `${interaction.user}`, embeds: [embed] });
      await interaction.reply({ content: `✅ Ticket criado em ${ticket}!`, ephemeral: true });
    }
  }

  if (interaction.type === InteractionType.ModalSubmit) {
    if (interaction.customId === 'mod_add') {
      const name = interaction.fields.getTextInputValue('n');
      const price = parseFloat(interaction.fields.getTextInputValue('p').replace(',', '.'));
      const stock = parseInt(interaction.fields.getTextInputValue('s'));
      products.push({ name, price, stock });
      await interaction.reply({ content: `✅ Produto **${name}** adicionado!`, ephemeral: true });
    }
    if (interaction.customId === 'mod_pix') {
      settings.pix_key = interaction.fields.getTextInputValue('px');
      settings.pix_name = interaction.fields.getTextInputValue('nm');
      await interaction.reply({ content: '✅ PIX configurado com sucesso!', ephemeral: true });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
        
