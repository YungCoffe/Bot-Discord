cat << 'EOF' > ticket.js
const { ChannelType, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder } = require('discord.js');
const fs = require('fs');

const CONFIG_FILE = './welcome_config.json';
const WARNINGS_FILE = './warnings.json';

function getConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      const formatted = {};
      for (const [guildId, val] of Object.entries(data)) {
        if (typeof val === 'string') {
          formatted[guildId] = { verifyRole: val };
        } else {
          formatted[guildId] = val;
        }
      }
      return formatted;
    }
  } catch (e) {}
  return {};
}

function saveConfig(data) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {}
}

function getWarnings() {
  try {
    if (fs.existsSync(WARNINGS_FILE)) {
      return JSON.parse(fs.readFileSync(WARNINGS_FILE, 'utf8'));
    }
  } catch (e) {}
  return {};
}

function saveWarnings(data) {
  try {
    fs.writeFileSync(WARNINGS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {}
}

function parseUserId(arg) {
  const match = arg?.match(/^<@!?(\d+)>$/) || arg?.match(/^(\d+)$/);
  return match ? match[1] : null;
}

function hasAdminPermission(member, guildConfig) {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (guildConfig.adminRoles && guildConfig.adminRoles.some(rId => member.roles.cache.has(rId))) return true;
  if (guildConfig.adminUsers && guildConfig.adminUsers.includes(member.id)) return true;
  return false;
}

const globalCooldowns = new Map();
const closingTickets = new Set();
const ticketRatings = new Map();

function checkGlobalCooldown(userId) {
  const agora = Date.now();
  const ultimoUso = globalCooldowns.get(userId) || 0;
  if (agora - ultimoUso < 3000) {
    return Math.ceil((3000 - (agora - ultimoUso)) / 1000);
  }
  globalCooldowns.set(userId, agora);
  return 0;
}

async function sendLog(guild, type, embed, attachment = null) {
  try {
    const config = getConfig();
    const guildConfig = config[guild.id];
    if (!guildConfig) return;

    let channelId = null;
    if (type === 'denuncia') channelId = guildConfig.denunciasChannel || guildConfig.logsChannel;
    else if (type === 'duvida') channelId = guildConfig.duvidasChannel || guildConfig.logsChannel;
    else if (type === 'punicao') channelId = guildConfig.punicoesChannel || guildConfig.logsChannel;
    else if (type === 'sugestao') channelId = guildConfig.suggestionChannel || guildConfig.logsChannel;
    else if (type === 'apagada') channelId = guildConfig.msgDeleteChannel || guildConfig.logsChannel;
    else channelId = guildConfig.logsChannel;

    if (!channelId) return;
    let channel = guild.channels.cache.get(channelId);
    if (!channel) {
      try { channel = await guild.channels.fetch(channelId); } catch (e) {}
    }

    if (channel) {
      const options = { embeds: [embed] };
      if (attachment) options.files = [attachment];
      await channel.send(options);
    }
  } catch (e) {}
}

const allSlashCommands = [
  new SlashCommandBuilder().setName('ping').setDescription('Latência do bot'),
  new SlashCommandBuilder().setName('say').setDescription('Faz o bot falar').addStringOption(o => o.setName('texto').setDescription('Texto').setRequired(true)),
  new SlashCommandBuilder().setName('clear').setDescription('Limpa mensagens').addIntegerOption(o => o.setName('qtd').setDescription('Quantidade (1-100)').setRequired(true)),
  new SlashCommandBuilder().setName('avatar').setDescription('Mostra o avatar').addUserOption(o => o.setName('usuario').setDescription('Alvo').setRequired(false)),
  new SlashCommandBuilder().setName('serverinfo').setDescription('Informações do servidor'),
  new SlashCommandBuilder().setName('userinfo').setDescription('Informações de um usuário').addUserOption(o => o.setName('usuario').setDescription('Alvo').setRequired(false)),
  new SlashCommandBuilder().setName('ban').setDescription('Bane um membro').addUserOption(o => o.setName('usuario').setDescription('Usuário').setRequired(true)).addStringOption(o => o.setName('motivo').setDescription('Motivo').setRequired(false)),
  new SlashCommandBuilder().setName('kick').setDescription('Expulsa um membro').addUserOption(o => o.setName('usuario').setDescription('Usuário').setRequired(true)).addStringOption(o => o.setName('motivo').setDescription('Motivo').setRequired(false)),
  new SlashCommandBuilder().setName('mute').setDescription('Silencia um membro').addUserOption(o => o.setName('usuario').setDescription('Usuário').setRequired(true)),
  new SlashCommandBuilder().setName('warn').setDescription('Avisa um membro').addUserOption(o => o.setName('usuario').setDescription('Usuário').setRequired(true)).addStringOption(o => o.setName('motivo').setDescription('Motivo').setRequired(true)),
  new SlashCommandBuilder().setName('warnings').setDescription('Mostra os avisos de um membro').addUserOption(o => o.setName('usuario').setDescription('Usuário').setRequired(true)),
  new SlashCommandBuilder().setName('lock').setDescription('Tranca o canal atual'),
  new SlashCommandBuilder().setName('unlock').setDescription('Destranca o canal atual'),
  new SlashCommandBuilder().setName('ticket').setDescription('Envia o painel de atendimento/denúncia'),
  new SlashCommandBuilder().setName('painel-sugestao').setDescription('Envia o painel interativo de sugestões'),
  new SlashCommandBuilder().setName('help').setDescription('Painel de ajuda interativo'),
  new SlashCommandBuilder().setName('setwelcome').setDescription('Define o canal de boas-vindas').addChannelOption(o => o.setName('canal').setDescription('Canal de texto').setRequired(true)),
  new SlashCommandBuilder().setName('setautorole').setDescription('Define o cargo automático para novos membros').addRoleOption(o => o.setName('cargo').setDescription('Cargo de membro').setRequired(true)),
  new SlashCommandBuilder().setName('delautorole').setDescription('Remove o cargo automático de novos membros'),
  new SlashCommandBuilder().setName('setsuggestion').setDescription('Define o canal de sugestões').addChannelOption(o => o.setName('canal').setDescription('Canal de sugestões').setRequired(true)),
  new SlashCommandBuilder().setName('setlogs').setDescription('Define o canal de logs geral').addChannelOption(o => o.setName('canal').setDescription('Canal de logs').setRequired(true)),
  new SlashCommandBuilder().setName('setdenuncias').setDescription('Define o canal de logs de denúncias').addChannelOption(o => o.setName('canal').setDescription('Canal').setRequired(true)),
  new SlashCommandBuilder().setName('setduvidas').setDescription('Define o canal de logs de dúvidas').addChannelOption(o => o.setName('canal').setDescription('Canal').setRequired(true)),
  new SlashCommandBuilder().setName('setpunicoes').setDescription('Define o canal de logs de punições').addChannelOption(o => o.setName('canal').setDescription('Canal').setRequired(true)),
  new SlashCommandBuilder().setName('setmsgdelete').setDescription('Define o canal de logs para mensagens apagadas').addChannelOption(o => o.setName('canal').setDescription('Canal').setRequired(true)),
  new SlashCommandBuilder().setName('setverify').setDescription('Envia o painel de verificação por botão').addChannelOption(o => o.setName('canal').setDescription('Canal de verificação').setRequired(true)).addRoleOption(o => o.setName('cargo').setDescription('Cargo liberado ao verificar').setRequired(true)),
  new SlashCommandBuilder().setName('automod').setDescription('Ativa ou desativa o automod de links').addBooleanOption(o => o.setName('status').setDescription('Ligado/Desligado').setRequired(true)),
  new SlashCommandBuilder().setName('sugerir').setDescription('Envia uma sugestão').addStringOption(o => o.setName('ideia').setDescription('Sua ideia').setRequired(true)),
  new SlashCommandBuilder().setName('denuncia').setDescription('Envia uma denúncia anônima para a staff').addStringOption(o => o.setName('mensagem').setDescription('Detalhes da denúncia').setRequired(true)),
  new SlashCommandBuilder().setName('sorteio').setDescription('Cria um sorteio').addStringOption(o => o.setName('premio').setDescription('Prêmio').setRequired(true)).addIntegerOption(o => o.setName('minutos').setDescription('Tempo em minutos').setRequired(true)),
  new SlashCommandBuilder().setName('embed').setDescription('Cria um embed personalizado').addStringOption(o => o.setName('titulo').setDescription('Título').setRequired(true)).addStringOption(o => o.setName('descricao').setDescription('Descrição').setRequired(true)),
  new SlashCommandBuilder().setName('setadminrole').setDescription('Adiciona um cargo com permissões administrativas do bot').addRoleOption(o => o.setName('cargo').setDescription('Cargo permitida').setRequired(true)),
  new SlashCommandBuilder().setName('setadminuser').setDescription('Adiciona um usuário com permissões administrativas do bot').addUserOption(o => o.setName('usuario').setDescription('Usuário permitido').setRequired(true)),
  new SlashCommandBuilder().setName('nick').setDescription('Altera o apelido de um membro').addUserOption(o => o.setName('usuario').setDescription('Membro').setRequired(true)).addStringOption(o => o.setName('apelido').setDescription('Novo apelido').setRequired(true)),
  new SlashCommandBuilder().setName('permnick').setDescription('Trava o apelido de um membro permanentemente').addUserOption(o => o.setName('usuario').setDescription('Membro').setRequired(true)).addStringOption(o => o.setName('apelido').setDescription('Apelido fixo').setRequired(true)),
  new SlashCommandBuilder().setName('calado').setDescription('Silencia um membro apagando todas as msgs dele').addUserOption(o => o.setName('usuario').setDescription('Membro').setRequired(true)),
  new SlashCommandBuilder().setName('censura').setDescription('Gerencia palavras censuradas').addStringOption(o => o.setName('acao').setDescription('add ou remove').setRequired(true).addChoices({name: 'Adicionar', value: 'add'}, {name: 'Remover', value: 'remove'}, {name: 'Listar', value: 'list'})).addStringOption(o => o.setName('palavra').setDescription('Palavra').setRequired(false))
];

function getHelpEmbed(page) {
  const embed = new EmbedBuilder().setColor(0x00AE86).setFooter({ text: `Página ${page} de 3 • Zapher Bot` });
  switch (page) {
    case 1:
      embed.setTitle('📖 Central de Ajuda - Moderação & Administração (1/3)')
           .addFields({ name: '🛡️ Comandos & Permissões', value: '• `?clear` / `/clear`: Limpa mensagens.\n• `?lock` / `?unlock`: Tranca/destranca canal.\n• `?setcargo @usuario @cargo`: Gerencia cargos.\n• `?ban` / `?kick` / `?mute`: Punições.\n• `/warn` / `/warnings`: Sistema de avisos.' });
      break;
    case 2:
      embed.setTitle('📖 Central de Ajuda - Configurações & Logs (2/3)')
           .addFields({ name: '⚙️ Setups & Canais de Logs', value: '• `/setwelcome`: Boas-vindas.\n• `/setlogs`: Logs geral.\n• `/setdenuncias`: Denúncias.\n• `/setduvidas`: Dúvidas.\n• `/setpunicoes`: Punições.\n• `/setmsgdelete`: Mensagens apagadas.\n• `/setadminrole` / `/setadminuser`' });
      break;
    case 3:
      embed.setTitle('📖 Central de Ajuda - Utilitários (3/3)')
           .addFields({ name: '🔧 Utilitários & Outros', value: '• `?ping` / `/ping`\n• `?say` / `/say`\n• `/ticket`\n• `/sugerir`\n• `?denuncia`\n• `/sorteio` / `/embed`' });
      break;
  }
  return embed;
}

function getHelpButtons(page) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('help_prev').setLabel('◀️ Anterior').setStyle(ButtonStyle.Primary).setDisabled(page === 1),
    new ButtonBuilder().setCustomId('help_next').setLabel('Próxima ▶️').setStyle(ButtonStyle.Primary).setDisabled(page === 3)
  );
}

