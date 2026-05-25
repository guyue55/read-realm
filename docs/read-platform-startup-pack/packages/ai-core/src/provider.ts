import OpenAI from 'openai';

export class OpenAIProvider {
  private client: OpenAI;

  constructor(apiKey: string, baseURL?: string) {
    this.client = new OpenAI({ apiKey, baseURL });
  }

  async generateSummary(text: string, model: string = 'gpt-3.5-turbo'): Promise<string> {
    const response = await this.client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: 'You are a helpful assistant that summarizes book chapters. Provide a concise summary of the following text.' },
        { role: 'user', content: text }
      ],
    });

    return response.choices[0]?.message?.content || 'No summary generated.';
  }
}
