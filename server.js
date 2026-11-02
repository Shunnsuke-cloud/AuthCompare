import { createApp, readConfig } from './src/app.js';

try {
  const config = readConfig(process.env);
  const app = createApp(config);
  const server = app.listen(config.port, '127.0.0.1', () => {
    console.log(`AuthCompare: ${config.origin} (Ctrl+C で終了)`);
  });
  server.on('error', (error) => {
    console.error(error.code === 'EADDRINUSE' ? 'ポートが使用中です。PORTとAPP_ORIGINを変更してください。' : error.message);
    process.exitCode = 1;
  });
} catch (error) {
  console.error(`設定エラー: ${error.message}`);
  process.exitCode = 1;
}