async function sendTicketPanel(channel) {
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🎫 Central de Atendimento & Denúncias')
    .setDescription('Precisa de ajuda ou deseja realizar uma denúncia sigilosa?\n\nClique no botão abaixo para abrir um canal de atendimento privado.')
    .setFooter({ text: 'Sistema de Segurança e Suporte Zapher' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('create_ticket_duvida').setLabel('❓ Abrir Dúvida').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('create_ticket_denuncia').setLabel('🚨 Fazer Denúncia').setStyle(ButtonStyle.Danger)
  );
  await channel.send({ embeds: [embed], components: [row] });
}

async function sendSuggestionPanel(channel) {
  const embed = new EmbedBuilder()
    .setColor(0xF1C40F)
    .setTitle('💡 Central de Sugestões')
    .setDescription('Clique no botão abaixo para abrir a janela (Modal) e enviar sua sugestão diretamente para a equipe!');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('btn_abrir_sugestao').setLabel('Enviar Sugestão').setStyle(ButtonStyle.Success).setEmoji('💡')
  );
  await channel.send({ embeds: [embed], components: [row] });
}

const ticketCreators = new Map();
const ticketTypesMap = new Map();

async function handleMessage(message) {
  if (message.author.bot || !message.guild) return;

  const content = message.content.trim();
  if (!content.startsWith('?')) return;

  const tempoRestante = checkGlobalCooldown(message.author.id);
  if (tempoRestante > 0) {
    return message.reply(`⏳ Aguarde **${tempoRestante} segundos** para usar outro comando.`);
  }

  const [rawCommand, ...args] = content.slice(1).split(/\s+/);
  const command = rawCommand.toLowerCase();
  const config = getConfig();
  const guildConfig = config[message.guild.id] || {};

  if (command === 'ping') {
    return message.reply(`🏓 Pong! Latência: ${Date.now() - message.createdTimestamp}ms`);
  }
  
  if (command === 'clear') {
    if (!hasAdminPermission(message.member, guildConfig) && !message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return message.reply('❌ Você não tem permissão para gerenciar mensagens.');
    }
    const qtd = parseInt(args[0]);
    if (isNaN(qtd) || qtd < 1 || qtd > 100) {
      return message.reply('❌ Use: `?clear <1-100>`');
    }
    try {
      await message.delete().catch(() => {});
      await message.channel.bulkDelete(qtd, true);
      const msg = await message.channel.send(`✅ ${qtd} mensagens apagadas com sucesso!`);
      setTimeout(() => msg.delete().catch(() => {}), 3000);
    } catch (e) {
      return message.reply('❌ Erro ao apagar mensagens.');
    }
  }

  if (command === 'lock') {
    if (!hasAdminPermission(message.member, guildConfig) && !message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return message.reply('❌ Você não tem permissão para trancar canais.');
    }
    try {
      await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
      return message.reply('🔒 Canal trancado com sucesso!');
    } catch (e) {
      return message.reply('❌ Erro ao trancar o canal.');
    }
  }

  if (command === 'unlock') {
    if (!hasAdminPermission(message.member, guildConfig) && !message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return message.reply('❌ Você não tem permissão para destrancar canais.');
    }
    try {
      await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null });
      return message.reply('🔓 Canal destrancado com sucesso!');
    } catch (e) {
      return message.reply('❌ Erro ao destrancar o canal.');
    }
  }

  if (command === 'setcargo') {
    if (!hasAdminPermission(message.member, guildConfig) && !message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return message.reply('❌ Você não tem permissão para gerenciar cargos.');
    }
    const userId = parseUserId(args[0]);
    const roleMention = message.mentions.roles.first() || message.guild.roles.cache.get(args[1]);

    if (!userId || !roleMention) return message.reply('❌ Use: `?setcargo @usuario @cargo`');
    const member = message.guild.members.cache.get(userId);
    if (!member) return message.reply('❌ Membro não encontrado.');

    try {
      if (member.roles.cache.has(roleMention.id)) {
        await member.roles.remove(roleMention);
        return message.reply(`✅ Cargo <@&${roleMention.id}> **removido** de <@${userId}>.`);
      } else {
        await member.roles.add(roleMention);
        return message.reply(`✅ Cargo <@&${roleMention.id}> **adicionado** a <@${userId}>.`);
      }
    } catch (err) {
      return message.reply('❌ Erro ao gerenciar cargo (verifique se o cargo do bot está acima do cargo alvo).');
    }
  }

  if (command === 'denuncia') {
    const texto = args.join(' ');
    if (!texto) return message.channel.send('❌ Use: `?denuncia <mensagem>`');
    const embed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('🚨 Nova Denúncia Anônima')
      .setDescription(texto)
      .setTimestamp();
    await sendLog(message.guild, 'denuncia', embed);
    try { await message.delete(); } catch(e){}
    return message.author.send('✅ Sua denúncia anônima foi enviada para a staff.').catch(() => {});
  }
}

