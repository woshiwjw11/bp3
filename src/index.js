const fs = require('fs');
const path = require('path');
const { Logger, log } = require('./utils/logger');
const TradingApp = require('./app');
const TimeUtils = require('./utils/timeUtils');

// 全局日志记录器
let logger;

/**
 * 读取配置文件
 * @param {string} configPath - 配置文件路径
 * @returns {Object} 配置对象
 */
function readConfig(configPath) {
  try {
    const configFile = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(configFile);
  } catch (error) {
    console.error(`读取配置文件失败: ${error.message}`);
    process.exit(1);
  }
}

/**
 * 应用主函数
 */
async function main() {
  try {
    // 初始化日志记录器
    logger = new Logger({
      logDir: path.join(__dirname, '../logs'),
      prefix: 'backpack_trading'
    });

    // 记录程序启动
    logger.log('=== Backpack 自动化交易系统启动 ===');
    logger.log('Node.js版本: ' + process.version);
    logger.log('WorkingDir: ' + process.cwd());
    logger.log('脚本基本路径: ' + __dirname);
    
    // 读取配置文件
    const configPath = path.join(__dirname, '../backpack_trading_config.json');
    logger.log(`读取配置文件: ${configPath}`);
    const config = readConfig(configPath);
    
    // 记录基本配置信息
    logger.log(`交易币种: ${config.trading?.tradingCoin}`);
    logger.log(`总投资额: ${config.trading?.totalAmount} USDC`);
    logger.log(`订单数量: ${config.trading?.orderCount}`);
    
    let restartNeeded = false;
    
    do {
      try {
        // 创建并初始化交易应用
        const app = new TradingApp(config, logger);
        
        // 初始化
        const initResult = await app.initialize();
        if (!initResult) {
          logger.log('初始化失败，退出程序');
          break;
        }
        
        // 启动应用
        await app.start();
        
        // 执行交易策略
        const tradeResult = await app.executeTrade();
        if (!tradeResult) {
          logger.log('交易执行失败');
        }
        
        // 等待应用完成或需要重启
        while (app.isRunning() && !app.isRestartNeeded()) {
          // 记录当前状态
          if (TimeUtils.getElapsedMs(app.lastStatusLogTime) > 60000) { // 每分钟记录一次状态
            logger.log('程序运行中...');
            app.lastStatusLogTime = TimeUtils.getCurrentTime();
          }
          
          // 等待一段时间
          await TimeUtils.delay(5000);
        }
        
        // 判断是否需要重启
        restartNeeded = app.isRestartNeeded();
        
        // 停止应用
        await app.stop();
        
        // 如果需要重启，记录信息
        if (restartNeeded) {
          logger.log('需要重启程序...');
          await TimeUtils.delay(2000); // 给一些时间记录日志
        }
      } catch (error) {
        logger.log(`程序执行出错: ${error.message}`);
        logger.log(`错误堆栈: ${error.stack}`);
        restartNeeded = false; // 发生未处理的错误时不自动重启
      }
    } while (restartNeeded);
    
    logger.log('程序执行完成，退出');
  } catch (error) {
    if (logger) {
      logger.log(`主程序异常: ${error.message}`);
      logger.log(`错误堆栈: ${error.stack}`);
    } else {
      console.error(`严重错误: ${error.message}`);
      console.error(error.stack);
    }
  }
}

/**
 * 设置进程退出处理
 */
function setupGracefulShutdown() {
  const exitHandler = (options, exitCode) => {
    if (options.cleanup) {
      logger?.log('清理资源...');
      // 这里可以添加其他清理逻辑
    }
    
    if (exitCode || exitCode === 0) {
      logger?.log(`程序退出，退出码: ${exitCode}`);
    }
    
    if (options.exit) {
      process.exit();
    }
  };
  
  // 捕获不同的退出信号
  process.on('exit', exitHandler.bind(null, { cleanup: true }));
  process.on('SIGINT', exitHandler.bind(null, { exit: true }));
  process.on('SIGUSR1', exitHandler.bind(null, { exit: true }));
  process.on('SIGUSR2', exitHandler.bind(null, { exit: true }));
  process.on('uncaughtException', (error) => {
    logger?.log(`未捕获的异常: ${error.message}`);
    logger?.log(`错误堆栈: ${error.stack}`);
    exitHandler({ exit: true }, 1);
  });
}

// 设置优雅退出
setupGracefulShutdown();

// 启动主程序
main().catch(error => {
  logger?.log(`主程序未捕获异常: ${error.message}`);
  logger?.log(`错误堆栈: ${error.stack}`);
  process.exit(1);
}); 