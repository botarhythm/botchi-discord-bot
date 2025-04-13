class Monitor {
  constructor() {
    this.healthChecks = new Map();
    this.errorLog = [];
  }

  registerHealthCheck(component, status, details = {}) {
    this.healthChecks.set(component, {
      status,
      timestamp: Date.now(),
      ...details
    });
  }

  recordError(error, context = {}) {
    const errorEntry = {
      timestamp: Date.now(),
      message: error.message,
      stack: error.stack,
      context
    };

    this.errorLog.push(errorEntry);
    
    if (this.errorLog.length > 100) {
      this.errorLog.shift();
    }
  }

  getSystemHealth() {
    const overallHealth = Array.from(this.healthChecks.values())
      .every(check => check.status === 'healthy') ? 'healthy' : 'degraded';

    return {
      overall: overallHealth,
      components: Object.fromEntries(this.healthChecks)
    };
  }
}

module.exports = new Monitor();