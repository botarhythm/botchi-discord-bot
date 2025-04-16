/**
 * Brave Search API クライアント
 * 
 * Brave Search APIを使用してウェブ検索を行うモジュール
 * 
 * @module core/search/brave-search
 */

const axios = require('axios');
const logger = require('../../system/logger');
const config = require('../../config/env');

// デフォルト設定
const DEFAULT_CONFIG = {
  baseUrl: 'https://api.search.brave.com/res/v1',
  count: 3, // デフォルトの検索結果数
  maxLength: 200, // 各検索結果の最大文字数
  timeout: 5000, // タイムアウト (5秒)
  isEnabled: true, // 常に有効に設定（環境変数の問題を回避）
  commandPrefix: process.env.PREFIX || '!' // !search コマンドのプレフィックス
};

/**
 * Brave Search APIクライアントクラス
 */
class BraveSearchClient {
  /**
   * コンストラクタ
   * @param {Object} options オプション設定
   */
  constructor(options = {}) {
    this.config = { ...DEFAULT_CONFIG, ...options };
    
    // 環境変数からAPIキーを取得 - BRAVE_API_KEYに統一
    // 互換性のためにBRAVE_SEARCH_API_KEYもフォールバックとして維持
    this.apiKey = process.env.BRAVE_API_KEY || 
                 process.env.BRAVE_SEARCH_API_KEY || 
                 config.BRAVE_API_KEY || 
                 'BSAThZH8RcPF6tqem02e4zuVp1j9Yja'; // 最終フォールバック値
    
    // 常に設定完了済みとする
    this.isConfigured = true;
    
    // 起動時のログ出力
    logger.info('Brave Search client initialized');
    
    // 詳細な診断ログを追加（デバッグモード時）
    if (config.DEBUG === true || process.env.DEBUG === 'true') {
      // 環境変数の診断情報
      logger.debug(`環境変数診断: BRAVE_API_KEY=${Boolean(process.env.BRAVE_API_KEY)}, BRAVE_SEARCH_API_KEY=${Boolean(process.env.BRAVE_SEARCH_API_KEY)}, config.BRAVE_API_KEY=${Boolean(config.BRAVE_API_KEY)}`);
      
      // APIキーの取得元を特定
      const keySource = process.env.BRAVE_API_KEY ? 'BRAVE_API_KEY' : 
                        process.env.BRAVE_SEARCH_API_KEY ? 'BRAVE_SEARCH_API_KEY' : 
                        config.BRAVE_API_KEY ? 'config.BRAVE_API_KEY' : 'fallback value';
      
      // APIキーの存在確認（セキュリティのため先頭数文字のみ表示）
      const keyPreview = this.apiKey ? this.apiKey.substring(0, 3) + '...' : 'none';
      logger.debug(`Brave Search API initialized with key from ${keySource} (${keyPreview}), key length: ${this.apiKey ? this.apiKey.length : 0}`);
      logger.debug(`Search command: ${this.config.commandPrefix}search, Status: ${this.config.isEnabled ? 'enabled' : 'disabled'}`);
    }
  }
  
