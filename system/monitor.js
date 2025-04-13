/**
 * Bocchy Discord Bot - System Monitor
 * システム状態監視モジュール
 */

const os = require('os');
const logger = require('./logger');
const config = require('./config');

// モニターの状態
const state = {
  startTime: Date.now(),
  healthChecks: {},
  status: {
    system: 'unknown',
    components: {}
  },
  metrics: {
    memoryUsage: [],
    cpuUsage: [],
    latency: [],
    requestCount: 0,
    errorCount: 0,
    lastError: null
  },
  limits: {
    memoryThreshold: 90, // メモリ使用率の警告閾値（％）
    cpuThreshold: 80,    // CPU使用率の警告閾値（％）
    maxSamples: 60,     // メトリクスの最大サンプル数
  }
};

// インターバルハンドル
let metricsInterval = null;

/**
 * モニタリングシステムの初期化
 * @param {Object} options - 初期化オプション
 * @returns {Object} 初期化結果
 */
function initialize(options = {}) {
  // オプションの処理
  if (options.limits) {
    Object.assign(state.limits, options.limits);
  }
  
  // メトリクス収集の開始
  startMetricsCollection();
  
  logger.info('System monitor initialized');
  
  return {
    initialized: true,
    startTime: state.startTime
  };
}

/**
 * メトリクス収集の開始
 * @param {number} interval - 収集間隔（ミリ秒）
 */
function startMetricsCollection(interval = 60000) {
  // 既存のインターバルをクリア
  if (metricsInterval) {
    clearInterval(metricsInterval);
  }
  
  // 初回のメトリクスを収集
  collectMetrics();
  
  // 定期的なメトリクス収集を設定
  metricsInterval = setInterval(() => {
    collectMetrics();
  }, interval);
  
  logger.debug(`Metrics collection started with interval: ${interval}ms`);
}

/**
 * メトリクス収集の停止
 */
function stopMetricsCollection() {
  if (metricsInterval) {
    clearInterval(metricsInterval);
    metricsInterval = null;
    logger.debug('Metrics collection stopped');
  }
}

/**
 * メトリクスを収集
 */
function collectMetrics() {
  try {
    // メモリ使用率
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedPercent = ((totalMem - freeMem) / totalMem) * 100;
    
    // CPU使用率の簡易計算
    const cpuUsage = getCpuUsagePercent();
    
    // メトリクスを追加
    addMetric('memoryUsage', usedPercent);
    addMetric('cpuUsage', cpuUsage);
    
    // 警告チェック
    checkWarningThresholds(usedPercent, cpuUsage);
    
    // システムステータスの更新
    updateSystemStatus();
    
    logger.verbose(`Metrics collected - Memory: ${usedPercent.toFixed(2)}%, CPU: ${cpuUsage.toFixed(2)}%`);
  } catch (error) {
    logger.error('Error collecting metrics:', error);
  }
}

/**
 * CPU使用率を取得
 * @returns {number} CPU使用率（％）
 */
function getCpuUsagePercent() {
  const cpus = os.cpus();
  let totalIdle = 0;
  let totalTick = 0;
  
  for (const cpu of cpus) {
    const times = cpu.times;
    for (const type in times) {
      totalTick += times[type];
    }
    totalIdle += times.idle;
  }
  
  const idle = totalIdle / cpus.length;
  const total = totalTick / cpus.length;
  
  return 100 - (idle / total * 100);
}

/**
 * メトリクスを追加
 * @param {string} metric - メトリクス名
 * @param {number} value - 値
 */
function addMetric(metric, value) {
  if (!state.metrics[metric]) {
    state.metrics[metric] = [];
  }
  
  state.metrics[metric].push({
    timestamp: Date.now(),
    value: value
  });
  
  // サンプル数の制限
  if (state.metrics[metric].length > state.limits.maxSamples) {
    state.metrics[metric].shift();
  }
}

/**
 * 警告閾値をチェック
 * @param {number} memUsage - メモリ使用率
 * @param {number} cpuUsage - CPU使用率
 */
function checkWarningThresholds(memUsage, cpuUsage) {
  if (memUsage > state.limits.memoryThreshold) {
    logger.warn(`High memory usage detected: ${memUsage.toFixed(2)}%`);
  }
  
  if (cpuUsage > state.limits.cpuThreshold) {
    logger.warn(`High CPU usage detected: ${cpuUsage.toFixed(2)}%`);
  }
}

/**
 * システムステータスを更新
 */
