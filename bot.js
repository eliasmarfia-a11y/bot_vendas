require('dotenv').config();
const http = require('http');
const { 
  Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, 
  ModalBuilder, TextInputBuilder, TextInputStyle, InteractionType, PermissionFlagsBits,
  REST, Routes, SlashCommandBuilder, StringSelectMenuBuilder
} = require('discord.js');

// --- SERVIDOR HTTP PARA O RENDER (PLANO GRÁTIS) ---
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot de Vendas Profissional Online 24h!\n');
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor HTTP na porta ${PORT}`));

// --- BANCO DE DADOS EM MEMÓRIA (EVITA REINICIAR NO RENDER) ---
let products = [];
let coupons = [];
let settings = { 
  pix_key: 'Não configurada',
  log_channel: null,
  welcome_channel: null
};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
});

// --- REGISTRO DE COMANDOS ---
const commands = [
  new SlashCommandBuilder().setName('admin').setDescription('Painel Administrativo da Loja').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('loja').setDescription('Ver produtos disponíveis'),
  new SlashCommandBuilder().setName('estoque').setDescription('Ver estoque atual').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('limpar').setDescription('Limpar mensagens do chat').addIntegerOption(opt => opt.setName('qtd').setDescription('1-100').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder().setName('config_canais').setDescription('Configurar canais de Log e Boas-Vindas').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
].map(cmd => cmd.toJSON());

client.once('ready', async () => {
  console.log(`Bot Profissional online como ${client.user.tag}!`);
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('Slash Commands Profissionais registrados!');
  } catch (e) { console.error(e); }
});

// --- MENSAGEM DE BOAS-VINDAS ---
client.on('guildMemberAdd', async (member) => {
  if (!settings.welcome_channel) return;
  const channel = member.guild.channels.cache.get(settings.welcome_channel);
  if (channel) {
    const embed = new EmbedBuilder()
      .setTitle(`👋 Bem-vindo(a), ${member.user.username}!`)
      .setDescription(`Seja bem-vindo ao nosso servidor! Aproveite para conferir nossas ofertas exclusivas na nossa loja.`)
      .addFields({ name: '🛒 Como comprar?', value: 'Use o comando `/loja` para ver nossos produtos!' })
      .setThumbnail(member.user.displayAvatarURL())
      .setColor('#00ff00');
    channel.send({ content: `${member}`, embeds: [embed] });
  }
});

client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;

    if (commandName === 'admin') {
      const embed = new EmbedBuilder()
        .setTitle('🛠️ Painel Administrativo')
        .setDescription('Gerencie sua loja de forma profissional.')
        .addFields(
          { name: '💰 PIX Atual', value: `\`${settings.pix_key}\``, inline: true },
          { name: '📦 Produtos', value: `\`${products.length}\``, inline: true },
          { name: '🎟️ Cupons', value: `\`${coupons.length}\``, inline: true }
        )
        .setColor('#5865F2');

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('admin_pix').setLabel('Configurar PIX').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('admin_add_prod').setLabel('Novo Produto').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('admin_add_coupon').setLabel('Novo Cupom').setStyle(ButtonStyle.Secondary)
      );

      await interaction.reply({ embeds: [embed], components: [row1], ephemeral: true });
    }

    if (commandName === 'loja') {
      if (products.length === 0) return interaction.reply({ content: '❌ A loja está vazia no momento.', ephemeral: true });

      const embed = new EmbedBuilder()
        .setTitle('🛒 Nossa Loja Virtual')
        .setDescription('Confira nossos produtos abaixo e clique no botão para comprar.')
        .setColor('#2F3136')
        .setFooter({ text: 'Pagamento via PIX seguro' });

      const rows = [];
      let currentRow = new ActionRowBuilder();

      products.forEach((p, i) => {
        embed.addFields({ name: `🔹 ${p.name}`, value: `💵 **R$ ${p.price.toFixed(2)}**\n📦 Estoque: \`${p.stock}\`\n📝 ${p.desc}`, inline: false });
        
        const btn = new ButtonBuilder()
          .setCustomId(`buy_${i}`)
          .setLabel(`Comprar ${p.name}`)
          .setStyle(ButtonStyle.Primary)
          .setDisabled(p.stock <= 0);

        if (currentRow.components.length < 5) {
          currentRow.addComponents(btn);
        } else {
          rows.push(currentRow);
          currentRow = new ActionRowBuilder().addComponents(btn);
        }
      });
      rows.push(currentRow);

      await interaction.reply({ embeds: [embed], components: rows });
    }

    if (commandName === 'config_canais') {
      settings.log_channel = interaction.channelId;
      settings.welcome_channel = interaction.channelId;
      await interaction.reply({ content: `✅ Este canal foi configurado para receber **Logs** e **Boas-Vindas**!`, ephemeral: true });
    }

    if (commandName === 'limpar') {
      const qtd = interaction.options.getInteger('qtd');
      await interaction.channel.bulkDelete(qtd, true);
      await interaction.reply({ content: `✅ Limpei ${qtd} mensagens!`, ephemeral: true });
    }
  }

  if (interaction.isButton()) {
    if (interaction.customId === 'admin_add_prod') {
      const modal = new ModalBuilder().setCustomId('modal_add_prod').setTitle('Cadastrar Produto');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nome do Produto').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('price').setLabel('Preço (Ex: 10.50)').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('stock').setLabel('Quantidade em Estoque').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('desc').setLabel('Descrição Curta').setStyle(TextInputStyle.Paragraph).setRequired(true))
      );
      await interaction.showModal(modal);
    }

    if (interaction.customId === 'admin_pix') {
      const modal = new ModalBuilder().setCustomId('modal_pix').setTitle('Configurar Pagamento');
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('pix').setLabel('Sua Chave PIX').setStyle(TextInputStyle.Short).setRequired(true)));
      await interaction.showModal(modal);
    }

    if (interaction.customId === 'admin_add_coupon') {
      const modal = new ModalBuilder().setCustomId('modal_coupon').setTitle('Criar Cupom');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('code').setLabel('Código do Cupom').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('discount').setLabel('Desconto % (Ex: 10)').setStyle(TextInputStyle.Short).setRequired(true))
      );
      await interaction.showModal(modal);
    }

    if (interaction.customId.startsWith('buy_')) {
      const idx = parseInt(interaction.customId.split('_')[1]);
      const p = products[idx];
      
      const embed = new EmbedBuilder()
        .setTitle('💎 Finalizar Compra')
        .setDescription(`Você escolheu: **${p.name}**\n\n💰 **Valor:** R$ ${p.price.toFixed(2)}\n🔑 **Chave PIX:** \`${settings.pix_key}\`\n\n*Após o pagamento, envie o comprovante para um administrador.*`)
        .setColor('#FEE75C')
        .setThumbnail(client.user.displayAvatarURL());

      await interaction.reply({ embeds: [embed], ephemeral: true });

      // LOG DE VENDA
      if (settings.log_channel) {
        const logChan = interaction.guild.channels.cache.get(settings.log_channel);
        if (logChan) {
          const logEmbed = new EmbedBuilder()
            .setTitle('🛒 Novo Interesse de Compra')
            .addFields(
              { name: '👤 Cliente', value: `${interaction.user.tag}`, inline: true },
              { name: '📦 Produto', value: `${p.name}`, inline: true },
              { name: '💵 Valor', value: `R$ ${p.price.toFixed(2)}`, inline: true }
            )
            .setColor('#EB459E')
            .setTimestamp();
          logChan.send({ embeds: [logEmbed] });
        }
      }
    }
  }

  if (interaction.type === InteractionType.ModalSubmit) {
    if (interaction.customId === 'modal_add_prod') {
      const name = interaction.fields.getTextInputValue('name');
      const price = parseFloat(interaction.fields.getTextInputValue('price').replace(',', '.'));
      const stock = parseInt(interaction.fields.getTextInputValue('stock'));
      const desc = interaction.fields.getTextInputValue('desc');
      products.push({ name, price, stock, desc });
      await interaction.reply({ content: `✅ Produto **${name}** cadastrado com sucesso!`, ephemeral: true });
    }

    if (interaction.customId === 'modal_pix') {
      settings.pix_key = interaction.fields.getTextInputValue('pix');
      await interaction.reply({ content: '✅ Chave PIX atualizada com sucesso!', ephemeral: true });
    }

    if (interaction.customId === 'modal_coupon') {
      const code = interaction.fields.getTextInputValue('code').toUpperCase();
      const discount = parseInt(interaction.fields.getTextInputValue('discount'));
      coupons.push({ code, discount });
      await interaction.reply({ content: `✅ Cupom **${code}** (${discount}%) criado!`, ephemeral: true });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
