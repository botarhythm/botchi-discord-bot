/**
 * Command Handler Module - コマンド処理を管理
 * 
 * このモジュールはDiscordのコマンド処理を担当します。
 * プレフィックスコマンド(!help など)の処理と登録を行います。
 */

const { EmbedBuilder } = require('discord.js');
const logger = require('../system/logger');
const config = require('../config/env');

// コマンドコレクション
const commands = new Map();

/**
 * コマンドを登録する
 * @param {string} name - コマンド名
 * @param {Object} options - コマンドオプション
 */
function registerCommand(name, options) {
  commands.set(name, {
    name,
    description: options.description || '説明なし',
    usage: options.usage || name,
    execute: options.execute,
    aliases: options.aliases || [],
    adminOnly: options.adminOnly || false,
    hidden: options.hidden || false
  });
  
  logger.debug(`コマンド '${name}' を登録しました`);
}

/**
 * プレフィックスからのコマンドを処理する
 * @param {Object} message - Discordメッセージオブジェクト
 * @param {string} prefix - コマンドプレフィックス
 * @returns {boolean} コマンドが実行されたかどうか
 */
function handleCommand(message, prefix) {
  // プレフィックスで始まるか確認
  if (!message.content.startsWith(prefix)) return false;

  // コマンドと引数を分解
  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();

  // コマンドまたはエイリアスを検索
  const command = commands.get(commandName) || 
                  [...commands.values()].find(cmd => cmd.aliases && cmd.aliases.includes(commandName));

  // コマンドが存在しない場合
  if (!command) return false;

  // 管理者専用コマンドの確認
  if (command.adminOnly && !isAdmin(message.author.id)) {
    message.reply('このコマンドは管理者のみ使用できます。');
    return true;
  }

  try {
    // コマンドを実行
    command.execute(message, args);
    return true;
  } catch (error) {
    logger.error(`コマンド実行エラー: ${error.message}`);
    message.reply('コマンドの実行中にエラーが発生しました。');
    return true;
  }
}

/**
 * ユーザーが管理者かどうかを確認
 * @param {string} userId - ユーザーID
 * @returns {boolean} 管理者かどうか
 */
function isAdmin(userId) {
  const adminIds = config.ADMIN_IDS ? config.ADMIN_IDS.split(',') : [];
  return adminIds.includes(userId);
}

/**
 * ヘルプコマンドを生成
 * @param {Object} message - Discordメッセージオブジェクト
 * @param {Array} args - コマンド引数
 */
function helpCommand(message, args) {
  const embed = new EmbedBuilder()
    .setColor('#0099ff')
    .setTitle('ボッチー コマンドヘルプ')
    .setDescription('利用可能なコマンド一覧:');

  // 非表示でないコマンドのみリスト化
  const visibleCommands = [...commands.values()].filter(cmd => !cmd.hidden);
  
  visibleCommands.forEach(command => {
    embed.addFields({ 
      name: `${config.PREFIX}${command.name}`, 
      value: `${command.description}\n使用法: ${config.PREFIX}${command.usage}`
    });
  });

  message.channel.send({ embeds: [embed] });
}

// 基本コマンドを登録
registerCommand('help', {
  description: 'コマンド一覧を表示します',
  usage: 'help',
  execute: helpCommand
});

registerCommand('ping', {
  description: 'Botの応答時間を確認します',
  usage: 'ping',
  execute: (message) => {
    message.reply(`Pong! (${Date.now() - message.createdTimestamp}ms)`);
  }
});

// モジュールをエクスポート
module.exports = {
  registerCommand,
  handleCommand,
  getCommands: () => commands
}; 