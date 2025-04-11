const { Client, GatewayIntentBits, Events, ChannelType, Partials } = require('discord.js');
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

// バージョン情報の出力
console.log(`Discord.js Version: ${require('discord.js').version}`);

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
  partials: [
    Partials.Channel,  // DMチャンネルのパーシャルを有効化（必須）
    Partials.Message,  // DMメッセージのパーシャルを有効化（必須）
    Partials.User      // DMユーザーのパーシャルを有効化（必須）
  ]
});

// プレフィックスの設定
const prefix = process.env.PREFIX || '!';

// Ready event
client.once(Events.ClientReady, (readyClient) => {
  console.log(`Ready! Logged in as ${readyClient.user.tag}`);
  console.log(`Discord.js Version: ${require('discord.js').version}`);
  console.log(`Bot User ID: ${readyClient.user.id}`);
  console.log(`Bot Username: ${readyClient.user.username}`);
  console.log(`Bot Discriminator: ${readyClient.user.discriminator}`);
  console.log(`Bot Tag: ${readyClient.user.tag}`);
  console.log(`Configured intents: ${JSON.stringify(client.options.intents)}`);
  console.log(`Partials enabled: ${JSON.stringify(client.options.partials)}`);
  
  // インテント詳細表示
  console.log('Direct Messages intent enabled:', 
    (client.options.intents & GatewayIntentBits.DirectMessages) === GatewayIntentBits.DirectMessages);
  console.log('Message Content intent enabled:', 
    (client.options.intents & GatewayIntentBits.MessageContent) === GatewayIntentBits.MessageContent);
  
  // GeminiサービスのAPIキー設定を確認
  if (geminiService.isConfigured()) {
    console.log('Gemini AI service is properly configured');
  } else {
    console.warn('WARNING: Gemini AI service is not configured. Bot will use fallback responses.');
  }
});

// Raw event logging for debugging
client.on('raw', packet => {
  if (DEBUG) {
    // DMに関連するイベント
    if (
      packet.t === 'MESSAGE_CREATE' || 
      packet.t === 'CHANNEL_CREATE' || 
      packet.t === 'DIRECT_MESSAGE_CREATE'
    ) {
      console.log(`RAW EVENT DETECTED: ${packet.t}`);
      
      // DMイベントがペイロードに含まれているか確認
      if (packet.d && packet.d.channel_type === 1) {
        console.log('DM MESSAGE DETECTED in RAW packet!');
        console.log('DM Data:', JSON.stringify(packet.d, null, 2).substring(0, 500));
      }
    }
  }
});

// Message event
client.on(Events.MessageCreate, async (message) => {
  try {
    // DMイベントの詳細なログ記録
    console.log(`Message received - Content: "${message.content}"`);
    console.log(`From User: ${message.author.tag} (ID: ${message.author.id})`);
    console.log(`Channel Type: ${message.channel.type}`);
    console.log(`Is Channel DM: ${message.channel.type === ChannelType.DM}`);
    console.log(`Channel ID: ${message.channel.id}`);
    
    // Ignore messages from the bot itself
    if (message.author.bot) {
      console.log('Ignoring message from bot');
      return;
    }

    // Determine if this is a DM
    const isDM = message.channel.type === ChannelType.DM;
    
    if (isDM) {
      console.log(`DM MESSAGE DETECTED! From: ${message.author.tag}, Content: ${message.content}`);
    }

    // コマンド処理
    if (message.content.startsWith(prefix)) {
      const args = message.content.slice(prefix.length).trim().split(/ +/);
      const command = args.shift().toLowerCase();
      console.log(`Command detected: ${command}`);

      // !ping command
      if (command === 'ping') {
        console.log('Executing ping command');
        await message.reply('Pong!');
        return;
      }

      // !hello command
      if (command === 'hello') {
        console.log('Executing hello command');
        await message.reply(`Hello, ${message.author.username}!`);
        return;
      }
      
      // !clear command - 会話履歴をクリア
      if (command === 'clear') {
        console.log('Executing clear command');
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
        console.log('Executing debug command');
        try {
          const debugInfo = {
            isDM: isDM,
            channelType: message.channel.type,
            channelTypeIsDM: message.channel.type === ChannelType.DM,
            intents: {
              DirectMessages: (client.options.intents & GatewayIntentBits.DirectMessages) === GatewayIntentBits.DirectMessages,
              MessageContent: (client.options.intents & GatewayIntentBits.MessageContent) === GatewayIntentBits.MessageContent,
              GuildMessages: (client.options.intents & GatewayIntentBits.GuildMessages) === GatewayIntentBits.GuildMessages
            },
            channel: {
              id: message.channel.id,
              type: message.channel.type,
              name: message.channel.name || 'DM',
              isDMChannel: message.channel.isDMBased?.() || false,
              isTextChannel: message.channel.isTextBased?.() || false
            },
            author: {
              id: message.author.id,
              username: message.author.username,
              tag: message.author.tag
            },
            discordJS: {
              version: require('discord.js').version
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

    // DMとメンションの処理
    if (isDM || message.mentions.has(client.user)) {
      console.log(`Processing ${isDM ? 'DM' : 'mention'} message: ${message.content}`);
      
      try {
        // 入力中...のステータスを表示
        await message.channel.sendTyping();
        console.log('Typing indicator sent');
        
        // メンションの場合はメンション部分を取り除く
        let cleanContent = message.content;
        if (!isDM && message.mentions.has(client.user)) {
          cleanContent = cleanContent.replace(/<@!?[\d]+>/g, '').trim();
        }
        
        if (cleanContent === '') {
          cleanContent = 'こんにちは';
        }
        
        console.log(`Sending to AI service: ${cleanContent}`);
        
        // Gemini AIからの応答を取得
        const response = await geminiService.getAIResponse(
          message.author.id,
          cleanContent,
          message.author.username,
          isDM
        );
        
        console.log(`AI response received (${response.length} chars): ${response.substring(0, 100)}${response.length > 100 ? '...' : ''}`);
        
        // 応答が長い場合は分割して送信
        if (response.length > 2000) {
          const chunks = response.match(/.{1,2000}/gs);
          for (const chunk of chunks) {
            await message.reply(chunk);
            console.log(`Sent response chunk (${chunk.length} chars)`);
          }
        } else {
          await message.reply(response);
          console.log(`Sent response (${response.length} chars)`);
        }
      } catch (error) {
        console.error('AI応答処理中にエラーが発生しました:', error);
        await message.reply('申し訳ありません、応答の生成中にエラーが発生しました。もう一度お試しください。');
      }
    }
  } catch (error) {
    console.error('MessageCreateイベント処理中にエラーが発生しました:', error);
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
client.login(process.env.DISCORD_TOKEN)
  .then(() => {
    console.log('Bot login successful');
  })
  .catch(err => {
    console.error('Bot login failed:', err);
  });
