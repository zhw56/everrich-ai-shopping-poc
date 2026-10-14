/** 程式內使用的模型介面：Anthropic SDK 的子集（messages.create／messages.stream） */
export type LlmStream = { on(event: 'text', cb: (t: string) => void): LlmStream; finalMessage(): Promise<any> };
export type LlmClient = {
  messages: {
    create(params: any, opts?: { signal?: AbortSignal }): Promise<any>;
    stream(params: any, opts?: { signal?: AbortSignal }): LlmStream;
  };
};
