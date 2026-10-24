cat << 'EOF' > index.js
const { Client, GatewayIntentBits } = require('discord.js');
const { 
  allSlashCommands, 
  handleInteraction, 
  handleMessage, 
  handleMessageDelete, 
  handleGuildMemberAdd, 
  handleGuildMemberRemove 
} = require('./ticket.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

client.once('ready', async () => {
  console.log(`✅ Bot conectado como ${client.user.tag}!`);
  try {
    await client.application.commands.set(allSlashCommands);
    console.log('✅ Comandos Slash registrados globalmente!');
  } catch (error) {
    console.error('❌ Erro ao registrar comandos slash:', error);
  }
});

client.on('messageCreate', handleMessage);
client.on('messageDelete', handleMessageDelete);
client.on('interactionCreate', handleInteraction);
client.on('guildMemberAdd', handleGuildMemberAdd);
client.on('guildMemberRemove', handleGuildMemberRemove);

client.login('DISCORD_TOKEN');
EOF
