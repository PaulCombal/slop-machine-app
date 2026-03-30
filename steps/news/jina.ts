type JinaReturnFormat = 'markdown' | 'text' | 'html' | 'screenshot' | 'pageshot';

export interface ScrapedArticle {
  content: string; // The Markdown content
  url: string;
  status: 'success' | 'error';
}

export class JinaReader {
  private readonly baseUrl = 'https://r.jina.ai/';
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Scrapes a URL and returns content in the specified format.
   * @param url The target URL to scrape
   * @param format The desired return format (defaults to markdown)
   */
  async read(
    url: string,
    format: JinaReturnFormat = 'markdown'
  ): Promise<ScrapedArticle> {
    try {
      const response = await fetch(`${this.baseUrl}${url}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'X-Return-Format': format,
        }
      });

      if (!response.ok) {
        throw new Error(`Jina Reader failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.text();

      return {
        content: data,
        url: url,
        status: 'success',
      };
    } catch (error) {
      console.error(`Scraping error for ${url}:`, error);
      return {
        content: "",
        url: url,
        status: 'error',
      };
    }
  }
}