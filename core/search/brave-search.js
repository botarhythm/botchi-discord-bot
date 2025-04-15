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
  isEnabled: Boolean(process.env.BRAVE_SEARCH_API_KEY || process.env.BRAVE_API_KEY),
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
    // BRAVE_API_KEYもフォールバックとして使用
    this.apiKey = process.env.BRAVE_SEARCH_API_KEY || process.env.BRAVE_API_KEY;
    this.isConfigured = Boolean(this.apiKey);
    
    // 起動時診断メッセージの強化
    if (!this.isConfigured) {
      logger.warn('Brave Search API key not configured. Search functionality will be disabled.');
      // 環境変数の診断情報を追加
      if (config.DEBUG) {
        logger.debug('Search API診断情報:');
        logger.debug(`- BRAVE_SEARCH_API_KEY: ${process.env.BRAVE_SEARCH_API_KEY ? '設定あり' : '未設定'}`);
        logger.debug(`- BRAVE_API_KEY: ${process.env.BRAVE_API_KEY ? '設定あり' : '未設定'}`);
        logger.debug(`- config.BRAVE_API_KEY: ${config.BRAVE_API_KEY ? '設定あり' : '未設定'}`);
        logger.debug(`- config.SEARCH_ENABLED: ${config.SEARCH_ENABLED ? 'true' : 'false'}`);
      }
    } else {
      logger.info('Brave Search client initialized');
      if (config.DEBUG) {
        logger.debug(`Using API key: ${this.apiKey ? this.apiKey.substring(0, 3) + '...' : 'none'}`);
        logger.debug(`Search command prefix: ${this.config.commandPrefix}search`);
        logger.debug(`Search enabled: ${this.isReady()}`);
      }
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
    if (!this.isConfigured) {
      if (config.DEBUG) {
        logger.debug('Search attempted but API is not configured');
      }
      return {
        success: false,
        error: 'Brave Search API is not configured',
        results: []
      };
    }
    
    const count = options.count || this.config.count;
    
    try {
      if (config.DEBUG) {
        logger.debug(`Executing web search: "${query}", count=${count}`);
        logger.debug(`API URL: ${this.config.baseUrl}/web/search`);
        logger.debug(`API Key prefix: ${this.apiKey ? this.apiKey.substring(0, 3) + '...' : 'none'}`);
      }
      
      const response = await axios({
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
      });
      
      if (response.status !== 200) {
        throw new Error(`Brave Search API error: ${response.status}`);
      }
      
      // レスポンス診断情報
      if (config.DEBUG) {
        logger.debug(`Search API response: status=${response.status}, data length=${JSON.stringify(response.data).length}`);
        
        if (response.data && response.data.web && response.data.web.results) {
          logger.debug(`Found ${response.data.web.results.length} search results`);
        } else {
          logger.debug('No web search results found in response');
        }
      }
      
      // 検索結果を整形
      const results = this._formatResults(response.data);
      
      return {
        success: true,
        query: query,
        results: results
      };
    } catch (error) {
      logger.error(`Brave Search error: ${error.message}`);
      
      // エラーの詳細をログに記録（開発用）
      if (config.DEBUG) {
        if (error.response) {
          logger.debug(`API Response error: ${JSON.stringify(error.response.data)}`);
          logger.debug(`API Response status: ${error.response.status}`);
          logger.debug(`API Response headers: ${JSON.stringify(error.response.headers)}`);
        } else if (error.request) {
          logger.debug('API Request was made but no response received');
          logger.debug(`Request details: ${error.request}`);
        } else {
          logger.debug(`Search error details: ${error.stack || 'No stack trace'}`);
        }
        
        // タイムアウトエラーの特定
        if (error.code === 'ECONNABORTED') {
          logger.debug('API connection timeout detected');
        }
      }
      
      return {
        success: false,
        error: error.message,
        query: query,
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
    if (!this.isConfigured) {
      return {
        success: false,
        error: 'Brave Search API is not configured',
        query: query,
        results: []
      };
    }
    
    const count = options.count || this.config.count;
    
    try {
      if (config.DEBUG) {
        logger.debug(`Executing local search: "${query}", count=${count}`);
      }
      
      const response = await axios({
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
      });
      
      if (response.status !== 200) {
        throw new Error(`Brave Local Search API error: ${response.status}`);
      }
      
      // ローカル検索結果があるかチェック
      if (!response.data.results || response.data.results.length === 0) {
        if (config.DEBUG) {
          logger.debug('No local search results found, falling back to web search');
        }
        
        // ローカル検索で結果がない場合は通常のウェブ検索にフォールバック
        return this.search(query, options);
      }
      
      if (config.DEBUG) {
        logger.debug(`Found ${response.data.results.length} local search results`);
      }
      
      // ローカル検索結果を整形
      const results = this._formatLocalResults(response.data);
      
      return {
        success: true,
        query: query,
        results: results
      };
    } catch (error) {
      logger.error(`Brave Local Search error: ${error.message}`);
      
      // エラー詳細の診断情報
      if (config.DEBUG) {
        logger.debug(`Local search error details: ${error.stack || 'No stack trace'}`);
        logger.debug('Falling back to web search...');
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
      if (config.DEBUG) {
        logger.debug('No web results found in API response');
        // データ構造の診断
        logger.debug(`Response structure: ${Object.keys(data).join(', ')}`);
        if (data.web) {
          logger.debug(`Web structure: ${Object.keys(data.web).join(', ')}`);
        }
      }
      return [];
    }
    
    if (config.DEBUG) {
      logger.debug(`Formatting ${data.web.results.length} web search results`);
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
      if (config.DEBUG) {
        logger.debug('No local results found in API response');
      }
      return [];
    }
    
    if (config.DEBUG) {
      logger.debug(`Formatting ${data.results.length} local search results`);
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
    if (!searchResult) {
      if (config.DEBUG) {
        logger.debug('Cannot format null search result');
      }
      return '検索結果の取得に失敗しました。';
    }
    
    if (!searchResult.success || !searchResult.results || searchResult.results.length === 0) {
      if (config.DEBUG) {
        logger.debug(`No search results to format: success=${searchResult.success}, results=${searchResult.results?.length || 0}`);
        if (searchResult.error) {
          logger.debug(`Search error: ${searchResult.error}`);
        }
      }
      return `「${searchResult.query || ''}」に関する情報は見つかりませんでした 🔍`;
    }
    
    if (config.DEBUG) {
      logger.debug(`Formatting ${searchResult.results.length} search results for display`);
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
    return this.isConfigured && this.config.isEnabled;
  }
}

// シングルトンインスタンスを作成
const braveSearchClient = new BraveSearchClient();

// 初期化時の状態ログを出力（デバッグ用）
if (config.DEBUG) {
  logger.debug('Brave Search Client initialized:');
  logger.debug(`- isConfigured: ${braveSearchClient.isConfigured}`);
  logger.debug(`- config.isEnabled: ${braveSearchClient.config.isEnabled}`);
  logger.debug(`- isReady(): ${braveSearchClient.isReady()}`);
  logger.debug(`- API Key prefix: ${braveSearchClient.apiKey ? braveSearchClient.apiKey.substring(0, 3) + '...' : 'none'}`);
}

module.exports = braveSearchClient;