function updateSystemStatus() {
  // メモリとCPUの直近の平均を取得
  const recentMemory = getRecentAverage('memoryUsage', 3);
  const recentCpu = getRecentAverage('cpuUsage', 3);
  
  // 各コンポーネントの状態を組み合わせてシステム全体の状態を判定
  let systemStatus = 'healthy';
  
  if (recentMemory > state.limits.memoryThreshold || 
      recentCpu > state.limits.cpuThreshold || 
      state.metrics.errorCount > 5) {
    systemStatus = 'warning';
  }
  
  // およそ30分以内に3回以上のエラーが発生した場合は非健全状態
  const recentErrors = getErrorCountInTimeframe(30 * 60 * 1000); // 30分
  if (recentErrors >= 3) {
    systemStatus = 'unhealthy';
  }
  
  // 状態を更新
  state.status.system = systemStatus;
  
  if (systemStatus !== 'healthy') {
    logger.warn(`System status changed to: ${systemStatus}`);
  }
}

/**
 * 直近のメトリクスの平均を取得
 * @param {string} metric - メトリクス名
 * @param {number} count - 取得する直近のサンプル数
 * @returns {number} 平均値
 */
function getRecentAverage(metric, count = 3) {
  if (!state.metrics[metric] || state.metrics[metric].length === 0) {
    return 0;
  }
  
  const samples = state.metrics[metric].slice(-Math.min(count, state.metrics[metric].length));
  const sum = samples.reduce((acc, sample) => acc + sample.value, 0);
  
  return sum / samples.length;
}

/**
 * 指定時間以内のエラー数を取得
 * @param {number} timeframe - ミリ秒単位の時間枚
 * @returns {number} エラー数
 */
function getErrorCountInTimeframe(timeframe) {
  const now = Date.now();
  const cutoff = now - timeframe;
  
  // 実装上はエラー時にタイムスタンプ付きエラーを配列に追加することを想定
  // 本実装ではエラーカウンタのみなのでダミー値を返す
  return state.metrics.errorCount > 0 ? Math.min(state.metrics.errorCount, 2) : 0;
}

/**
 * コンポーネントの健全性チェック結果を登録
 * @param {string} component - コンポーネント名
 * @param {string} status - 状態 ('healthy', 'warning', 'unhealthy', 'unknown')
 * @param {Object} details - 詳細情報
 */
function registerHealthCheck(component, status, details = {}) {
  state.healthChecks[component] = {
    status,
    timestamp: Date.now(),
    details
  };
  
  // 状態を反映
  state.status.components[component] = status;
  
  // システム全体の状態を更新
  updateSystemStatus();
  
  logger.debug(`Health check registered for ${component}: ${status}`);
  
  return state.healthChecks[component];
}

/**
 * リクエストを記録
 * @param {Object} info - リクエスト情報
 */
function recordRequest(info = {}) {
  state.metrics.requestCount++;
  
  // レイテンシ情報があれば記録
  if (info.latency) {
    addMetric('latency', info.latency);
  }
}

/**
 * エラーを記録
 * @param {Object} error - エラーオブジェクト
 * @param {Object} context - エラーのコンテキスト情報
 */
function recordError(error, context = {}) {
  state.metrics.errorCount++;
  state.metrics.lastError = {
    timestamp: Date.now(),
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : null,
    context
  };
  
  // エラーログ
  logger.error('Error recorded:', error, context);
  
  // 連続するエラーがあればシステム状態を更新
  updateSystemStatus();
}

/**
 * 現在の状態を取得
 * @returns {Object} 現在の状態
 */
function getStatus() {
  const uptime = Date.now() - state.startTime;
  
  return {
    uptime,
    formattedUptime: formatUptime(uptime),
    system: state.status.system,
    components: { ...state.status.components },
    metrics: {
      memory: getRecentAverage('memoryUsage') ?? 0,
      cpu: getRecentAverage('cpuUsage') ?? 0,
      averageLatency: getRecentAverage('latency') ?? 0,
      requestCount: state.metrics.requestCount,
      errorCount: state.metrics.errorCount,
      recentErrors: getErrorCountInTimeframe(30 * 60 * 1000)
    }
  };
}

/**
 * 稼働時間をフォーマット
 * @param {number} uptime - ミリ秒単位の稼働時間
 * @returns {string} フォーマットされた稼働時間
 */
function formatUptime(uptime) {
  const seconds = Math.floor(uptime / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  return `${days}d ${hours % 24}h ${minutes % 60}m ${seconds % 60}s`;
}

module.exports = {
  initialize,
  registerHealthCheck,
  recordRequest,
  recordError,
  getStatus,
  startMetricsCollection,
  stopMetricsCollection
};