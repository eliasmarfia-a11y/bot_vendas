require('dotenv').config();
const http = require('http');
const { 
  Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, 
  ModalBuilder, TextInputBuilder, TextInputStyle, InteractionType, PermissionFlagsBits,
  REST, Routes, SlashCommandBuilder, ChannelType, StringSelectMenuBuilder
} = require('discord.js');

// --- SERVIDOR HTTP (ANTI-SLEEP RENDER) ---
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Sistema de Vendas Ultra Rapido Online!\n');
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor HTTP na porta ${PORT}`));

// --- BANCO DE DADOS EM MEMÓRIA ---
let products = []; 
let settings = { 
  pix_key: 'Não configurada',
  pix_name: 'Loja Discord',
  category_id: null
};

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
});

// --- FUNÇÃO PIX COPIA E COLA ---
function generatePix(key, amount, name) {
  const payload = [
    '000201', '26', `0014BR.GOV.BCB.PIX01${key.length.toString().padStart(2, '0')}${key}`,
    '52040000', '5303986', `54${amount.toFixed(2).length.toString().padStart(2, '0')}${amount.toFixed(2)}`,
    '5802BR', `59${name.length.toString().padStart(2, '0')}${name}`,
    '6009SAO PAULO', '62070503***', '6304'
  ].join('');
  return payload + '1234';
}

// --- COMANDOS ---
const commands = [
  new SlashCommandBuilder().setName('admin').setDescription('Painel de Controle').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('loja').setDescription('Abrir a vitrine de produtos'),
  new SlashCommandBuilder().setName('gerenciar').setDescription('Editar ou Apagar produtos').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('setup').setDescription('Configurar canais automaticamente').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
].map(cmd => cmd.toJSON());

client.once('ready', async () => {
  console.log(`🚀 Bot Ultra Rapido online: ${client.user.tag}`);
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try { await rest.put(Routes.applicationCommands(client.user.id), { body: commands }); } catch (e) { console.error(e); }
});

client.on('interactionCreate', async (interaction) => {
  // RESPOSTA INSTANTÂNEA PARA EVITAR "APLICATIVO NÃO RESPONDEU"
  if (interaction.isChatInputCommand() || interaction.isButton() || interaction.isStringSelectMenu()) {
    if (!interaction.isModalSubmit()) {
        // Alguns comandos precisam de resposta imediata, outros de deferReply
        if (interaction.commandName === 'loja' || interaction.commandName === 'gerenciar' || interaction.customId?.startsWith('buy_')) {
            await interaction.deferReply({ ephemeral: true }).catch(() => {});
        }
    }
  }

  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;

    if (commandName === 'setup') {
      try {
        const category = await interaction.guild.channels.create({ name: '🛒 ÁREA DE VENDAS', type: ChannelType.GuildCategory });
        settings.category_id = category.id;
        await interaction.reply({ content: `✅ Setup concluído! Categoria de tickets criada.`, ephemeral: true });
      } catch (e) {
        await interaction.reply({ content: '❌ Erro ao criar categoria. Verifique se o bot tem permissão de Administrador.', ephemeral: true });
      }
    }

    if (commandName === 'admin') {
      const embed = new EmbedBuilder().setTitle('👑 Painel Admin').setColor('#5865F2').addFields({ name: '🔑 PIX', value: `\`${settings.pix_key}\`` });
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('adm_pix').setLabel('Configurar PIX').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('adm_add').setLabel('Novo Produto').setStyle(ButtonStyle.Success)
      );
      await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    if (commandName === 'gerenciar') {
      if (products.length === 0) return interaction.editReply({ content: '❌ Não há produtos para gerenciar.' });
      
      const embed = new EmbedBuilder()
        .setTitle('🛠️ Gerenciamento de Produtos')
        .setDescription('Selecione um produto abaixo para editar ou apagar.')
        .setColor('#FF5555');

      const select = new StringSelectMenuBuilder()
        .setCustomId('select_manage')
        .setPlaceholder('Escolha um produto...')
        .addOptions(products.map((p, i) => ({ label: p.name, description: `R$ ${p.price.toFixed(2)}`, value: i.toString() })));

      const row = new ActionRowBuilder().addComponents(select);
      await interaction.editReply({ embeds: [embed], components: [row] });
    }

    if (commandName === 'loja') {
      if (products.length === 0) return interaction.editReply({ content: '❌ Sem estoque.' });
      
      const embed = new EmbedBuilder()
        .setTitle('🛒 NOSSO CATÁLOGO')
        .setDescription('Confira nossos produtos abaixo e clique no botão para comprar.')
        .setColor('#2F3136');

      const rows = [];
      let currentRow = new ActionRowBuilder();

      products.forEach((p, i) => {
        embed.addFields({ name: `🎁 ${p.name}`, value: `💵 **R$ ${p.price.toFixed(2)}** | Estoque: ${p.stock}` });
        const btn = new ButtonBuilder().setCustomId(`buy_${i}`).setLabel(`Comprar ${p.name}`).setStyle(ButtonStyle.Primary).setDisabled(p.stock <= 0);
        
        if (currentRow.components.length < 5) currentRow.addComponents(btn);
        else { rows.push(currentRow); currentRow = new ActionRowBuilder().addComponents(btn); }
      });
      rows.push(currentRow);

      await interaction.editReply({ embeds: [embed], components: rows });
    }
  }

  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'select_manage') {
      const idx = parseInt(interaction.values[0]);
      const p = products[idx];
      
      const embed = new EmbedBuilder()
        .setTitle(`📝 Gerenciando: ${p.name}`)
        .addFields(
          { name: '💵 Preço', value: `R$ ${p.price.toFixed(2)}`, inline: true },
          { name: '📦 Estoque', value: `${p.stock}`, inline: true }
        )
        .setColor('#FFFF00');

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`edit_${idx}`).setLabel('Editar').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('delete_confirm').setLabel('Apagar').setStyle(ButtonStyle.Danger)
      );

      client.lastManagedIdx = idx;
      await interaction.update({ embeds: [embed], components: [row] });
    }
  }

  if (interaction.isButton()) {
    if (interaction.customId === 'adm_add') {
      const modal = new ModalBuilder().setCustomId('mod_add').setTitle('Novo Produto');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('n').setLabel('Nome').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('p').setLabel('Preço').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('s').setLabel('Estoque').setStyle(TextInputStyle.Short).setRequired(true))
      );
      await interaction.showModal(modal);
    }

    if (interaction.customId === 'adm_pix') {
      const modal = new ModalBuilder().setCustomId('mod_pix').setTitle('Configurar PIX');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('px').setLabel('Chave PIX').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nm').setLabel('Seu Nome').setStyle(TextInputStyle.Short).setRequired(true))
      );
      await interaction.showModal(modal);
    }

    if (interaction.customId.startsWith('edit_')) {
      const idx = parseInt(interaction.customId.split('_')[1]);
      const p = products[idx];
      const modal = new ModalBuilder().setCustomId(`mod_edit_${idx}`).setTitle('Editar Produto');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('n').setLabel('Nome').setValue(p.name).setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('p').setLabel('Preço').setValue(p.price.toString()).setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('s').setLabel('Estoque').setValue(p.stock.toString()).setStyle(TextInputStyle.Short).setRequired(true))
      );
      await interaction.showModal(modal);
    }

    if (interaction.customId === 'delete_confirm') {
      const idx = client.lastManagedIdx;
      const name = products[idx].name;
      products.splice(idx, 1);
      await interaction.update({ content: `✅ Produto **${name}** apagado!`, embeds: [], components: [] });
    }

    if (interaction.customId.startsWith('buy_')) {
      const idx = parseInt(interaction.customId.split('_')[1]);
      const p = products[idx];
      const pixCode = generatePix(settings.pix_key, p.price, settings.pix_name);

      try {
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
          .setDescription(`Olá ${interaction.user}, você está comprando **${p.name}**.\n\n💰 **Valor:** R$ ${p.price.toFixed(2)}\n\n**PIX COPIA E COLA:**\n\`\`\`${pixCode}\`\`\`\n\n*Pague e envie o comprovante aqui.*`)
          .setColor('#FEE75C');

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
      products.push({ name, price, stock });
      await interaction.reply({ content: `✅ Produto **${name}** adicionado!`, ephemeral: true });
    }
    if (interaction.customId.startsWith('mod_edit_')) {
      const idx = parseInt(interaction.customId.split('_')[2]);
      products[idx].name = interaction.fields.getTextInputValue('n');
      products[idx].price = parseFloat(interaction.fields.getTextInputValue('p').replace(',', '.'));
      products[idx].stock = parseInt(interaction.fields.getTextInputValue('s'));
      await interaction.reply({ content: `✅ Produto **${products[idx].name}** atualizado!`, ephemeral: true });
    }
    if (interaction.customId === 'mod_pix') {
      settings.pix_key = interaction.fields.getTextInputValue('px');
      settings.pix_name = interaction.fields.getTextInputValue('nm');
      await interaction.reply({ content: '✅ PIX configurado!', ephemeral: true });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
        
