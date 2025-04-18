/**
 * Bocchy Discord Bot - コマンドハンドラー
 * Discordのコマンドを処理するモジュール
 */

const { EmbedBuilder } = require('discord.js');
const logger = require('../system/logger');
const config = require('../config/env');
const messageHistory = require('../extensions/message-history');
const { formatDateTime } = require('../utilities/date-utils');

// AIサービスを取得
let aiService;
if (config.DM_MESSAGE_HANDLER === 'new') {
  // 新プロバイダーシステム
  aiService = require('../extensions/providers');
} else {
  // レガシーシステム
  aiService = config.AI_PROVIDER === 'openai' 
    ? require('../openai-service') 
    : require('../gemini-service');
}

/**
 * コマンドを実行する
 * @param {string} command - コマンド名
 * @param {Array} args - コマンド引数
 * @param {Object} message - Discordメッセージオブジェクト
 * @param {Object} client - Discordクライアントオブジェクト
 * @returns {boolean} コマンドが処理されたかどうか
 */
async function executeCommand(command, args, message, client) {
  try {
    // 利用可能なコマンドのマップ
    const commands = {
      'ping': handlePing,
      'help': handleHelp,
      'about': handleAbout,
      'status': handleStatus,
      'reset': handleReset,
      'intervention': handleIntervention,
      'now': handleDateTime,
      'time': handleDateTime,
      'date': handleDateTime,
      'datetime': handleDateTime,
      'search': handleSearch
    };
    
    // コマンドが存在するか確認
    if (commands[command]) {
      await commands[command](args, message, client);
      return true;
    }
    
    return false;
  } catch (error) {
    logger.error(`Error executing command "${command}":`, error);
    
    try {
      await message.reply('コマンドの実行中にエラーが発生しました。');
    } catch (replyError) {
      logger.error('Error sending command error message:', replyError);
    }
    
    return true;
  }
}

/**
 * Pingコマンドを処理
 * @param {Array} args - コマンド引数
 * @param {Object} message - Discordメッセージオブジェクト
 */
async function handlePing(args, message) {
  const timeTaken = Date.now() - message.createdTimestamp;
  await message.reply(`Pong! このメッセージへの応答時間: ${timeTaken}ms`);
}

/**
 * Helpコマンドを処理
 * @param {Array} args - コマンド引数
 * @param {Object} message - Discordメッセージオブジェクト
 */
async function handleHelp(args, message) {
  const prefix = process.env.PREFIX || '!';
  
  const embed = new EmbedBuilder()
    .setTitle('Bocchy Discord Bot - ヘルプ')
    .setDescription(`以下のコマンドが利用可能です: (プレフィックス: ${prefix})`)
    .setColor(0x00FFFF)
    .addFields(
      { name: `${prefix}help`, value: 'このヘルプメッセージを表示します' },
      { name: `${prefix}ping`, value: 'ボットの応答時間を確認します' },
      { name: `${prefix}about`, value: 'ボットについての情報を表示します' },
      { name: `${prefix}status`, value: 'ボットのステータスと設定情報を表示します' },
      { name: `${prefix}reset`, value: '会話履歴をリセットします (DMでのみ有効)' },
      { name: `${prefix}intervention [mode]`, value: '文脈介入モードを設定します (none/passive/balanced/active/aggressive)' },
      { name: `${prefix}now`, value: '現在の日本時間を表示します (time/dateコマンドも同様)' },
      { name: `${prefix}search [キーワード]`, value: 'ウェブ検索を行い結果を要約して表示します' }
    )
    .setFooter({ text: `Bocchy v${config.BOT_VERSION}` });
  
  await message.reply({ embeds: [embed] });
}

/**
 * Aboutコマンドを処理
 * @param {Array} args - コマンド引数
 * @param {Object} message - Discordメッセージオブジェクト
 */
async function handleAbout(args, message) {
  const embed = new EmbedBuilder()
    .setTitle('Bocchy Discord Bot')
    .setDescription('文脈理解と自然な介入ができるDiscord AIボット')
    .setColor(0x00FFFF)
    .addFields(
      { name: 'バージョン', value: config.BOT_VERSION },
      { name: '使用しているAIモデル', value: config.AI_PROVIDER === 'openai' ? 'OpenAI API' : 'Google Gemini API' },
      { name: '特徴', value: '・自然な会話\n・チャンネル内の会話文脈の理解\n・適切なタイミングでの会話への参加\n・Supabaseによる会話履歴の保存\n・複数のAIプロバイダー対応' },
      { name: '開発者', value: 'Botarhythm' }
    )
    .setFooter({ text: 'Discord.js + OpenAI/Gemini API' });
  
  await message.reply({ embeds: [embed] });
}

