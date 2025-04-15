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
  isEnabled: (process.env.BRAVE_SEARCH_API_KEY || process.env.BRAVE_API_KEY) ? true : false
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
    
    if (!this.isConfigured) {
      logger.warn('Brave Search API key not configured. Search functionality will be disabled.');
    } else {
      logger.info('Brave Search client initialized');
      if (process.env.DEBUG === 'true') {
        logger.debug(`Using API key: ${this.apiKey ? this.apiKey.substring(0, 3) + '...' : 'none'}`);
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
      return {
        success: false,
        error: 'Brave Search API is not configured',
        results: []
      };
    }
    
    const count = options.count || this.config.count;
    
    try {
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
        } else {
          logger.debug(`Search error details: ${error.stack}`);
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
    if (!this.isConfigured) {
      return {
        success: false,
        error: 'Brave Search API is not configured',
        results: []
      };
    }
    
    const count = options.count || this.config.count;
    
    try {
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
        // ローカル検索で結果がない場合は通常のウェブ検索にフォールバック
        return this.search(query, options);
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
    return this.isConfigured && this.config.isEnabled;
  }
}

// シングルトンインスタンスを作成
const braveSearchClient = new BraveSearchClient();

module.exports = braveSearchClient;