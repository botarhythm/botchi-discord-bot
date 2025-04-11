const { Client, GatewayIntentBits, Events } = require('discord.js');

// クライアント作成
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// 準備完了イベント
client.once(Events.ClientReady, (readyClient) => {
  console.log(`準備完了！ ${readyClient.user.tag}としてログインしました`);
});

// メッセージ受信イベント
client.on(Events.MessageCreate, async (message) => {
  // ボット自身のメッセージは無視
  if (message.author.bot) return;

  console.log(`メッセージ受信: ${message.content} (送信者: ${message.author.tag})`);

  // !ping コマンド
  if (message.content === '!ping') {
    await message.reply('Pong!');
    return;
  }

  // !hello コマンド
  if (message.content === '!hello') {
    await message.reply(`こんにちは、${message.author.username}さん！`);
    return;
  }

  // ボットがメンションされたとき
  if (message.mentions.has(client.user)) {
    await message.reply('何かお手伝いできることはありますか？');
    return;
  }
});

// エラーハンドリング
client.on('error', (error) => {
  console.error('Discord.jsエラー:', error);
});

// トークンを使用してDiscordにログイン
client.login(process.env.DISCORD_TOKEN);
