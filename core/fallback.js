const logger = require('../system/logger');
const monitor = require('../system/monitor');

class FallbackHandler {
  static async handleProviderFailure(provider, error) {
    logger.warn(`プロバイダー障害: ${provider}`, error);
    
    monitor.recordError(error, {
      type: 'provider_fallback',
      provider: provider
    });

    return '🌱 今、言葉が少し迷子になっているみたい。また後で話そうか。';
  }

  static async switchProvider(currentProvider) {
    logger.info(`代替プロバイダーへの切り替えを試みます: ${currentProvider}`);
    return null;
  }
}

module.exports = FallbackHandler;