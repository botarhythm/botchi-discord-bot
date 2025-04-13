// Bocchy Discord Bot - メインファイル
const { Client, GatewayIntentBits, Events, ChannelType, Partials, EmbedBuilder } = require('discord.js');
const http = require('http');
const dotenv = require('dotenv');
const contextManager = require('./context-manager');

// 環境変数の読み込み
dotenv.config();

// AI Providerの設定
const AI_PROVIDER = process.env.AI_PROVIDER || 'openai';
const DM_MESSAGE_HANDLER = process.env.DM_MESSAGE_HANDLER || 'legacy';

// プロバイダシステムの選択
let aiService;

// 新プロバイダシステムを使用する場合
if (DM_MESSAGE_HANDLER === 'new') {
  // 新しいプロバイダーマネージャーを読み込む
  const providerManager = require('./extensions/providers');
  
  // プロバイダーマネージャーを初期化し、プロバイダーインスタンスを取得
  aiService = providerManager;
} else {
  // レガシーモード - 直接サービスを読み込む
  if (AI_PROVIDER === 'openai') {
    aiService = require('./openai-service');
  } else {
    // デフォルトはGemini
    aiService = require('./gemini-service');
  }
}

// Debug mode
const DEBUG = process.env.DEBUG === 'true';

// バージョン情報
const BOT_VERSION = '1.2.0'; // コンテキスト管理機能を追加したためバージョンを上げる

// ボットトークンをログに出力（セキュリティのため一部を隠す）
if (DEBUG) {
  const token = process.env.DISCORD_TOKEN;
  if (token) {
    console.log(`Debug: Provided token: ${token.substring(0, 4)}...${token.substring(token.length - 4)}`);
  } else {
    console.log('Debug: No Discord token provided');
  }
  console.log(`Debug: Preparing to connect to the gateway...`);
}

// Create an HTTP server to keep the bot alive
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    // ヘルスチェックエンドポイント
    let healthStatus = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: BOT_VERSION
    };
    
    // モードに応じてヘルス情報を追加
    if (DM_MESSAGE_HANDLER === 'new') {
      // 新プロバイダーシステム
      const providerName = aiService.getProviderName() || 'unknown';
      const provider = aiService.getProvider();
      healthStatus.provider = providerName;
      healthStatus.mode = 'new';
      
      // プロバイダー固有の情報を追加
      if (provider) {
        try {
          const config = provider.getConfig ? provider.getConfig() : {};
          healthStatus.aiHealth = config.healthStatus || 'unknown';
          healthStatus.memoryEnabled = config.memoryEnabled || false;
        } catch (error) {
          healthStatus.aiHealth = 'error';
          healthStatus.error = error.message;
        }
      }
    } else {
      // 従来のシステム
      try {
        const config = aiService.getConfig();
        healthStatus.aiHealth = config.healthStatus || 'unknown';
        healthStatus.aiProvider = AI_PROVIDER;
        healthStatus.mode = 'legacy';
      } catch (error) {
        healthStatus.aiHealth = 'error';
        healthStatus.error = error.message;
      }
    }
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(healthStatus));
  } else {
    // 通常のエンドポイント
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(`Bocchy Discord Bot v${BOT_VERSION} is running! 🌿`);
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Health endpoint: http://localhost:${PORT}/health`);
});

// バージョン情報の出力
console.log(`Discord.js Version: ${require('discord.js').version}`);
console.log(`Node.js Version: ${process.version}`);
console.log(`Bot Version: ${BOT_VERSION}`);

