require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
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
  SlashCommandBuilder,
  ChannelType
} = require('discord.js');

// --- PERSISTÊNCIA DE DADOS EM ARQUIVO JSON ---
const DATA_FILE = path.join(__dirname, 'data.json');

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    const initialData = { 
      products: [], 
      settings: { 
        pix_key: 'Não configurada', 
        pix_name: 'LOJA DISCORD',
        antilink: false 
      } 
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
    return initialData;
  }
  try {
    const content = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (e) {
    console.error('Erro ao ler arquivo de dados:', e);
    return { products: [], settings: { pix_key: 'Não configurada', pix_name: 'LOJA DISCORD', antilink: false } };
  }
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Erro ao salvar arquivo de dados:', e);
  }
}

let db = loadData();

// --- SERVIDOR HTTP PARA O RENDER (PLANO GRÁTIS) ---
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot de Vendas Profissional Online!\n');
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor HTTP rodando na porta ${PORT}`);
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// --- FUNÇÃO PIX COPIA E COLA ---
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

const commands = [
  new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Painel de Controle Administrativo')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('loja')
    .setDescription('Mostra a vitrine de produtos'),
  new SlashCommandBuilder()
    .setName('gerenciar')
    .setDescription('Editar ou Apagar produtos')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configurar canais automaticamente')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('antilink')
    .setDescription('Ativar ou desativar o sistema Anti-Link')
    .addStringOption(option =>
      option.setName('status')
        .setDescription('Escolha o status')
        .setRequired(true)
        .addChoices(
          { name: 'Ativado', value: 'on' },
          { name: 'Desativado', value: 'off' }
        ))
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

client.once('ready', async () => {
  console.log(`Bot de Vendas online como ${client.user.tag}!`);
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('Slash Commands registrados com sucesso!');
  } catch (error) {
    console.error('Erro ao registrar comandos:', error);
  }
});

// --- SISTEMA ANTI-LINK ---
client.on('messageCreate', async (message) => {
  if (message.author.bot || !db.settings.antilink) return;
  if (message.member.permissions.has(PermissionFlagsBits.Administrator)) return;

  const linkPattern = /(https?:\/\/|discord\.gg|discord\.com\/invite)/i;
  if (linkPattern.test(message.content)) {
    try {
      await message.delete();
      const warning = await message.channel.send(`${message.author}, **links não são permitidos neste servidor!** 🛡️`);
      setTimeout(() => warning.delete().catch(() => {}), 5000);
    } catch (e) {
      console.error('Erro ao apagar link:', e);
    }
  }
});

client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand() || interaction.isButton() || interaction.isStringSelectMenu()) {
    if (!interaction.isModalSubmit()) {
      if (interaction.commandName === 'loja' || interaction.commandName === 'gerenciar' || interaction.customId?.startsWith('buy_')) {
        await interaction.deferReply({ ephemeral: true }).catch(() => {});
      }
    }
  }

  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;

    if (commandName === 'antilink') {
      const status = interaction.options.getString('status');
      db.settings.antilink = (status === 'on');
      saveData(db);
      await interaction.reply({ content: `🛡️ Sistema Anti-Link **${status === 'on' ? 'ATIVADO' : 'DESATIVADO'}** com sucesso!`, ephemeral: true });
    }

    if (commandName === 'setup') {
      try {
        const category = await interaction.guild.channels.create({ name: '🛒 ÁREA DE VENDAS', type: ChannelType.GuildCategory });
        db.settings.category_id = category.id;
        saveData(db);
        await interaction.reply({ content: `✅ Setup concluído! Categoria de tickets criada.`, ephemeral: true });
      } catch (e) {
        await interaction.reply({ content: '❌ Erro ao criar categoria. Verifique as permissões do bot.', ephemeral: true });
      }
    }

    if (commandName === 'admin') {
      const embed = new EmbedBuilder()
        .setTitle('👑 Painel Admin')
        .setColor('#5865F2')
        .addFields(
          { name: '🔑 Chave PIX', value: `\`${db.settings.pix_key}\`` },
          { name: '👤 Nome no PIX', value: `\`${db.settings.pix_name}\`` },
          { name: '🛡️ Anti-Link', value: db.settings.antilink ? '✅ Ativado' : '❌ Desativado' }
        );
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('adm_pix').setLabel('Configurar PIX').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('adm_add').setLabel('Novo Produto').setStyle(ButtonStyle.Success)
      );
      await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    if (commandName === 'gerenciar') {
      if (db.products.length === 0) return interaction.editReply({ content: '❌ Não há produtos para gerenciar.' });
      const select = new StringSelectMenuBuilder().setCustomId('sel_man').setPlaceholder('Escolha um produto...')
        .addOptions(db.products.map((p, i) => ({ label: p.name, description: `R$ ${p.price.toFixed(2)}`, value: i.toString() })));
      await interaction.editReply({ content: '🛠️ Gerenciar Produtos:', components: [new ActionRowBuilder().addComponents(select)] });
    }

    if (commandName === 'loja') {
      if (db.products.length === 0) return interaction.editReply({ content: '❌ Sem estoque no momento.' });
      const embed = new EmbedBuilder().setTitle('🛒 NOSSO CATÁLOGO').setDescription('Escolha um produto abaixo:').setColor('#2F3136');
      const rows = [];
      let currentRow = new ActionRowBuilder();
      db.products.forEach((p, i) => {
        embed.addFields({ name: `🎁 ${p.name}`, value: `💵 **R$ ${p.price.toFixed(2)}** | Estoque: ${p.stock}` });
        const btn = new ButtonBuilder().setCustomId(`buy_${i}`).setLabel(`Comprar ${p.name}`).setStyle(ButtonStyle.Primary).setDisabled(p.stock <= 0);
        if (currentRow.components.length < 5) currentRow.addComponents(btn);
        else { rows.push(currentRow); currentRow = new ActionRowBuilder().addComponents(btn); }
      });
      rows.push(currentRow);
      await interaction.editReply({ embeds: [embed], components: rows });
    }

    if (commandName === 'limpar') {
      const amount = interaction.options.getInteger('quantidade');
      await interaction.channel.bulkDelete(amount, true);
      await interaction.reply({ content: `✅ Limpei ${amount} mensagens!`, ephemeral: true });
    }
  }

  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'sel_man') {
      const idx = parseInt(interaction.values[0]);
      const p = db.products[idx];
      const embed = new EmbedBuilder().setTitle(`📝 Gerenciando: ${p.name}`).addFields(
        { name: '💵 Preço', value: `R$ ${p.price.toFixed(2)}`, inline: true },
        { name: '📦 Estoque', value: `${p.stock}`, inline: true }
      ).setColor('#FFFF00');
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`edit_${idx}`).setLabel('Editar').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`delete_${idx}`).setLabel('Apagar').setStyle(ButtonStyle.Danger)
      );
      await interaction.update({ embeds: [embed], components: [row] });
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
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('px').setLabel('Chave PIX').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nm').setLabel('Seu Nome (Sem acentos)').setStyle(TextInputStyle.Short).setRequired(true))
      );
      await interaction.showModal(modal);
    }
    if (interaction.customId.startsWith('edit_')) {
      const idx = parseInt(interaction.customId.split('_')[1]);
      const p = db.products[idx];
      const modal = new ModalBuilder().setCustomId(`mod_edit_${idx}`).setTitle('Editar Produto');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('n').setLabel('Nome').setValue(p.name).setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('p').setLabel('Preço').setValue(p.price.toString()).setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('s').setLabel('Estoque').setValue(p.stock.toString()).setStyle(TextInputStyle.Short).setRequired(true))
      );
      await interaction.showModal(modal);
    }
    if (interaction.customId.startsWith('delete_')) {
      const idx = parseInt(interaction.customId.split('_')[1]);
      db.products.splice(idx, 1);
      saveData(db);
      await interaction.update({ content: '✅ Produto removido!', embeds: [], components: [] });
    }
    if (interaction.customId.startsWith('buy_')) {
      const idx = parseInt(interaction.customId.split('_')[1]);
      const p = db.products[idx];
      if (db.settings.pix_key === 'Não configurada') return interaction.editReply({ content: '❌ PIX não configurado pelo administrador.' });
      
      const pixCode = generatePix(db.settings.pix_key, p.price, db.settings.pix_name);
      try {
        const ticket = await interaction.guild.channels.create({
          name: `🛒-${interaction.user.username}`,
          type: ChannelType.GuildText,
          parent: db.settings.category_id,
          permissionOverwrites: [
            { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
          ],
        });
        const embed = new EmbedBuilder().setTitle('💳 Checkout PIX').setDescription(`Olá ${interaction.user}, você está comprando **${p.name}**.\n\n💰 **Valor:** R$ ${p.price.toFixed(2)}\n\n**PIX COPIA E COLA:**\n\`\`\`${pixCode}\`\`\`\n\n*Pague e envie o comprovante aqui.*`).setColor('#FEE75C');
        await ticket.send({ content: `${interaction.user}`, embeds: [embed] });
        await interaction.editReply({ content: `✅ Ticket criado em ${ticket}!` });
      } catch (e) {
        await interaction.editReply({ content: '❌ Erro ao criar ticket. Use `/setup` primeiro!' });
      }
    }
  }

  if (interaction.type === InteractionType.ModalSubmit) {
    if (interaction.customId === 'mod_add') {
      const name = interaction.fields.getTextInputValue('n');
      const price = parseFloat(interaction.fields.getTextInputValue('p').replace(',', '.'));
      const stock = parseInt(interaction.fields.getTextInputValue('s'));
      db.products.push({ name, price, stock });
      saveData(db);
      await interaction.reply({ content: `✅ Produto **${name}** adicionado!`, ephemeral: true });
    }
    if (interaction.customId.startsWith('mod_edit_')) {
      const idx = parseInt(interaction.customId.split('_')[2]);
      db.products[idx].name = interaction.fields.getTextInputValue('n');
      db.products[idx].price = parseFloat(interaction.fields.getTextInputValue('p').replace(',', '.'));
      db.products[idx].stock = parseInt(interaction.fields.getTextInputValue('s'));
      saveData(db);
      await interaction.reply({ content: '✅ Produto atualizado!', ephemeral: true });
    }
    if (interaction.customId === 'mod_pix') {
      db.settings.pix_key = interaction.fields.getTextInputValue('px');
      db.settings.pix_name = interaction.fields.getTextInputValue('nm');
      saveData(db);
      await interaction.reply({ content: '✅ PIX configurado!', ephemeral: true });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