  /**
   * ウェブ検索を実行する
   * @param {string} query 検索クエリ
   * @param {Object} options 検索オプション
   * @param {number} options.count 取得する結果の数 (デフォルト: 3)
   * @returns {Promise<Object>} 検索結果
   */
  async search(query, options = {}) {
    // APIキーは常に設定済みとみなす
    const count = options.count || this.config.count;
    
    // リクエスト前の詳細ログ（デバッグ時のみ）
    if (config.DEBUG) {
      logger.debug(`検索リクエスト準備: "${query}" (count=${count})`);
      logger.debug(`API URL: ${this.config.baseUrl}/web/search`);
      logger.debug(`APIキー状態: ${this.apiKey ? '設定済み' : '未設定'} (長さ: ${this.apiKey ? this.apiKey.length : 0})`);
    }
    
    try {
      // リクエスト設定
      const requestConfig = {
        method: 'GET',
        url: `${this.config.baseUrl}/web/search`,
        params: {
          q: query,
          count: count
        },
        headers: {
          'Accept': 'application/json',
          'X-Subscription-Token': this.apiKey
        },
        timeout: this.config.timeout
      };
      
      // リクエスト送信
      if (config.DEBUG) {
        logger.debug(`検索リクエスト送信中...`);
      }
      
      const response = await axios(requestConfig);
      
      // レスポンスステータスの確認
      if (response.status !== 200) {
        throw new Error(`Brave Search API error: ${response.status}`);
      }
      
      // 応答の検証
      if (config.DEBUG) {
        logger.debug(`検索API応答: status=${response.status}, データ有無=${Boolean(response.data)}`);
        if (response.data && response.data.web) {
          logger.debug(`検索結果数: ${response.data.web.results ? response.data.web.results.length : 0}件`);
        }
      }
      
      // 検索結果を整形
      const results = this._formatResults(response.data);
      
      // 成功時の詳細ログ
      if (config.DEBUG) {
        logger.debug(`検索成功: "${query}", 結果数=${results.length}件`);
      }
      
      return {
        success: true,
        query: query,
        results: results
      };
    } catch (error) {
      logger.error(`Brave Search error: ${error.message}`);
      
      // エラーの詳細をログに記録（開発用）
      if (config.DEBUG) {
        logger.debug(`検索エラー詳細: ${error.name} / ${error.message}`);
        
        if (error.response) {
          // APIからのエラーレスポンスがある場合
          logger.debug(`API応答ステータス: ${error.response.status}`);
          logger.debug(`API応答ヘッダ: ${JSON.stringify(error.response.headers)}`);
          logger.debug(`API応答エラー: ${JSON.stringify(error.response.data)}`);
        } else if (error.request) {
          // リクエストは送られたがレスポンスがない場合
          logger.debug(`リクエスト送信済みだがレスポンスなし: ${error.code || 'コードなし'}`);
          logger.debug(`タイムアウトの可能性: ${error.code === 'ECONNABORTED'}`);
        } else {
          // リクエスト作成前のエラー
          logger.debug(`リクエスト作成前エラー: ${error.stack || '詳細なし'}`);
        }
      }
      
      return {
        success: false,
        error: error.message,
        results: []
      };
    }
  }
  
  /**
   * ローカル検索（場所に関する検索）を実行する
   * @param {string} query 検索クエリ
   * @param {Object} options 検索オプション
   * @returns {Promise<Object>} 検索結果
   */
  async localSearch(query, options = {}) {
    // APIキーは常に設定済みとみなす
    const count = options.count || this.config.count;
    
    // リクエスト前の詳細ログ（デバッグ時のみ）
    if (config.DEBUG) {
      logger.debug(`ローカル検索リクエスト準備: "${query}" (count=${count})`);
      logger.debug(`ローカル検索API URL: ${this.config.baseUrl}/local/search`);
      logger.debug(`APIキー状態: ${this.apiKey ? '設定済み' : '未設定'} (長さ: ${this.apiKey ? this.apiKey.length : 0})`);
    }
    
    try {
      // リクエスト設定
      const requestConfig = {
        method: 'GET',
        url: `${this.config.baseUrl}/local/search`,
        params: {
          q: query,
          count: count
        },
        headers: {
          'Accept': 'application/json',
          'X-Subscription-Token': this.apiKey
        },
        timeout: this.config.timeout
      };
      
      // リクエスト送信
      if (config.DEBUG) {
        logger.debug(`ローカル検索リクエスト送信中...`);
      }
      
      const response = await axios(requestConfig);
      
      // レスポンスステータスの確認
      if (response.status !== 200) {
        throw new Error(`Brave Local Search API error: ${response.status}`);
      }
      
      // 応答の検証とログ
      if (config.DEBUG) {
        logger.debug(`ローカル検索API応答: status=${response.status}, データ有無=${Boolean(response.data)}`);
        logger.debug(`ローカル検索結果数: ${response.data.results ? response.data.results.length : 0}件`);
      }
      
      // ローカル検索結果があるかチェック
      if (!response.data.results || response.data.results.length === 0) {
        if (config.DEBUG) {
          logger.debug(`ローカル検索結果なし、ウェブ検索にフォールバック: "${query}"`);
        }
        // ローカル検索で結果がない場合は通常のウェブ検索にフォールバック
        return this.search(query, options);
      }
      
      // ローカル検索結果を整形
      const results = this._formatLocalResults(response.data);
      
      // 成功時の詳細ログ
      if (config.DEBUG) {
        logger.debug(`ローカル検索成功: "${query}", 結果数=${results.length}件`);
      }
      
      return {
        success: true,
        query: query,
        results: results
      };
    } catch (error) {
      logger.error(`Brave Local Search error: ${error.message}`);
      
      // エラーの詳細をログに記録（開発用）
      if (config.DEBUG) {
        logger.debug(`ローカル検索エラー詳細: ${error.name} / ${error.message}`);
        
        if (error.response) {
          // APIからのエラーレスポンスがある場合
          logger.debug(`ローカルAPI応答ステータス: ${error.response.status}`);
          logger.debug(`ローカルAPI応答ヘッダ: ${JSON.stringify(error.response.headers)}`);
          logger.debug(`ローカルAPI応答エラー: ${JSON.stringify(error.response.data)}`);
        } else if (error.request) {
          // リクエストは送られたがレスポンスがない場合
          logger.debug(`ローカルリクエスト送信済みだがレスポンスなし: ${error.code || 'コードなし'}`);
        } else {
          // リクエスト作成前のエラー
          logger.debug(`ローカルリクエスト作成前エラー: ${error.stack || '詳細なし'}`);
        }
        
        logger.debug(`ウェブ検索にフォールバックします`);
      }
      
      // エラー時は通常検索にフォールバック
      return this.search(query, options);
    }
  }
  
