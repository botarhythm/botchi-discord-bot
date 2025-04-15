/**
 * Bocchy Discord Bot - 検索サービス
 * BraveSearchを使用してウェブ検索と結果の要約を行う
 */

const axios = require('axios');
const logger = require('../system/logger');

// BraveSearchの設定（環境変数から取得）
const BRAVE_SEARCH_API_KEY = process.env.BRAVE_SEARCH_API_KEY || '';
const BRAVE_SEARCH_API_URL = 'https://api.search.brave.com/res/v1/web/search';

// APIキャッシュ（トークン制限回避と高速化のため）
const CACHE_DURATION = 5 * 60 * 1000; // 5分間
const searchCache = new Map();

/**
 * ウェブ検索と結果の要約を行う
 * @param {string} query - 検索キーワード
 * @param {Object} options - 検索オプション
 * @param {number} options.count - 取得する結果数（デフォルト5件）
 * @param {boolean} options.useCache - キャッシュを使用するか（デフォルトtrue）
 * @returns {Promise<Object>} 検索結果と要約
 */
async function performSearch(query, options = {}) {
  try {
    // デフォルトのオプション
    options = {
      count: 5,
      useCache: true,
      ...options
    };
    
    logger.info(`検索実行: "${query}" (結果数: ${options.count})`);
    
    // キャッシュチェック
    const cacheKey = `${query}:${options.count}`;
    if (options.useCache && searchCache.has(cacheKey)) {
      const cachedResult = searchCache.get(cacheKey);
      
      // キャッシュが有効期間内か確認
      if (Date.now() - cachedResult.timestamp < CACHE_DURATION) {
        logger.info(`キャッシュからの検索結果を使用: "${query}"`);
        return cachedResult.data;
      }
      
      // 期限切れなら削除
      searchCache.delete(cacheKey);
    }
    
    if (!BRAVE_SEARCH_API_KEY) {
      logger.warn('Brave Search APIキーが設定されていません');
      return {
        error: 'API key not configured',
        summary: 'Brave Search APIキーが設定されていないため、検索を実行できませんでした。',
        sources: '設定が必要です'
      };
    }
    
    // Brave Search APIへのリクエスト
    const response = await axios.get(BRAVE_SEARCH_API_URL, {
      params: {
        q: query,
        count: options.count
      },
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': BRAVE_SEARCH_API_KEY
      },
      timeout: 10000
    });
    
    // 検索結果の解析と要約作成
    const searchResults = processSearchResults(response.data);
    
    // キャッシュに保存
    if (options.useCache) {
      searchCache.set(cacheKey, {
        timestamp: Date.now(),
        data: searchResults
      });
    }
    
    return searchResults;
  } catch (error) {
    logger.error('検索処理エラー:', error);
    
    // エラーレスポンスの詳細を出力
    if (error.response) {
      logger.error(`API応答ステータス: ${error.response.status}`);
      logger.error('API応答データ:', error.response.data);
    }
    
    return {
      error: error.message,
      summary: '検索処理中にエラーが発生しました。しばらく経ってから再度お試しください。',
      sources: 'エラーのため情報なし'
    };
  }
}

/**
 * 検索結果からボッチー向けの要約を生成
 * @param {Object} apiResponse - Brave Search APIのレスポンス
 * @returns {Object} 要約と情報源
 */
function processSearchResults(apiResponse) {
  try {
    // 結果がない場合
    if (!apiResponse || !apiResponse.web || !apiResponse.web.results || apiResponse.web.results.length === 0) {
      return {
        summary: '検索結果が見つかりませんでした。別のキーワードで試してみてください。',
        sources: '情報なし'
      };
    }
    
    // 結果データ
    const results = apiResponse.web.results;
    const query = apiResponse.query?.original_query || '検索キーワード';
    
    // 上位の結果を使って要約を生成
    let summaryText = `「${query}」に関する情報をまとめました：\n\n`;
    
    // 各検索結果の情報を追加
    results.slice(0, 3).forEach((result, index) => {
      summaryText += `${index + 1}. ${result.title}\n`;
      if (result.description) {
        summaryText += `${result.description}\n`;
      }
      summaryText += '\n';
    });
    
    // 情報源のURLリストを作成
    const sources = results.slice(0, 3).map((result, index) => {
      return `${index + 1}. [${result.title}](${result.url})`;
    }).join('\n');
    
    return {
      summary: summaryText,
      sources: sources || '情報源なし',
      query: query,
      totalResults: apiResponse.web.total || 0,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    logger.error('検索結果の処理エラー:', error);
    return {
      summary: '検索結果の処理中にエラーが発生しました。',
      sources: 'エラーのため情報なし',
      error: error.message
    };
  }
}

/**
 * 検索キャッシュをクリア
 */
function clearCache() {
  searchCache.clear();
  logger.info('検索キャッシュをクリアしました');
}

/**
 * APIの可用性・健全性をチェック
 * @returns {Promise<Object>} 健全性ステータス
 */
async function checkHealth() {
  try {
    if (!BRAVE_SEARCH_API_KEY) {
      return { status: 'unconfigured', message: 'APIキーが設定されていません' };
    }
    
    // 軽量な検索を試行
    const testResult = await axios.get(BRAVE_SEARCH_API_URL, {
      params: {
        q: 'test',
        count: 1
      },
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': BRAVE_SEARCH_API_KEY
      },
      timeout: 5000
    });
    
    return {
      status: 'healthy',
      message: 'API接続正常',
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    logger.error('検索APIヘルスチェックエラー:', error);
    return {
      status: 'unhealthy',
      message: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

// エクスポート
module.exports = {
  performSearch,
  clearCache,
  checkHealth
};
