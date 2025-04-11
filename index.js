const { Client, GatewayIntentBits, Events, ChannelType } = require('discord.js');
const http = require('http');
const dotenv = require('dotenv');
const geminiService = require('./gemini-service');

// 環境変数の読み込み
dotenv.config();

// Debug mode
const DEBUG = process.env.DEBUG === 'true';

// ボットトークンをログに出力（セキュリティのため一部を隠す）
if (DEBUG) {
  const token = process.env.DISCORD_TOKEN;
  console.log(`Debug: Provided token: ${token.substring(0, 20)}.${'*'.repeat(20)}`);
  console.log(`Debug: Preparing to connect to the gateway...`);
}

// Create an HTTP server to keep the bot alive
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Discord Bot is running!');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Discord client setup with all required intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,          // DMを受信するために必要
    GatewayIntentBits.DirectMessageReactions   // DMでのリアクションに必要
  ],
});

// プレフィックスの設定
const prefix = process.env.PREFIX || '!';

// Ready event
client.once(Events.ClientReady, (readyClient) => {
  console.log(`Ready! Logged in as ${readyClient.user.tag}`);
  console.log(`Configured intents: ${JSON.stringify(client.options.intents)}`);
  
  // GeminiサービスのAPIキー設定を確認
  if (geminiService.isConfigured()) {
    console.log('Gemini AI service is properly configured');
  } else {
    console.warn('WARNING: Gemini AI service is not configured. Bot will use fallback responses.');
  }
  
  // 全インテントの詳細表示
  console.log('Direct Messages intent enabled:', 
    (client.options.intents & GatewayIntentBits.DirectMessages) === GatewayIntentBits.DirectMessages);
  console.log('Message Content intent enabled:', 
    (client.options.intents & GatewayIntentBits.MessageContent) === GatewayIntentBits.MessageContent);
});

// Raw event logging for debugging
client.on('raw', packet => {
  if (DEBUG) {
    // DM関連のイベントのみをログに記録
    if (packet.t === 'DIRECT_MESSAGE_CREATE' || 
        packet.t === 'CHANNEL_CREATE' && packet.d && packet.d.type === 1) {
      console.log(`DEBUG RAW DM EVENT:`, packet.t);
      console.log(`DM Event details: Type=${packet.t}, Channel Type=${packet.d?.type}`);
    }
  }
});

// Message event
client.on(Events.MessageCreate, async (message) => {
  // Ignore messages from the bot itself
  if (message.author.bot) return;

  // Determine if this is a DM
  const isDM = message.channel.type === ChannelType.DM;
  
  // 詳細ログ (全メッセージ)
  console.log(`Message received: ${message.content}`);
  console.log(`From: ${message.author.tag} (ID: ${message.author.id})`);
  console.log(`Channel: ${message.channel.name || 'DM'} (ID: ${message.channel.id})`);
  console.log(`Channel Type: ${message.channel.type}`);
  console.log(`Is DM: ${isDM}`);

  // コマンド処理
  if (message.content.startsWith(prefix)) {
    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // !ping command
    if (command === 'ping') {
      await message.reply('Pong!');
      return;
    }

    // !hello command
    if (command === 'hello') {
      await message.reply(`Hello, ${message.author.username}!`);
      return;
    }
    
    // !clear command - 会話履歴をクリア
    if (command === 'clear') {
      const cleared = geminiService.clearConversationHistory(message.author.id);
      if (cleared) {
        await message.reply('会話履歴をクリアしました。');
      } else {
        await message.reply('会話履歴はありません。');
      }
      return;
    }
    
    // !debug command - デバッグ情報表示
    if (command === 'debug') {
      try {
        const debugInfo = {
          isDM: isDM,
          channelType: message.channel.type,
          intents: {
            DirectMessages: (client.options.intents & GatewayIntentBits.DirectMessages) === GatewayIntentBits.DirectMessages,
            MessageContent: (client.options.intents & GatewayIntentBits.MessageContent) === GatewayIntentBits.MessageContent,
            GuildMessages: (client.options.intents & GatewayIntentBits.GuildMessages) === GatewayIntentBits.GuildMessages
          },
          channel: {
            id: message.channel.id,
            type: message.channel.type,
            name: message.channel.name || 'DM'
          },
          author: {
            id: message.author.id,
            username: message.author.username,
            tag: message.author.tag
          }
        };
        
        await message.reply(`デバッグ情報:\n\`\`\`json\n${JSON.stringify(debugInfo, null, 2)}\n\`\`\``);
      } catch (error) {
        console.error('デバッグコマンドエラー:', error);
        await message.reply('デバッグ情報の取得中にエラーが発生しました。');
      }
      return;
    }
  }

  try {
    // When bot is mentioned or in DM, use Gemini to respond
    if (message.mentions.has(client.user) || isDM) {
      console.log(`${isDM ? 'DM' : 'メンション'} からの呼びかけを検出: ${message.content}`);
      
      // 入力中...のステータスを表示
      await message.channel.sendTyping();
      
      // メンションの場合はメンション部分を取り除く
      let cleanContent = message.content;
      if (!isDM && message.mentions.has(client.user)) {
        cleanContent = cleanContent.replace(/<@!?[\d]+>/g, '').trim();
      }
      
      if (cleanContent === '') {
        cleanContent = 'こんにちは';
      }
      
      // Gemini AIからの応答を取得
      const response = await geminiService.getAIResponse(
        message.author.id,
        cleanContent,
        message.author.username,
        isDM
      );
      
      // 応答が長い場合は分割して送信
      if (response.length > 2000) {
        const chunks = response.match(/.{1,2000}/gs);
        for (const chunk of chunks) {
          await message.reply(chunk);
        }
      } else {
        await message.reply(response);
      }
      
      console.log(`AI応答を送信しました: ${response.substring(0, 100)}${response.length > 100 ? '...' : ''}`);
    }
  } catch (error) {
    console.error('メッセージ応答中にエラーが発生しました:', error);
    await message.reply('申し訳ありません、応答の生成中にエラーが発生しました。もう一度お試しください。');
  }
});

// Debug event for connection issues
client.on(Events.Debug, (info) => {
  if (DEBUG) {
    console.log(`Debug: ${info}`);
  }
});

// Error handling
client.on('error', (error) => {
  console.error('Discord.js error:', error);
});

// Login to Discord with token
client.login(process.env.DISCORD_TOKEN);