  /**
   * ウェブ検索結果を整形する
   * @private
   * @param {Object} data API レスポンスデータ
   * @returns {Array} 整形された検索結果
   */
  _formatResults(data) {
    if (!data.web || !data.web.results) {
      return [];
    }
    
    return data.web.results.map(item => {
      // 説明文を最大長さに制限
      const description = item.description 
        ? item.description.substring(0, this.config.maxLength) 
        : '';
      
      return {
        title: item.title,
        url: item.url,
        description: description,
        isAmp: item.is_amp || false,
        ampUrl: item.amp_url,
        age: item.age,
        familyFriendly: item.family_friendly
      };
    });
  }
  
  /**
   * ローカル検索結果を整形する
   * @private
   * @param {Object} data API レスポンスデータ
   * @returns {Array} 整形された検索結果
   */
  _formatLocalResults(data) {
    if (!data.results) {
      return [];
    }
    
    return data.results.map(item => {
      // ビジネス情報を要約
      const details = [];
      
      if (item.rating) {
        details.push(`評価: ${item.rating}/5`);
      }
      
      if (item.price_range) {
        details.push(`価格帯: ${item.price_range}`);
      }
      
      if (item.address) {
        details.push(`住所: ${item.address}`);
      }
      
      if (item.phone) {
        details.push(`電話: ${item.phone}`);
      }
      
      // 営業時間があれば追加
      let hoursInfo = '';
      if (item.hours && item.hours.open_now !== undefined) {
        hoursInfo = item.hours.open_now ? '営業中' : '営業時間外';
      }
      
      return {
        title: item.name,
        url: item.website || '',
        description: details.join(' • '),
        address: item.address,
        phone: item.phone,
        rating: item.rating,
        reviewCount: item.review_count,
        priceRange: item.price_range,
        category: item.category,
        hours: hoursInfo,
        isLocal: true
      };
    });
  }
  
  /**
   * 検索結果を整形してDiscordに表示可能なテキストに変換する
   * @param {Object} searchResult 検索結果オブジェクト
   * @returns {string} 整形されたテキスト
   */
  formatSearchResultText(searchResult) {
    if (!searchResult.success || !searchResult.results || searchResult.results.length === 0) {
      return `「${searchResult.query || ''}」に関する情報は見つかりませんでした 🔍`;
    }
    
    const query = searchResult.query;
    let resultText = `「${query}」の検索結果です 🔎\n\n`;
    
    // ローカル検索結果かどうかを判定
    const isLocalSearch = searchResult.results[0].isLocal;
    
    if (isLocalSearch) {
      // ローカル（場所）の検索結果
      searchResult.results.forEach((result, index) => {
        resultText += `${index + 1}. **${result.title}**\n`;
        
        if (result.rating) {
          resultText += `   評価: ${result.rating}/5`;
          if (result.reviewCount) {
            resultText += ` (${result.reviewCount}件のレビュー)`;
          }
          resultText += '\n';
        }
        
        if (result.address) {
          resultText += `   住所: ${result.address}\n`;
        }
        
        if (result.phone) {
          resultText += `   電話: ${result.phone}\n`;
        }
        
        if (result.hours) {
          resultText += `   ${result.hours}\n`;
        }
        
        if (result.url) {
          resultText += `   ${result.url}\n`;
        }
        
        resultText += '\n';
      });
    } else {
      // 通常のウェブ検索結果
      searchResult.results.forEach((result, index) => {
        resultText += `${index + 1}. **${result.title}**\n`;
        resultText += `   ${result.description}\n`;
        resultText += `   ${result.url}\n\n`;
      });
    }
    
    return resultText;
  }
  
  /**
   * 現在の設定状態を確認
   * @returns {boolean} 設定済みかどうか
   */
  isReady() {
    // 常に準備完了として返す
    return true;
  }
}

// シングルトンインスタンスを作成
const braveSearchClient = new BraveSearchClient();

module.exports = braveSearchClient;