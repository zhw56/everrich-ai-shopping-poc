const commands: Record<string, string> = {
  'test:tools': 'T3：工具層與推薦引擎測試',
  chat: 'T4：指令列對話測試',
  eval: 'T10：情境評測',
};

const command = process.argv[2] ?? '';
console.log(`【尚未實作】${commands[command] ?? command}。目前僅預留指令，未執行測試或 API 呼叫。`);