/**
 * Statusコマンドを処理
 * @param {Array} args - コマンド引数
 * @param {Object} message - Discordメッセージオブジェクト
 * @param {Object} client - Discordクライアントオブジェクト
 */
async function handleStatus(args, message, client) {
  // AIプロバイダーのステータスを取得
  let aiStatus = 'Unknown';
  let messageHistoryStatus = 'Not available';
  
  try {
    // AIサービスの健全性チェック
    const healthStatus = await aiService.checkHealth();
    aiStatus = healthStatus.status === 'healthy' ? '正常' : '接続エラー';
    
    // メッセージ履歴システムの状態を取得
    if (messageHistory.getConfig) {
      const historyConfig = messageHistory.getConfig();
      messageHistoryStatus = `アクティブ (${historyConfig.activeChannels}チャンネル, ${historyConfig.totalMessagesStored}メッセージ)`;
    }
  } catch (error) {
    logger.error('Error getting status:', error);
    aiStatus = 'エラー発生';
  }
  
  // クライアント稼働時間を計算
  const uptime = client.uptime;
  const days = Math.floor(uptime / 86400000);
  const hours = Math.floor(uptime / 3600000) % 24;
  const minutes = Math.floor(uptime / 60000) % 60;
  const seconds = Math.floor(uptime / 1000) % 60;
  
  const uptimeStr = `${days}日 ${hours}時間 ${minutes}分 ${seconds}秒`;
  
  const embed = new EmbedBuilder()
    .setTitle('Bocchy Bot - ステータス')
    .setColor(0x00FFFF)
    .addFields(
      { name: 'バージョン', value: config.BOT_VERSION, inline: true },
      { name: '稼働時間', value: uptimeStr, inline: true },
      { name: 'Ping', value: `${client.ws.ping}ms`, inline: true },
      { name: 'AIプロバイダー', value: config.AI_PROVIDER, inline: true },
      { name: 'AIステータス', value: aiStatus, inline: true },
      { name: 'プロバイダーモード', value: config.DM_MESSAGE_HANDLER, inline: true },
      { name: '文脈介入モード', value: config.INTERVENTION_MODE, inline: true },
      { name: '介入クールダウン', value: `${config.INTERVENTION_COOLDOWN}秒`, inline: true },
      { name: 'メッセージ履歴', value: messageHistoryStatus, inline: true }
    )
    .setFooter({ text: `サーバー時間: ${new Date().toLocaleString()}` });
  
  await message.reply({ embeds: [embed] });
}

/**
 * Resetコマンドを処理（会話履歴をリセット）
 * @param {Array} args - コマンド引数
 * @param {Object} message - Discordメッセージオブジェクト
 */
async function handleReset(args, message) {
  try {
    // チャンネルタイプの判定を統一
    const channelType = typeof message.channel.type === 'number' ? message.channel.type : 
                       (message.channel.type === 'DM' ? 1 : 0);
    const isDM = channelType === 1 || message.channel.type === 'DM';
    
    // DMチャンネルでのみ有効
    if (!isDM) { // 非DM
      await message.reply('このコマンドはDMでのみ使用できます。');
      return;
    }
    
    // プロバイダーシステムに応じて処理を分岐
    if (config.DM_MESSAGE_HANDLER === 'new') {
      // 新しいプロバイダーシステムを使用
      const provider = aiService.getProvider();
      
      if (!provider) {
        await message.reply('AIプロバイダーが見つかりません。');
        return;
      }
      
      if (typeof provider.clearConversationHistory === 'function') {
        await provider.clearConversationHistory(message.author.id);
        await message.reply('会話履歴がリセットされました。');
      } else {
        await message.reply('このAIプロバイダーは会話履歴のリセットをサポートしていません。');
      }
    } else {
      // 従来のシステムを使用
      if (typeof aiService.clearConversationHistory === 'function') {
        await aiService.clearConversationHistory(message.author.id);
        await message.reply('会話履歴がリセットされました。');
      } else {
        await message.reply('このAIプロバイダーは会話履歴のリセットをサポートしていません。');
      }
    }
  } catch (error) {
    logger.error('Error resetting conversation history:', error);
    await message.reply('会話履歴のリセット中にエラーが発生しました。');
  }
}

