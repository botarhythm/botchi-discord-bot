/**
 * Google Search API クライアント
 * 
 * Google Custom Search APIを使用してウェブ検索を行うモジュール
 * 
 * @module core/search/google-search
 */

const axios = require('axios');
const logger = require('../../system/logger');
const config = require('../../config/env');

// デフォルト設定
const DEFAULT_CONFIG = {
  baseUrl: 'https://www.googleapis.com/customsearch/v1',
  count: 3, // デフォルトの検索結果数
  maxLength: 200, // 各検索結果の最大文字数
  timeout: 5000, // タイムアウト (5秒)
  isEnabled: process.env.SEARCH_ENABLED !== 'false', // 環境変数によるトグル制御
  commandPrefix: process.env.PREFIX || '!' // !search コマンドのプレフィックス
};

// シングルトンインスタンス
let instance = null;

/**
 * Google Search APIクライアントクラス
 */
class GoogleSearchClient {
  /**
   * コンストラクタ
   * @param {string} apiKey - Google API Key
   * @param {string} cseId - Google Custom Search Engine ID
   * @param {Object} options - オプション設定
   */
  constructor(apiKey, cseId, options = {}) {
    this.apiKey = apiKey;
    this.cseId = cseId;
    this.baseUrl = 'https://www.googleapis.com/customsearch/v1';
    this.timeout = options.timeout || 10000; // デフォルトタイムアウト: 10秒
    
    // APIキーとCSE IDの検証
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
      throw new Error('有効なGoogle APIキーが必要です');
    }
    
    if (!cseId || typeof cseId !== 'string' || cseId.trim() === '') {
      throw new Error('有効なGoogle Custom Search Engine IDが必要です');
    }
    
    logger.debug('GoogleSearchClientが初期化されました');
  }

  /**
   * シングルトンインスタンスを取得
   * @returns {GoogleSearchClient} クライアントインスタンス
   */
  static getInstance() {
    if (!instance) {
      const apiKey = process.env.GOOGLE_API_KEY || config.GOOGLE_API_KEY;
      const cseId = process.env.GOOGLE_CSE_ID || config.GOOGLE_CSE_ID;
      
      if (!apiKey) {
        throw new Error('Google APIキーが設定されていません (GOOGLE_API_KEY is missing)');
      }
      
      if (!cseId) {
        throw new Error('Google Custom Search Engine IDが設定されていません (GOOGLE_CSE_ID is missing)');
      }
      
      instance = new GoogleSearchClient(apiKey, cseId);
    }
    return instance;
  }
  
  /**
   * 検索を実行する
   * @param {string} query - 検索クエリ
   * @param {Object} options - 検索オプション
   * @returns {Promise<Object>} 検索結果 (successフラグとitemsを含む)
   */
  async search(query, options = {}) {
    if (!query || typeof query !== 'string' || query.trim() === '') {
      // エラーの場合も success: false を返すように統一
      return { success: false, error: '検索クエリが空です', items: [] }; 
    }
    
    // リクエストパラメータの設定
    const params = {
      q: query.trim(),
      key: this.apiKey,
      cx: this.cseId,
      num: options.count || 5,
      lr: options.language || 'lang_ja',
      gl: options.country || 'jp'
    };
    
    try {
      logger.debug(`検索リクエスト: "${query}" (オプション: ${JSON.stringify({...params, key: '***', cx: '***'})})`);
      
      // Google Search APIへのリクエスト
      const response = await axios({
        method: 'GET',
        url: this.baseUrl,
        params,
        timeout: this.timeout
      });
      
      // 結果をフォーマット
      const formattedData = this._formatResults(response.data, query);
      
      // 成功時には success: true と結果を含めて返す
      return {
        success: true,
        query: query,
        items: formattedData.items || [],
        totalResults: parseInt(formattedData.searchInformation?.totalResults || 0)
      };
      
    } catch (error) {
      logger.error(`検索API呼び出しエラー: ${error.message}`);
      
      const details = error.response 
        ? { status: error.response.status, data: error.response.data }
        : { code: error.code, message: error.message };
      
      // エラー時にも success: false を含めて返す
      return { 
        success: false, 
        error: `Google Search APIエラー: ${JSON.stringify(details)}`, 
        items: [] 
      };
    }
  }
  
  /**
   * API結果を整形する
   * @param {Object} data - APIからのレスポンスデータ
   * @param {string} originalQuery - 元の検索クエリ
   * @returns {Object} 整形された結果
   */
  _formatResults(data, originalQuery) {
    // 検索結果がない場合、または必要な構造がない場合
    if (!data || typeof data !== 'object') {
      logger.warn('APIからのレスポンスデータが無効です');
      return { items: [] }; // 空の構造を返す
    }

    // items プロパティが存在しない場合は空の配列で初期化
    if (!data.items || !Array.isArray(data.items)) {
      logger.warn('検索結果が見つかりませんでした');
      return { ...data, items: [] };
    }
    
    // 検索結果の整形
    const formattedItems = data.items.map((item, index) => {
      return {
        title: item.title || `結果 ${index + 1}`,
        link: item.link,
        snippet: item.snippet || '内容がありません',
        displayLink: item.displayLink || new URL(item.link).hostname
      };
    });
    
    // 整形した結果を返す
    return {
      ...data,
      items: formattedItems,
      originalQuery: originalQuery
    };
  }
  
  /**
   * 検索結果をテキスト形式にフォーマットする
   * @param {Object} searchResult - 検索結果オブジェクト
   * @returns {string} テキストフォーマットの検索結果
   */
  formatSearchResultText(searchResult) {
    if (!searchResult || !searchResult.success) {
      return `検索エラー: ${searchResult?.error || '不明なエラー'}`;
    }

    const items = searchResult.items || [];
    if (items.length === 0) {
      return `「${searchResult.query}」の検索結果はありませんでした。`;
    }

    // 検索結果のテキスト形式
    let resultText = `🔍 「${searchResult.query}」の検索結果:\n\n`;

    // 各検索結果のフォーマット
    items.forEach((item, index) => {
      resultText += `**${index + 1}. ${item.title}**\n`;
      resultText += `${item.snippet}\n`;
      resultText += `🔗 ${item.link}\n\n`;
    });

    // 検索件数の表示
    resultText += `検索結果: 全${searchResult.totalResults || items.length}件中${items.length}件を表示`;

    return resultText;
  }
  
  /**
   * クライアントが準備完了かどうかを確認
   * @returns {boolean} 準備完了状態
   */
  isReady() {
    return Boolean(this.apiKey && this.cseId);
  }
}

module.exports = GoogleSearchClient; 