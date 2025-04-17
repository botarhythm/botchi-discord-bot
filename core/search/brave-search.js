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
  isEnabled: process.env.BRAVE_SEARCH_ENABLED === 'true' || false, // 環境変数によるトグル制御
  commandPrefix: process.env.PREFIX || '!' // !search コマンドのプレフィックス
};

// シングルトンインスタンス
let instance = null;

/**
 * Brave Search APIクライアントクラス
 */
class BraveSearchClient {
  /**
   * コンストラクタ
   * @param {string} apiKey - Brave Search API Key
   * @param {Object} options - オプション設定
   */
  constructor(apiKey, options = {}) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.search.brave.com/res/v1/web/search';
    this.timeout = options.timeout || 10000; // デフォルトタイムアウト: 10秒
    
    // APIキーの検証
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
      throw new Error('有効なBrave Search APIキーが必要です');
    }
    
    logger.debug('BraveSearchClientが初期化されました');
  }

  /**
   * シングルトンインスタンスを取得
   * @returns {BraveSearchClient} クライアントインスタンス
   */
  static getInstance() {
    if (!instance) {
      const apiKey = config.BRAVE_API_KEY;
      if (!apiKey) {
        throw new Error('Brave Search APIキーが設定されていません (config.BRAVE_API_KEY is missing)');
      }
      
      instance = new BraveSearchClient(apiKey);
    }
    return instance;
  }
  
  /**
   * 検索を実行する
   * @param {string} query - 検索クエリ
   * @param {Object} options - 検索オプション
   * @returns {Promise<Object>} 検索結果
   */
  async search(query, options = {}) {
    if (!query || typeof query !== 'string' || query.trim() === '') {
      throw new Error('検索クエリが空です');
    }
    
    // リクエストパラメータの設定
    const params = {
      q: query.trim(),
      count: options.count || 5,
      search_lang: options.language || 'ja',
      country: options.country || 'JP',
      ...options
    };
    
    try {
      logger.debug(`検索リクエスト: "${query}" (オプション: ${JSON.stringify(params)})`);
      
      // Brave Search APIへのリクエスト
      const response = await axios({
        method: 'GET',
        url: this.baseUrl,
        params,
        headers: {
          'Accept': 'application/json',
          'X-Subscription-Token': this.apiKey
        },
        timeout: this.timeout
      });
      
      // 結果をフォーマット
      return this._formatResults(response.data);
      
    } catch (error) {
      // エラーハンドリング
      logger.error(`検索API呼び出しエラー: ${error.message}`);
      
      // エラー詳細の抽出
      const details = error.response 
        ? { status: error.response.status, data: error.response.data }
        : { code: error.code, message: error.message };
        
      throw new Error(`Brave Search APIエラー: ${JSON.stringify(details)}`);
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

    // 機能トグルチェック - 無効な場合は早期リターン
    if (!this.isEnabled) {
      logger.warn('Brave Search API is disabled. Enable it with BRAVE_SEARCH_ENABLED=true');
      return { success: false, error: 'Search feature is disabled', results: [] };
    }
    
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
          count: count,
          country: 'JP', // 日本の検索結果を優先
          language: 'ja', // 日本語を優先
          search_lang: 'ja' // 検索言語も日本語に設定
        },
        headers: {
          'Accept': 'application/json',
          'X-Subscription-Token': this.apiKey,
          'Accept-Language': 'ja-JP' // 日本語コンテンツを優先
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
   * API結果を整形する
   * @param {Object} data - APIからのレスポンスデータ
   * @returns {Object} 整形された結果
   */
  _formatResults(data) {
    // 検索結果がない場合
    if (!data || !data.web || !data.web.results) {
      return { web: { results: [] } };
    }
    
    // web プロパティが存在しない場合は追加
    if (!data.web) {
      data.web = { results: [] };
      return data;
    }
    
    // 各結果の説明を適切な長さに調整
    if (data.web.results) {
      data.web.results = data.web.results.map(item => {
        // 説明文が長すぎる場合は切り詰める（最大500文字）
        if (item.description && item.description.length > 500) {
          item.description = item.description.substring(0, 497) + '...';
        }
        return item;
      });
    }
    
    return data;
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
   * 著作権保護と引用ガイドラインに従って結果を整形
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
    
    // 著作権保護対応: 
    // 1. 引用は25語以内に制限
    // 2. 引用は必ず引用符で囲む
    // 3. 要約は2-3文に制限
    // 4. オリジナルの言い回しを避ける
    
    if (isLocalSearch) {
      // ローカル（場所）の検索結果
      // 場所情報は事実に基づくものなので著作権の懸念は低いが、フォーマットは改善
      searchResult.results.forEach((result, index) => {
        resultText += `${index + 1}. **${result.title}**\n`;
        
        // ビジネス情報のまとめを表示
        const infoItems = [];
        
        if (result.rating) {
          infoItems.push(`評価: ${result.rating}/5${result.reviewCount ? ` (${result.reviewCount}件のレビュー)` : ''}`);
        }
        
        if (result.address) {
          infoItems.push(`住所: ${result.address}`);
        }
        
        if (result.phone) {
          infoItems.push(`電話: ${result.phone}`);
        }
        
        if (result.hours) {
          infoItems.push(`${result.hours}`);
        }
        
        // 情報をまとめて表示（より簡潔に）
        if (infoItems.length > 0) {
          resultText += `   ${infoItems.join(' • ')}\n`;
        }
        
        // URLは短く表示
        if (result.url) {
          const domain = result.url.replace(/^https?:\/\/([^\/]+).*$/, '$1');
          resultText += `   🔗 ${domain}\n`;
        }
        
        resultText += '\n';
      });
    } else {
      // 通常のウェブ検索結果 - 著作権に配慮したフォーマット
      searchResult.results.forEach((result, index) => {
        resultText += `${index + 1}. **${result.title}**\n`;
        
        // 説明文を短めに整形し、25単語以内の短い引用にする
        let description = result.description || '';
        
        // 説明文が長い場合は要約
        if (description.length > 0) {
          // 単語数をカウント
          const words = description.split(/\s+/);
          if (words.length > 25) {
            // 25単語以内に制限し、末尾に省略記号を追加
            description = words.slice(0, 25).join(' ') + '...';
          }
          
          // 引用符で囲む（著作権保護対策）
          resultText += `   "${description.trim()}"\n`;
        }
        
        // URLはドメイン名と一緒に表示
        const domain = result.url.replace(/^https?:\/\/([^\/]+).*$/, '$1');
        resultText += `   🔗 [${domain}](${result.url})\n\n`;
      });
      
      // 結果の後に著作権への配慮を示す注釈を追加
      resultText += `ℹ️ 情報元サイトの利用規約に従って、引用は短く制限しています。完全な情報は各サイトでご確認ください。\n`;
    }
    
    return resultText;
  }
  
  /**
   * 現在の設定状態を確認
   * @returns {boolean} 設定済みかどうか
   */
  isReady() {
    // Check the global config directly, not instance property
    return config.BRAVE_SEARCH_ENABLED === true;
  }
}

module.exports = BraveSearchClient;