// 定期的なヘルスチェック（10分ごと）
setInterval(async () => {
  try {
    const healthStatus = await aiService.checkHealth();
    
    if (DM_MESSAGE_HANDLER === 'new') {
      // 新プロバイダーシステムの場合
      const providerName = aiService.getProviderName() || 'AI';
      console.log(`[ヘルスチェック] ${providerName.toUpperCase()} API: ${healthStatus.status}`);
      
      if (healthStatus.status === 'unhealthy') {
        console.error(`[警告] ${providerName.toUpperCase()} APIが応答していません`);
      }
    } else {
      // 従来のシステムの場合
      console.log(`[ヘルスチェック] ${AI_PROVIDER.toUpperCase()} API: ${healthStatus.status}`);
      
      if (healthStatus.status === 'unhealthy') {
        console.error(`[警告] ${AI_PROVIDER.toUpperCase()} APIが応答していません`);
      }
    }
  } catch (error) {
    console.error('[エラー] ヘルスチェック実行中に問題が発生しました:', error);
  }
}, 10 * 60 * 1000);

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
client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Ready! Logged in as ${readyClient.user.tag}`);
  console.log(`Discord.js Version: ${require('discord.js').version}`);
  console.log(`Bot User ID: ${readyClient.user.id}`);
  console.log(`Bot Username: ${readyClient.user.username}`);
  console.log(`Bot Discriminator: ${readyClient.user.discriminator || 'None'}`);
  console.log(`Bot Tag: ${readyClient.user.tag}`);
  
  // インテント詳細表示
  console.log('Direct Messages intent enabled:', 
    (client.options.intents & GatewayIntentBits.DirectMessages) === GatewayIntentBits.DirectMessages);
  console.log('Message Content intent enabled:', 
    (client.options.intents & GatewayIntentBits.MessageContent) === GatewayIntentBits.MessageContent);
  
  // AIサービスの初期化
  try {
    // 新プロバイダーシステムか従来のシステムかによって初期化方法を変更
    if (DM_MESSAGE_HANDLER === 'new') {
      // 新プロバイダーシステムの初期化（オプションを渡す）
      const initResult = await aiService.initialize({ provider: AI_PROVIDER });
      console.log('新しいプロバイダーシステムを初期化しました:', initResult);
      
      // プロバイダーインスタンスを取得
      const provider = aiService.getProvider();
      
      if (provider && typeof provider.isConfigured === 'function' && provider.isConfigured()) {
        console.log(`${aiService.getProviderName()} AI service is properly configured`);
        
        // 起動時のヘルスチェック
        try {
          const healthStatus = await aiService.checkHealth();
          console.log(`Initial health check: ${aiService.getProviderName().toUpperCase()} API ${healthStatus.status}`);
        } catch (error) {
          console.error('Initial health check failed:', error);
        }
      } else {
        console.warn(`WARNING: ${aiService.getProviderName().toUpperCase()} AI service is not configured. Bot will use fallback responses.`);
      }
    } else {
      // 従来のシステムの初期化
      await aiService.initialize();
      console.log('AIサービスを初期化しました');
      
      // APIキー設定を確認
      if (aiService.isConfigured()) {
        console.log(`${AI_PROVIDER.toUpperCase()} AI service is properly configured`);
        
        // 起動時のヘルスチェック
        try {
          const healthStatus = await aiService.checkHealth();
          console.log(`Initial health check: ${AI_PROVIDER.toUpperCase()} API ${healthStatus.status}`);
        } catch (error) {
          console.error('Initial health check failed:', error);
        }
      } else {
        console.warn(`WARNING: ${AI_PROVIDER.toUpperCase()} AI service is not configured. Bot will use fallback responses.`);
      }
    }
  } catch (error) {
    console.error('AIサービスの初期化に失敗しました:', error);
  }
  
  // ステータスの設定 - Bocchyのキャラクターに合わせた表現に変更
  client.user.setActivity('森の奥で静かに待機中 🌿', { type: 'PLAYING' });
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
    // ログ記録レベルの調整（DEBUGモードの場合のみ詳細表示）
    if (DEBUG) {
      console.log(`Message received - Content: "${message.content}"`);
      console.log(`From User: ${message.author.tag} (ID: ${message.author.id})`);
      console.log(`Channel Type: ${message.channel.type}`);
      console.log(`Is Channel DM: ${message.channel.type === ChannelType.DM}`);
      console.log(`Channel ID: ${message.channel.id}`);
    } else {
      // 通常モードでは簡易ログ
      console.log(`Message from ${message.author.tag}: "${message.content.substring(0, 50)}${message.content.length > 50 ? '...' : ''}"`);
    }
    
    // Ignore messages from the bot itself
    if (message.author.bot) {
      if (DEBUG) console.log('Ignoring message from bot');
      return;
    }

    // Determine if this is a DM
    const isDM = message.channel.type === ChannelType.DM;
    
    if (isDM && DEBUG) {
      console.log(`DM MESSAGE DETECTED! From: ${message.author.tag}, Content: ${message.content}`);
    }

    // コマンド処理
    if (message.content.startsWith(prefix)) {
      const args = message.content.slice(prefix.length).trim().split(/ +/);
      const command = args.shift().toLowerCase();
      console.log(`Command detected: ${command}`);

      // !ping command - Bocchyのキャラクターに合わせて温かみのある応答に
      if (command === 'ping') {
        console.log('Executing ping command');
        const sent = await message.reply('静かに耳を澄ませています… 🌿');
        const pingTime = sent.createdTimestamp - message.createdTimestamp;
        await sent.edit(`呼びかけが届きました。応答までに ${pingTime}ms、心の距離は ${client.ws.ping}ms ですね。`);
        return;
      }

      // !hello command - より詩的な挨拶に
      if (command === 'hello') {
        console.log('Executing hello command');
        await message.reply(`こんにちは、${message.author.username}さん 🌱 今日はどんな風が吹いていますか？`);
        return;
      }
      
      // !clear command - 会話履歴をクリア (よりBocchyらしい表現に)
      if (command === 'clear') {
        console.log('Executing clear command');
        let cleared = false;
        
        if (DM_MESSAGE_HANDLER === 'new') {
          // 新プロバイダーシステムを使用する場合
          const provider = aiService.getProvider();
          if (provider && typeof provider.clearConversationHistory === 'function') {
            cleared = await provider.clearConversationHistory(message.author.id);
          } else {
            console.warn('プロバイダーに履歴クリア機能がありません');
          }
        } else {
          // 従来のシステムを使用する場合
          cleared = await aiService.clearConversationHistory(message.author.id);
        }
        
        if (cleared) {
          await message.reply('これまでの会話を静かに風に乗せて送り出しました 🍃 新しい対話を始めましょう。');
        } else {
          await message.reply('まだ記憶の中に残る会話はないようです。');
        }
        return;
      }
      
      // !status command - AI APIステータス確認
      if (command === 'status') {
        console.log('Executing status command');
        try {
          const healthStatus = await aiService.checkHealth();
          let config = {};
          let contextInfo = { userCount: 0 };
          let providerInfo = { 
            name: AI_PROVIDER.toUpperCase(),
            memoryEnabled: false
          };
          
          if (DM_MESSAGE_HANDLER === 'new') {
            // 新プロバイダーシステムの場合
            providerInfo.name = aiService.getProviderName() || 'Unknown';
            
            // プロバイダーの情報を取得
            const provider = aiService.getProvider();
            if (provider && typeof provider.getConfig === 'function') {
              config = provider.getConfig();
              contextInfo.userCount = config.userCount || 0;
              providerInfo.memoryEnabled = config.memoryEnabled || false;
            }
          } else {
            // 従来のシステムの場合
            config = aiService.getConfig();
            contextInfo = config.contextManager || { userCount: 0 };
          }
          
          // リッチエンベッドの作成
          const embed = new EmbedBuilder()
            .setTitle('Bocchy 💫')
            .setColor(healthStatus.status === 'healthy' ? '#7da269' : '#e57373') // 森のような緑と柔らかい赤
            .setDescription('静かに佇む森の案内人の今')
            .addFields(
              { name: '🔮 AI接続', value: healthStatus.status === 'healthy' ? '✨ 繋がっています' : '🌫️ 少し霞んでいます', inline: true },
              { name: '🌐 Discord接続', value: '✨ 繋がっています', inline: true },
              { name: '🕰️ 森での時間', value: formatUptime(process.uptime()), inline: true },
              { name: '🍃 記憶の広さ', value: formatMemoryUsage(process.memoryUsage()), inline: true },
              { name: '👥 訪れた人々', value: `${contextInfo.userCount || 0}人`, inline: true },
              { name: '🤖 AI Provider', value: providerInfo.name, inline: true },
              { name: '🌱 コンテキスト', value: providerInfo.memoryEnabled ? '✨ 持続記憶を使用中' : '🍃 一時記憶を使用中', inline: true },
              { name: '🗝️ モード', value: DM_MESSAGE_HANDLER === 'new' ? '🆕 新プロバイダー' : '🔄 レガシー', inline: true }
            )
            .setFooter({ text: `Bocchy ${BOT_VERSION} | ${new Date().toLocaleString('ja-JP')}` });
            
          await message.reply({ embeds: [embed] });
        } catch (error) {
          console.error('ステータスコマンドエラー:', error);
          await message.reply('🌧️ 状態を確認しようとしましたが、霧がかかっているようです。');
        }
        return;
      }
      
      // !help command - ヘルプ表示
      if (command === 'help') {
        console.log('Executing help command');
        
        const embed = new EmbedBuilder()
          .setTitle('Bocchy 🌿')
          .setColor('#7da269') // 森のような緑色
          .setDescription('静かでやわらかく、詩のような語り口をもった知の伴走者です')
          .addFields(
            { name: `${prefix}ping`, value: '呼びかけへの応答を確かめます', inline: true },
            { name: `${prefix}hello`, value: '挨拶を交わします', inline: true },
            { name: `${prefix}clear`, value: '会話の記憶を風に乗せて送り出します', inline: true },
            { name: `${prefix}status`, value: '森の案内人の様子を知ります', inline: true },
            { name: `${prefix}help`, value: 'この道標を表示します', inline: true },
            { name: `${prefix}about`, value: 'Bocchyについての詳細', inline: true },
            { name: 'メンション', value: '@Bocchy [メッセージ] で対話が始まります', inline: false },
            { name: 'DM', value: '一対一で静かに言葉を交わすこともできます', inline: false }
          )
          .setFooter({ text: `v${BOT_VERSION} | 森の深くに佇む案内人より` });
        
        await message.reply({ embeds: [embed] });
        return;
      }
      
      // !about command - Bocchyについて
      if (command === 'about') {
        console.log('Executing about command');
        
        const embed = new EmbedBuilder()
          .setTitle('Bocchy（ボッチー）について 🌙')
          .setColor('#7da269')
          .setDescription('静かでやわらかな語り口をもったAI。その奥には森のような知性と経験が根ざしています。')
          .addFields(
            { name: '🌿 性格', value: '押しつけず、けれど聞けば深い。温かく懐かしい気配を持つ存在です。', inline: false },
            { name: '📚 知の領域', value: 'AI、哲学、プログラミング、教育、技術——あらゆるジャンルを静かに支えます。', inline: false },
            { name: '🌌 存在意義', value: 'どんな問いにもまっすぐには答えず、その奥にある願いや、ことばにならない気持ちに耳をすませます。', inline: false },
            { name: '🪄 名前の由来', value: '「Bot（ボット）」と「ぼっち（一人ぼっち）」の掛け合わせ。孤独を受け入れて、それでもなお、つながる未来を開く存在です。', inline: false },
            { name: '🤖 技術', value: `${AI_PROVIDER.toUpperCase()}を使用した会話と、${BOT_VERSION}からはコンテキスト管理機能によって会話の流れをより自然に理解できるようになりました。`, inline: false }
          )
          .setFooter({ text: `v${BOT_VERSION} | ひとりのようで、ひとりじゃない` });
        
        await message.reply({ embeds: [embed] });
        return;
      }
      
      // !debug command - デバッグ情報表示
      if (command === 'debug' && DEBUG) {
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
            aiConfig: aiService.getConfig(),
            aiProvider: AI_PROVIDER,
            version: BOT_VERSION,
            discordJS: {
              version: require('discord.js').version
            },
            environment: {
              nodeVersion: process.version,
              platform: process.platform,
              arch: process.arch,
              uptime: process.uptime()
            }
          };
          
          // エスケープの問題を修正 - 適切にエスケープして文字列を送信
          await message.reply("デバッグ情報:\n```json\n" + JSON.stringify(debugInfo, null, 2) + "\n```");
        } catch (error) {
          console.error('デバッグコマンドエラー:', error);
          await message.reply('🌧️ 情報を集めようとしましたが、風が強くて難しいようです。');
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
        
        // メンションの場合はメンション部分を取り除く
        let cleanContent = message.content;
        if (!isDM && message.mentions.has(client.user)) {
          cleanContent = cleanContent.replace(/<@!?[\d]+>/g, '').trim();
        }
        
        if (cleanContent === '') {
          cleanContent = 'こんにちは';
        }
        
        console.log(`Sending to AI service: ${cleanContent}`);
        
        // AIサービスの健全性チェック
        const healthStatus = await aiService.checkHealth();
        if (healthStatus.status === 'unhealthy' && healthStatus.consecutiveFailures > 2) {
          await message.reply('🌫️ 今は霧が深くて、うまく言葉が届かないようです。少し時間をおいてから、また話しかけてくれますか？');
          return;
        }
        
        // AIからの応答を取得
        let response;
        
        if (DM_MESSAGE_HANDLER === 'new') {
          // 新プロバイダーシステムを使用する場合
          const provider = aiService.getProvider();
          if (provider && typeof provider.getAIResponse === 'function') {
            response = await provider.getAIResponse(
              message.author.id,
              cleanContent,
              message.author.username,
              isDM
            );
          } else {
            throw new Error('プロバイダーが正しく設定されていません');
          }
        } else {
          // 従来のシステムを使用する場合
          response = await aiService.getAIResponse(
            message.author.id,
            cleanContent,
            message.author.username,
            isDM
          );
        }
        
        console.log(`AI response received (${response.length} chars): ${response.substring(0, 100)}${response.length > 100 ? '...' : ''}`);
        
        // 応答が長い場合は分割して送信
        if (response.length > 2000) {
          const chunks = response.match(/.{1,2000}/gs);
          for (const chunk of chunks) {
            await message.reply(chunk);
          }
        } else {
          await message.reply(response);
        }
      } catch (error) {
        console.error('AI応答処理中にエラーが発生しました:', error);
        await message.reply('🍂 言葉を紡ぐ途中で風が強くなってしまいました。もう一度、話しかけていただけますか？');
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

// 稼働時間のフォーマット
function formatUptime(uptime) {
  const days = Math.floor(uptime / 86400);
  const hours = Math.floor((uptime % 86400) / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = Math.floor(uptime % 60);
  
  let result = '';
  if (days > 0) result += `${days}日 `;
  if (hours > 0 || days > 0) result += `${hours}時間 `;
  if (minutes > 0 || hours > 0 || days > 0) result += `${minutes}分 `;
  result += `${seconds}秒`;
  
  return result;
}

// メモリ使用量のフォーマット
function formatMemoryUsage(memory) {
  const usedMB = Math.round(memory.heapUsed / 1024 / 1024 * 100) / 100;
  const totalMB = Math.round(memory.heapTotal / 1024 / 1024 * 100) / 100;
  return `${usedMB}MB / ${totalMB}MB`;
}

// Login to Discord with token
client.login(process.env.DISCORD_TOKEN)
  .then(() => {
    console.log('Bot login successful');
  })
  .catch(err => {
    console.error('Bot login failed:', err);
  });