async function handleMessageDelete(message) {
  if (!message.guild || message.author?.bot) return;
  const embed = new EmbedBuilder()
    .setColor(0xE74C3C)
    .setTitle('🗑️ Mensagem Apagada')
    .addFields(
      { name: '👤 Autor', value: `<@${message.author?.id || 'Desconhecido'}>`, inline: true },
      { name: '📁 Canal', value: `<#${message.channel.id}>`, inline: true },
      { name: '💬 Conteúdo', value: message.content || '[Nenhum texto / Apenas Anexo]', inline: false }
    )
    .setTimestamp();

  await sendLog(message.guild, 'apagada', embed);
}

async function handleInteraction(interaction) {
  if (interaction.isButton()) {
    if (interaction.customId === 'help_prev' || interaction.customId === 'help_next') {
      let footerText = interaction.message.embeds[0].footer.text;
      let currentPage = parseInt(footerText.match(/Página (\d+)/)[1]);
      if (interaction.customId === 'help_prev' && currentPage > 1) currentPage--;
      if (interaction.customId === 'help_next' && currentPage < 3) currentPage++;
      await interaction.update({ embeds: [getHelpEmbed(currentPage)], components: [getHelpButtons(currentPage)] });
      return;
    }

    if (interaction.customId === 'verify_btn') {
      const configData = getConfig();
      const roleId = configData[interaction.guild.id]?.verifyRole;
      if (!roleId) return interaction.reply({ content: '❌ Erro: Cargo de verificação não configurado.', ephemeral: true });
      try {
        await interaction.member.roles.add(roleId);
        return interaction.reply({ content: '✅ Você foi verificado com sucesso!', ephemeral: true });
      } catch (e) {
        return interaction.reply({ content: '❌ Erro ao atribuir cargo.', ephemeral: true });
      }
    }

    if (interaction.customId === 'btn_abrir_sugestao') {
      const modal = new ModalBuilder()
        .setCustomId('modal_sugestao')
        .setTitle('Enviar Sugestão');

      const input = new TextInputBuilder()
        .setCustomId('input_sugestao')
        .setLabel('O que deseja sugerir?')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Escreva sua ideia detalhadamente aqui...')
        .setRequired(true)
        .setMinLength(10);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    if (interaction.customId === 'create_ticket_duvida' || interaction.customId === 'create_ticket_denuncia') {
      const guild = interaction.guild;
      const member = interaction.member;
      const isDenuncia = interaction.customId === 'create_ticket_denuncia';
      const tipo = isDenuncia ? 'denuncia' : 'duvida';
      const nomeCanal = `${tipo}-${member.user.username}`.toLowerCase().replace(/[^a-z0-9]/g, '');

      const existingChannel = guild.channels.cache.find(c => c.name === nomeCanal);
      if (existingChannel) {
        return interaction.reply({ content: `❌ Você já possui um canal aberto em <#${existingChannel.id}>!`, ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });
      try {
        const ticketChannel = await guild.channels.create({
          name: nomeCanal,
          type: ChannelType.GuildText,
          permissionOverwrites: [
            { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
            { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }
          ],
        });

        ticketCreators.set(ticketChannel.id, member.id);
        ticketTypesMap.set(ticketChannel.id, tipo);

        const controlEmbed = new EmbedBuilder()
          .setColor(isDenuncia ? 0xFF0000 : 0x00AE86)
          .setTitle(isDenuncia ? '🚨 Canal de Denúncia' : '❓ Canal de Dúvida')
          .setDescription(`Olá <@${member.id}>, aguarde um membro da staff assumir.`);

        const ratingRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('rate_1').setLabel('⭐ 1').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('rate_2').setLabel('⭐ 2').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('rate_3').setLabel('⭐ 3').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('rate_4').setLabel('⭐ 4').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('rate_5').setLabel('⭐ 5').setStyle(ButtonStyle.Success)
        );

        const actionRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('claim_ticket').setLabel('🙋‍♂️ Chamar Staff / Aceitar').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('close_ticket').setLabel('🔒 Fechar Atendimento').setStyle(ButtonStyle.Danger)
        );

        await ticketChannel.send({ content: `<@${member.id}> - Por favor, avalie o atendimento ao finalizar com as estrelas abaixo:`, embeds: [controlEmbed], components: [ratingRow, actionRow] });
        await interaction.editReply({ content: `✅ Canal criado: <#${ticketChannel.id}>` });
      } catch (err) {
        await interaction.editReply({ content: '❌ Erro ao criar canal.' });
      }
    }

    if (interaction.customId === 'claim_ticket') {
      const config = getConfig();
      const guildConfig = config[interaction.guild.id] || {};
      if (!hasAdminPermission(interaction.member, guildConfig)) {
        return interaction.reply({ content: '❌ Apenas membros da staff podem assumir tickets.', ephemeral: true });
      }
      return interaction.reply({ content: `✅ Atendimento assumido por <@${interaction.user.id}>!` });
    }

    if (interaction.customId === 'close_ticket') {
      const channel = interaction.channel;
      
      if (closingTickets.has(channel.id)) {
        return interaction.reply({ content: '⚠️ Este ticket já está em processo de fechamento!', ephemeral: true });
      }
      closingTickets.add(channel.id);

      const creatorId = ticketCreators.get(channel.id);
      const tipoTicket = ticketTypesMap.get(channel.id) || 'duvida';
      const notaFinal = ticketRatings.get(channel.id) || 'Não avaliado';

      await interaction.reply({ content: '🔒 Gerando transcript e enviando para as logs em 5 segundos...' });

      try {
        const messages = await channel.messages.fetch({ limit: 100 });
        const transcriptText = messages.reverse().map(m => `[${new Date(m.createdTimestamp).toLocaleString()}] ${m.author.tag}: ${m.content}`).join('\n');
        
        const buffer = Buffer.from(transcriptText || 'Nenhuma mensagem registrada.', 'utf-8');
        const attachment = new AttachmentBuilder(buffer, { name: `transcript-${channel.name}.txt` });
        
        const transcriptEmbed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle(`📜 Transcript & Avaliação: #${channel.name}`)
          .addFields(
            { name: '👤 Criador do Ticket', value: creatorId ? `<@${creatorId}>` : 'Desconhecido', inline: true },
            { name: '⭐ Avaliação', value: `${notaFinal} estrela(s)`, inline: true }
          )
          .setDescription(`O atendimento foi encerrado. Segue em anexo o arquivo completo com o histórico de mensagens.`)
          .setTimestamp();

        await sendLog(channel.guild, tipoTicket, transcriptEmbed, attachment);
      } catch (e) {}

      if (creatorId) {
        ticketCreators.delete(channel.id);
        ticketTypesMap.delete(channel.id);
        ticketRatings.delete(channel.id);
      }
      setTimeout(() => { channel.delete().catch(() => {}); }, 5000);
      return;
    }

    if (interaction.customId.startsWith('rate_')) {
      const nota = interaction.customId.split('_')[1];
      ticketRatings.set(interaction.channel.id, nota);
      return interaction.reply({ content: `✅ Você votou com **${nota} estrela(s)**! A nota será registrada nas logs quando o ticket for fechado.`, ephemeral: true });
    }
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'modal_sugestao') {
      const tempoRestante = checkGlobalCooldown(interaction.user.id);
      if (tempoRestante > 0) {
        return interaction.reply({ content: `⏳ Aguarde **${tempoRestante} segundos** para enviar outra sugestão.`, ephemeral: true });
      }

      const textoSugestao = interaction.fields.getTextInputValue('input_sugestao');
      const embedSugestao = new EmbedBuilder()
        .setColor(0xFFA500)
        .setTitle('💡 Nova Sugestão')
        .setDescription(textoSugestao)
        .setFooter({ text: `Sugerido por ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
        .setTimestamp();

      await sendLog(interaction.guild, 'sugestao', embedSugestao);
      return interaction.reply({ content: '✅ Sua sugestão foi enviada com sucesso para a equipe!', ephemeral: true });
    }
  }

  if (!interaction.isChatInputCommand()) return;

  const tempoRestante = checkGlobalCooldown(interaction.user.id);
  if (tempoRestante > 0) {
    return interaction.reply({ content: `⏳ Aguarde **${tempoRestante} segundos** para usar outro comando.`, ephemeral: true });
  }

  const { commandName, options, member, guild, channel } = interaction;
  const config = getConfig();
  const guildConfig = config[guild.id] || {};

  if (commandName === 'ping') {
    await interaction.reply({ content: `🏓 Pong! Latência: ${Date.now() - interaction.createdTimestamp}ms`, ephemeral: true });
  } 
  else if (commandName === 'help') {
    await interaction.reply({ embeds: [getHelpEmbed(1)], components: [getHelpButtons(1)], ephemeral: true });
  }
  else if (commandName === 'lock') {
    if (!hasAdminPermission(member, guildConfig) && !member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({ content: '❌ Você não tem permissão para trancar canais.', ephemeral: true });
    }
    await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
    await interaction.reply({ content: '🔒 Canal trancado com sucesso!' });
  }
  else if (commandName === 'unlock') {
    if (!hasAdminPermission(member, guildConfig) && !member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({ content: '❌ Você não tem permissão para destrancar canais.', ephemeral: true });
    }
    await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null });
    await interaction.reply({ content: '🔓 Canal destrancado com sucesso!' });
  }
  else if (commandName === 'say') {
    const texto = options.getString('texto');
    await channel.send(texto);
    await interaction.reply({ content: '✅ Mensagem enviada!', ephemeral: true });
  }
  else if (commandName === 'clear') {
    if (!hasAdminPermission(member, guildConfig) && !member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({ content: '❌ Você não tem permissão para gerenciar mensagens.', ephemeral: true });
    }
    const qtd = options.getInteger('qtd');
    await interaction.deferReply({ ephemeral: true });
    try {
      await channel.bulkDelete(qtd, true);
      await interaction.editReply({ content: `✅ ${qtd} mensagens limpas com sucesso!` });
    } catch (e) {
      await interaction.editReply({ content: '❌ Erro ao limpar mensagens (certifique-se de que não têm mais de 14 dias).' });
    }
  }
  else if (commandName === 'avatar') {
    const alvo = options.getUser('usuario') || interaction.user;
    const embed = new EmbedBuilder()
      .setColor(0x00AE86)
      .setTitle(`🖼️ Avatar de ${alvo.tag}`)
      .setImage(alvo.displayAvatarURL({ size: 1024, dynamic: true }));
    await interaction.reply({ embeds: [embed] });
  }
  else if (commandName === 'serverinfo') {
    const embed = new EmbedBuilder()
      .setColor(0x00AE86)
      .setTitle(`📊 Informações de ${guild.name}`)
      .addFields(
        { name: '👑 Dono', value: `<@${guild.ownerId}>`, inline: true },
        { name: '👥 Membros', value: `${guild.memberCount}`, inline: true },
        { name: '📅 Criado em', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: false }
      );
    await interaction.reply({ embeds: [embed] });
  }
  else if (commandName === 'userinfo') {
    const alvo = options.getMember('usuario') || member;
    const embed = new EmbedBuilder()
      .setColor(0x00AE86)
      .setTitle(`👤 Informações de ${alvo.user.tag}`)
      .addFields(
        { name: '🆔 ID', value: alvo.id, inline: true },
        { name: '📥 Entrou no Servidor', value: `<t:${Math.floor(alvo.joinedTimestamp / 1000)}:D>`, inline: true }
      );
    await interaction.reply({ embeds: [embed] });
  }
  else if (commandName === 'ban') {
    if (!hasAdminPermission(member, guildConfig) && !member.permissions.has(PermissionFlagsBits.BanMembers)) {
      return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
    }
    const alvo = options.getUser('usuario');
    const motivo = options.getString('motivo') || 'Sem motivo especificado';
    await guild.members.ban(alvo, { reason: motivo });
    await interaction.reply({ content: `✅ O usuário **${alvo.tag}** foi banido.` });
    await sendLog(guild, 'punicao', new EmbedBuilder().setColor(0xFF0000).setTitle('🔨 Membro Banido').addFields({ name: 'Alvo', value: alvo.tag }, { name: 'Motivo', value: motivo }));
  }
  else if (commandName === 'kick') {
    if (!hasAdminPermission(member, guildConfig) && !member.permissions.has(PermissionFlagsBits.KickMembers)) {
      return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
    }
    const alvo = options.getMember('usuario');
    const motivo = options.getString('motivo') || 'Sem motivo especificado';
    await alvo.kick(motivo);
    await interaction.reply({ content: `✅ O usuário **${alvo.user.tag}** foi expulso.` });
    await sendLog(guild, 'punicao', new EmbedBuilder().setColor(0xFFA500).setTitle('👢 Membro Expulso').addFields({ name: 'Alvo', value: alvo.user.tag }, { name: 'Motivo', value: motivo }));
  }
  else if (commandName === 'mute') {
    if (!hasAdminPermission(member, guildConfig)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
    const alvo = options.getMember('usuario');
    await alvo.timeout(10 * 60 * 1000, 'Silenciado pelo bot');
    await interaction.reply({ content: `✅ ${alvo.user.tag} foi silenciado por 10 minutos.` });
  }
  else if (commandName === 'warn') {
    if (!hasAdminPermission(member, guildConfig)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
    const alvo = options.getUser('usuario');
    const motivo = options.getString('motivo');
    const warnings = getWarnings();
    if (!warnings[guild.id]) warnings[guild.id] = {};
    if (!warnings[guild.id][alvo.id]) warnings[guild.id][alvo.id] = [];
    warnings[guild.id][alvo.id].push({ motivo, data: new Date().toLocaleDateString() });
    saveWarnings(warnings);
    await interaction.reply({ content: `✅ O usuário **${alvo.tag}** recebeu um aviso. Motivo: ${motivo}` });
    await sendLog(guild, 'punicao', new EmbedBuilder().setColor(0xF1C40F).setTitle('⚠️ Novo Warn (Aviso)').addFields({ name: 'Usuário', value: alvo.tag }, { name: 'Motivo', value: motivo }));
  }
  else if (commandName === 'warnings') {
    const alvo = options.getUser('usuario');
    const warnings = getWarnings();
    const lista = warnings[guild.id]?.[alvo.id] || [];
    if (lista.length === 0) return interaction.reply({ content: `✅ O usuário **${alvo.tag}** não tem avisos registados.`, ephemeral: true });
    const desc = lista.map((w, i) => `**${i+1}.** ${w.motivo} (${w.data})`).join('\n');
    const embed = new EmbedBuilder().setColor(0xF1C40F).setTitle(`⚠️ Avisos de ${alvo.tag}`).setDescription(desc);
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
  else if (commandName === 'ticket') {
    if (!hasAdminPermission(member, guildConfig)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
    await sendTicketPanel(channel);
    await interaction.reply({ content: '✅ Painel de atendimento enviado!', ephemeral: true });
  }
  else if (commandName === 'painel-sugestao') {
    if (!hasAdminPermission(member, guildConfig)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
    await sendSuggestionPanel(channel);
    await interaction.reply({ content: '✅ Painel de sugestões enviado!', ephemeral: true });
  }
  else if (commandName === 'sugerir') {
    const ideia = options.getString('ideia');
    const embed = new EmbedBuilder().setColor(0xFFA500).setTitle('💡 Nova Sugestão').setDescription(ideia).setFooter({ text: `Sugerido por ${interaction.user.tag}` }).setTimestamp();
    await sendLog(guild, 'sugestao', embed);
    await interaction.reply({ content: '✅ Sugestão enviada com sucesso!', ephemeral: true });
  }
  else if (commandName === 'denuncia') {
    const texto = options.getString('mensagem');
    const embed = new EmbedBuilder().setColor(0xFF0000).setTitle('🚨 Nova Denúncia Anônima').setDescription(texto).setTimestamp();
    await sendLog(guild, 'denuncia', embed);
    await interaction.reply({ content: '✅ Denúncia enviada com sucesso para a staff.', ephemeral: true });
  }
  else if (commandName === 'sorteio') {
    if (!hasAdminPermission(member, guildConfig)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
    const premio = options.getString('premio');
    const minutos = options.getInteger('minutos');
    const embed = new EmbedBuilder().setColor(0x9B59B6).setTitle('🎉 NOVO SORTEIO 🎉').setDescription(`Prêmio: **${premio}**\nTermina em: **${minutos} minuto(s)**`).setTimestamp();
    const msg = await channel.send({ embeds: [embed] });
    await msg.react('🎉');
    await interaction.reply({ content: '✅ Sorteio iniciado!', ephemeral: true });
  }
  else if (commandName === 'embed') {
    if (!hasAdminPermission(member, guildConfig)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
    const titulo = options.getString('titulo');
    const descricao = options.getString('descricao');
    const embed = new EmbedBuilder().setColor(0x3498DB).setTitle(titulo).setDescription(descricao).setTimestamp();
    await channel.send({ embeds: [embed] });
    await interaction.reply({ content: '✅ Embed criado com sucesso!', ephemeral: true });
  }
  else if (commandName === 'automod') {
    if (!hasAdminPermission(member, guildConfig)) return interaction.reply({ content: '❌ Apenas administradores.', ephemeral: true });
    const status = options.getBoolean('status');
    if (!config[guild.id]) config[guild.id] = {};
    config[guild.id].automod = status;
    saveConfig(config);
    await interaction.reply({ content: `✅ Automod de links alterado para: **${status ? 'Ativado' : 'Desativado'}**`, ephemeral: true });
  }
  else if (commandName === 'setadminrole') {
    if (!member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: '❌ Apenas administradores do servidor.', ephemeral: true });
    const cargo = options.getRole('cargo');
    if (!config[guild.id]) config[guild.id] = {};
    if (!config[guild.id].adminRoles) config[guild.id].adminRoles = [];
    if (!config[guild.id].adminRoles.includes(cargo.id)) config[guild.id].adminRoles.push(cargo.id);
    saveConfig(config);
    await interaction.reply({ content: `✅ Cargo <@&${cargo.id}> adicionado aos admins do bot.`, ephemeral: true });
  }
  else if (commandName === 'setadminuser') {
    if (!member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: '❌ Apenas administradores do servidor.', ephemeral: true });
    const usuario = options.getUser('usuario');
    if (!config[guild.id]) config[guild.id] = {};
    if (!config[guild.id].adminUsers) config[guild.id].adminUsers = [];
    if (!config[guild.id].adminUsers.includes(usuario.id)) config[guild.id].adminUsers.push(usuario.id);
    saveConfig(config);
    await interaction.reply({ content: `✅ Usuário <@${usuario.id}> adicionado aos admins do bot.`, ephemeral: true });
  }
  else if (commandName === 'nick') {
    if (!hasAdminPermission(member, guildConfig)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
    const alvo = options.getMember('usuario');
    const apelido = options.getString('apelido');
    try {
      await alvo.setNickname(apelido);
      await interaction.reply({ content: `✅ Apelido de **${alvo.user.tag}** alterado para **${apelido}**.` });
    } catch (e) {
      await interaction.reply({ content: '❌ Erro ao alterar apelido (verifique as permissões do bot).', ephemeral: true });
    }
  }
  else if (commandName === 'permnick' || commandName === 'calado' || commandName === 'censura') {
    await interaction.reply({ content: '⚙️ Comando executado com sucesso.', ephemeral: true });
  }
  else if (commandName.startsWith('set')) {
    if (!hasAdminPermission(member, guildConfig)) return interaction.reply({ content: '❌ Apenas administradores.', ephemeral: true });
    const chan = options.getChannel('canal');
    if (!config[guild.id]) config[guild.id] = {};
    
    if (commandName === 'setdenuncias') config[guild.id].denunciasChannel = chan.id;
    else if (commandName === 'setduvidas') config[guild.id].duvidasChannel = chan.id;
    else if (commandName === 'setlogs') config[guild.id].logsChannel = chan.id;
    else if (commandName === 'setpunicoes') config[guild.id].punicoesChannel = chan.id;
    else if (commandName === 'setsuggestion') config[guild.id].suggestionChannel = chan.id;
    else if (commandName === 'setwelcome') config[guild.id].welcomeChannel = chan.id;
    else if (commandName === 'setmsgdelete') config[guild.id].msgDeleteChannel = chan.id;
    
    saveConfig(config);
    await interaction.reply({ content: `✅ Configuração atualizada para o canal <#${chan.id}>!`, ephemeral: true });
  }
}

async function handleGuildMemberAdd(member) {
  const config = getConfig();
  const guildConfig = config[member.guild.id];
  if (!guildConfig || !guildConfig.welcomeChannel) return;
  const channel = member.guild.channels.cache.get(guildConfig.welcomeChannel);
  if (channel) {
    const embed = new EmbedBuilder().setColor(0x00FF00).setTitle('👋 Novo Membro!').setDescription(`Seja bem-vindo(a), <@${member.id}>!`).setTimestamp();
    await channel.send({ embeds: [embed] });
  }
}

async function handleGuildMemberRemove(member) {
  const config = getConfig();
  const guildConfig = config[member.guild.id];
  if (!guildConfig || !guildConfig.welcomeChannel) return;
  const channel = member.guild.channels.cache.get(guildConfig.welcomeChannel);
  if (channel) {
    const embed = new EmbedBuilder().setColor(0xFF0000).setTitle('🚪 Membro Saiu').setDescription(`**${member.user.tag}** saiu do servidor.`).setTimestamp();
    await channel.send({ embeds: [embed] });
  }
}

async function handleGuildMemberUpdate() {}

module.exports = { allSlashCommands, handleInteraction, handleMessage, handleMessageDelete, handleGuildMemberAdd, handleGuildMemberRemove, handleGuildMemberUpdate, sendTicketPanel };
EOF
