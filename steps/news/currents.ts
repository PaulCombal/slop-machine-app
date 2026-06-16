export interface CurrentsResponse<T> {
  status: string;
  [key: string]: any; // To handle 'categories', 'regions', or 'languages'
}

export const NEWS_CATEGORIES = [
  'general', 'society', 'science_technology', 'politics_government',
  'economy_business_finance', 'arts_culture_entertainment', 'lifestyle_leisure',
  'human_interest', 'sport', 'crime_law_justice', 'education',
  'environment', 'labour', 'health', 'automotive', 'real_estate',
] as const;

export type Category = (typeof NEWS_CATEGORIES)[number];

// Supported Currents region codes (GET /v2/available/regions). Mostly ISO
// 2-letter country codes plus a few aggregates (EU, ASIA, INT). The API takes a
// single region per request, so this drives a single-select dropdown.
export const NEWS_REGIONS = [
  'AE', 'AF', 'AR', 'ASIA', 'AT', 'AU', 'BA', 'BD', 'BE', 'BO',
  'BR', 'CA', 'CH', 'CL', 'CN', 'CO', 'CZ', 'DE', 'DK', 'EC',
  'EE', 'EG', 'ES', 'EU', 'FI', 'FR', 'GB', 'GH', 'GR', 'HK',
  'HU', 'ID', 'IE', 'IL', 'IN', 'INT', 'IQ', 'IR', 'IT', 'JP',
  'KE', 'KH', 'KR', 'KW', 'LB', 'LU', 'MM', 'MX', 'MY', 'NG',
  'NK', 'NL', 'NO', 'NP', 'NZ', 'PA', 'PE', 'PH', 'PK', 'PL',
  'PS', 'PT', 'PY', 'QA', 'RO', 'RS', 'RU', 'SA', 'SE', 'SG',
  'SI', 'TH', 'TR', 'TW', 'US', 'UY', 'VE', 'VN', 'ZW',
] as const;

export interface NewsArticle {
  id: string;
  title: string;
  description: string;
  url: string;
  author: string;
  image: string;
  language: string;
  category: Category[];
  published: string;
}

export interface NewsParams {
  language?: string;
  country?: string;
  category?: Category | Category[];
  type?: 1 | 2 | 3;
  domain?: string;
  domain_not?: string;
  page_number?: number;
  page_size?: number;
}

export interface SearchParams extends NewsParams {
  keywords?: string;
  query?: string; // Boolean syntax support
  start_date?: string; // ISO-8601
  end_date?: string;   // ISO-8601
  cursor?: string;     // V2 specific pagination
}

export interface SearchResponse {
  status: string;
  news: NewsArticle[];
  page: number;
  next_cursor?: string | null;
}

export class CurrentsMetadata {
  private readonly baseUrl = 'https://api.currentsapi.services/v2';
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async fetchAuxiliary(endpoint: string): Promise<any> {
    const url = `${this.baseUrl}/available/${endpoint}?apiKey=${this.apiKey}`;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      // @ts-ignore
      return data[endpoint] || data; // API returns { categories: [...] } or similar
    } catch (error) {
      console.error(`Failed to fetch ${endpoint}:`, error);
      return null;
    }
  }

  /**
   * Returns a list of canonical V2 categories.
   */
  async getAvailableCategories(): Promise<Category[]> {
    return await this.fetchAuxiliary('categories');
  }

  /**
   * Returns a list of supported 2-letter country codes (regions).
   */
  async getAvailableRegions(): Promise<Record<string, string>> {
    return await this.fetchAuxiliary('regions');
  }

  /**
   * Returns a list of valid language codes.
   */
  async getAvailableLanguages(): Promise<Record<string, string>> {
    return await this.fetchAuxiliary('languages');
  }

  /**
   * Fetches the latest news based on provided filters.
   */
  async getLatestNews(params: NewsParams = {}): Promise<NewsArticle[]> {
    const queryParams = new URLSearchParams({
      apiKey: this.apiKey,
      ...Object.entries(params).reduce((acc, [key, value]) => {
        // Handle array of categories by joining them with commas
        if (key === 'category' && Array.isArray(value)) {
          acc[key] = value.join(',');
        } else if (value !== undefined) {
          acc[key] = String(value);
        }
        return acc;
      }, {} as Record<string, string>)
    });

    const url = `${this.baseUrl}/latest-news?${queryParams.toString()}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        const errorData = await response.json();
        // @ts-ignore
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      // @ts-ignore
      return data.news || [];
    } catch (error) {
      console.error("Error fetching latest news:", error);
      return [];
    }
  }

  /**
   * Internal helper to clean up parameters and build the query string
   */
  private buildQueryParams(params: Record<string, any>): URLSearchParams {
    const searchParams = new URLSearchParams({ apiKey: this.apiKey });

    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;

      if (key === 'category' && Array.isArray(value)) {
        searchParams.append(key, value.join(','));
      } else {
        searchParams.append(key, String(value));
      }
    }
    return searchParams;
  }

  /**
   * Search through tens of millions of articles using keywords or Boolean logic.
   */
  async search(params: SearchParams): Promise<SearchResponse> {
    const queryPath = this.buildQueryParams(params);
    const url = `${this.baseUrl}/search?${queryPath.toString()}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        const errorData = await response.json();
        // @ts-ignore
        throw new Error(errorData.message || `Search failed: ${response.status}`);
      }

      return await response.json() as SearchResponse;
    } catch (error) {
      console.error("Currents Search Error:", error);
      return { status: "error", news: [], page: 1, next_cursor: null };
    }
  }
}

async function displayOptions() {
  const helper = new CurrentsMetadata(process.env.CURRENTS_API_KEY!);
  // console.log("--- Loading Available Options ---");
  //
  // // 1. Get Categories
  // const categories = await helper.getAvailableCategories();
  // if (categories) {
  //   console.log("Available Categories:", categories.join(', '));
  // }
  //
  // // 2. Get Regions (returns object like { "US": "United States", "FR": "France" })
  // const regions = await helper.getAvailableRegions();
  // if (regions) {
  //   console.log("Featured Regions:");
  //   Object.entries(regions).forEach(([code, name]) => {
  //     console.log(`- ${name} (${code})`);
  //   });
  // }
  //
  // // 3. Get Languages
  // const languages = await helper.getAvailableLanguages();
  // if (languages) {
  //   console.log(`Supported Languages: ${Object.keys(languages).length} found.`);
  //   console.log(languages);
  // }

  // const articles = await helper.getLatestNews({
  //   country: 'US',
  //   category: ['crime_law_justice', 'politics_government', 'general'],
  //   // language: 'fr',
  //   page_size: 5
  // });
  //
  // console.log(articles);

  const articles2 = await helper.search({
    country: 'US',
    category: ['crime_law_justice', 'politics_government', 'general'],
    query: 'epstein',
    page_size: 5
  });

  console.log(articles2)
}

// displayOptions();