/**
 * Interventionコマンドを処理（文脈介入モードを設定）
 * @param {Array} args - コマンド引数
 * @param {Object} message - Discordメッセージオブジェクト
 */
async function handleIntervention(args, message) {
  // 管理者権限チェック
  if (!message.member.permissions.has('ADMINISTRATOR')) {
    await message.reply('このコマンドは管理者権限が必要です。');
    return;
  }
  
  const validModes = ['none', 'passive', 'balanced', 'active', 'aggressive'];
  
  // 引数がない場合は現在のモードを表示
  if (!args.length) {
    const embed = new EmbedBuilder()
      .setTitle('文脈介入設定')
      .setColor(0x00FFFF)
      .addFields(
        { name: '現在のモード', value: config.INTERVENTION_MODE, inline: true },
        { name: 'クールダウン', value: `${config.INTERVENTION_COOLDOWN}秒`, inline: true },
        { name: '設定可能なモード', value: validModes.join(', ') },
        { name: '使用方法', value: `!intervention <mode> - モードを変更します\n!intervention cooldown <seconds> - クールダウンを設定します` }
      );
    
    await message.reply({ embeds: [embed] });
    return;
  }
  
  // クールダウン設定
  if (args[0].toLowerCase() === 'cooldown') {
    const seconds = parseInt(args[1], 10);
    
    if (isNaN(seconds) || seconds < 0) {
      await message.reply('有効な秒数を指定してください (0以上の整数)');
      return;
    }
    
    // 環境変数を更新（実行時のみ有効）
    process.env.INTERVENTION_COOLDOWN = seconds.toString();
    
    await message.reply(`文脈介入のクールダウンを ${seconds}秒 に設定しました。`);
    return;
  }
  
  // モード設定
  const newMode = args[0].toLowerCase();
  
  if (!validModes.includes(newMode)) {
    await message.reply(`無効なモードです。有効なモード: ${validModes.join(', ')}`);
    return;
  }
  
  // 環境変数を更新（実行時のみ有効）
  process.env.INTERVENTION_MODE = newMode;
  
  await message.reply(`文脈介入モードを「${newMode}」に設定しました。`);
}

/**
 * 現在の日時を表示するコマンドを処理
 * @param {Array} args - コマンド引数
 * @param {Object} message - Discordメッセージオブジェクト
 */
async function handleDateTime(args, message) {
  try {
    // 実行環境のデバッグ情報を出力（チャンネルタイプが数値か確認）
    const channelType = typeof message.channel.type === 'number' ? message.channel.type : 
                        (message.channel.type === 'DM' ? 1 : 0);
    const isDM = channelType === 1 || message.channel.type === 'DM';
    logger.debug(`日時表示: チャンネルタイプ=${channelType}, DMか=${isDM}`);
    
    const now = new Date();
    // 日本時間に変換（日本はUTC+9）
    const japanTime = new Date(now.getTime() + (9 * 60 * 60 * 1000));
    const dateTimeStr = formatDateTime(japanTime);
    
    // すべてのチャンネルタイプで同じリッチ埋め込みメッセージを使用
    const embed = new EmbedBuilder()
      .setTitle('🕒 現在の日本時間')
      .setColor(0x00FFFF)
      .setDescription(`${dateTimeStr}`)
      .setFooter({ text: 'JST (日本標準時)' });
    
    if (isDM) {
      await message.channel.send({ embeds: [embed] });
      logger.debug('DMに日時を埋め込みメッセージとして送信しました');
    } else {
      await message.reply({ embeds: [embed] });
      logger.debug('通常チャンネルに日時を埋め込みメッセージとして返信しました');
    }
  } catch (error) {
    logger.error('日時表示エラー:', error);
    try {
      // エラーメッセージをより簡素に
      await message.channel.send('日時情報の表示中にエラーが発生しました。');
    } catch (replyError) {
      logger.error('エラーメッセージの送信にも失敗:', replyError);
    }
  }
}

/**
 * ウェブ検索コマンドを処理
 * @param {Array} args - コマンド引数
 * @param {Object} message - Discordメッセージオブジェクト
 */
async function handleSearch(args, message) {
  try {
    // チャンネルタイプの判定を統一
    const channelType = typeof message.channel.type === 'number' ? message.channel.type : 
                        (message.channel.type === 'DM' ? 1 : 0);
    const isDM = channelType === 1 || message.channel.type === 'DM';
    logger.debug(`検索: チャンネルタイプ=${channelType}, DMか=${isDM}`);
    
    if (!args.length) {
      // DMチャンネルとサーバーチャンネルで異なる処理を行う
      if (isDM) { // DMチャンネル
        await message.channel.send('検索キーワードを入力してください。例: `!search 深層学習とは`');
      } else {
        await message.reply('検索キーワードを入力してください。例: `!search 深層学習とは`');
      }
      return;
    }
    
    const query = args.join(' ');
    
    try {
      await message.channel.sendTyping();
    } catch (typingError) {
      logger.debug('タイピング状態の設定に失敗しました:', typingError);
      // 続行 - タイピング表示は重要ではない
    }
    
    // 検索クエリと実行中の通知（DMかどうかで処理を変える）
    try {
      if (isDM) {
        await message.channel.send(`🔍 「${query}」を検索しています...`);
      } else {
        await message.reply(`🔍 「${query}」を検索しています...`);
      }
    } catch (notifyError) {
      logger.error('検索開始通知送信エラー:', notifyError);
      // 続行 - 開始通知は重要ではない
    }
    
    try {
      // 検索サービスのモジュール読み込みを明示的なエラーハンドリングで実施
      const searchService = require('../extensions/search-service');
      
      // APIキー情報をデバッグ出力
      logger.debug(`GOOGLE_API_KEY: ${process.env.GOOGLE_API_KEY ? 'defined' : 'undefined'}`);
      logger.debug(`GOOGLE_CSE_ID: ${process.env.GOOGLE_CSE_ID ? 'defined' : 'undefined'}`);
      
      // 検索実行
      const searchResults = await searchService.performSearch(query);
      logger.debug(`検索結果: ${JSON.stringify(searchResults).substring(0, 100)}...`);
      
      // 検索結果を整形して返信（DMかどうかで処理を変える）
      if (searchResults && searchResults.summary) {
        if (isDM) { // DMチャンネル
          // DMでは単純なテキストメッセージとして送信
          let resultText = `🔍 **「${query}」の検索結果**\n\n${searchResults.summary}\n\n**情報源**:\n${searchResults.sources || '情報なし'}`;
          await message.channel.send(resultText);
          logger.debug('DMに検索結果をテキストメッセージとして送信しました');
        } else {
          // 通常のチャンネルではリッチ埋め込みメッセージを使用
          const embed = new EmbedBuilder()
            .setTitle(`🔍 「${query}」の検索結果`)
            .setColor(0x00FFFF)
            .setDescription(searchResults.summary)
            .addFields(
              { name: '情報源', value: searchResults.sources || '情報なし' }
            )
            .setFooter({ text: 'Google Custom Search APIを使用' });
          
          await message.reply({ embeds: [embed] });
          logger.debug('通常チャンネルに検索結果を埋め込みメッセージとして返信しました');
        }
      } else {
        // 結果が見つからない場合（DMかどうかで処理を変える）
        if (isDM) {
          await message.channel.send('検索結果が見つかりませんでした。別のキーワードで試してみてください。');
        } else {
          await message.reply('検索結果が見つかりませんでした。別のキーワードで試してみてください。');
        }
      }
    } catch (searchError) {
      logger.error('検索モジュールエラー:', searchError);
      try {
        // エラーメッセージをDMかどうかで変える
        if (isDM) {
          await message.channel.send(`検索処理中に問題が発生しました: ${searchError.message}`);
        } else {
          await message.reply(`検索処理中に問題が発生しました: ${searchError.message}`);
        }
      } catch (replyError) {
        logger.error('エラーメッセージの送信に失敗:', replyError);
      }
    }
  } catch (error) {
    logger.error('検索処理エラー:', error);
    try {
      // エラーメッセージをより簡素に、DMかどうかで処理を変える
      if (message.channel && isDM) {
        await message.channel.send('検索処理中にエラーが発生しました。');
      } else if (message.channel) {
        await message.channel.send('検索処理中にエラーが発生しました。');
      }
    } catch (finalError) {
      logger.error('最終エラーメッセージの送信にも失敗:', finalError);
    }
  }
}

module.exports = {
  executeCommand
};