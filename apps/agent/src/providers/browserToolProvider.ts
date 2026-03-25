/**
 * Browser Tool Provider — provides browser capabilities under explicit external-action policy gates.
 * Registers browser tools into the tool registry with auth/policy gating.
 */
import type { ToolMetadata } from "@humanlayer/shared";
import { registerTool, type ToolDefinition, type ToolExecutionContext } from "../runner/toolRegistry.js";

export interface BrowserProviderConfig {
  /** Whether browser tools are enabled by policy */
  enabled: boolean;
  /** Maximum page load timeout in ms */
  pageTimeoutMs: number;
  /** Allowed URL patterns (glob-style) */
  allowedUrlPatterns: string[];
}

const DEFAULT_CONFIG: BrowserProviderConfig = {
  enabled: process.env.BROWSER_TOOLS_ENABLED === "true",
  pageTimeoutMs: parseInt(process.env.BROWSER_PAGE_TIMEOUT_MS ?? "30000", 10),
  allowedUrlPatterns: process.env.BROWSER_ALLOWED_URLS
    ? process.env.BROWSER_ALLOWED_URLS.split(",").map((p) => p.trim())
    : ["*"],
};

/**
 * Browser Tool Provider.
 */
export class BrowserToolProvider {
  private config: BrowserProviderConfig;

  constructor(config: BrowserProviderConfig = DEFAULT_CONFIG) {
    this.config = config;
  }

  /**
   * Register browser tools into the tool registry.
   */
  registerTools(): void {
    const baseMetadata: Omit<ToolMetadata, "toolId" | "displayName"> = {
      providerCategory: "browser",
      requiresAuth: false,
      isExternalAction: true,
      available: this.config.enabled,
      unavailableReason: this.config.enabled ? undefined : "Browser tools are disabled by policy",
    };

    registerTool({
      metadata: {
        ...baseMetadata,
        toolId: "browser_navigate",
        displayName: "Browser Navigate",
      },
      functionDef: {
        name: "browser_navigate",
        description: "Navigate to a URL and return the page content as text",
        parameters: {
          type: "object",
          properties: {
            url: { type: "string", description: "URL to navigate to" },
            waitForSelector: { type: "string", description: "Optional CSS selector to wait for" },
          },
          required: ["url"],
        },
      },
      validate: async (args: Record<string, unknown>) => {
        const url = args.url as string;
        if (!url) throw new Error("URL is required");
        // URL pattern validation would go here in production
      },
      execute: async (args: Record<string, unknown>, _ctx: ToolExecutionContext) => {
        // Placeholder: real implementation will use Playwright or Puppeteer
        return JSON.stringify({
          result: "Browser navigation not yet implemented",
          url: args.url,
          timeout: this.config.pageTimeoutMs,
        });
      },
    });

    registerTool({
      metadata: {
        ...baseMetadata,
        toolId: "browser_screenshot",
        displayName: "Browser Screenshot",
      },
      functionDef: {
        name: "browser_screenshot",
        description: "Take a screenshot of the current browser page",
        parameters: {
          type: "object",
          properties: {
            selector: { type: "string", description: "Optional CSS selector to screenshot" },
            fullPage: { type: "boolean", description: "Whether to capture full page (default: false)" },
          },
        },
      },
      execute: async (args: Record<string, unknown>, _ctx: ToolExecutionContext) => {
        return JSON.stringify({
          result: "Browser screenshot not yet implemented",
          selector: args.selector,
        });
      },
    });

    registerTool({
      metadata: {
        ...baseMetadata,
        toolId: "browser_click",
        displayName: "Browser Click",
      },
      functionDef: {
        name: "browser_click",
        description: "Click an element on the current browser page",
        parameters: {
          type: "object",
          properties: {
            selector: { type: "string", description: "CSS selector of element to click" },
          },
          required: ["selector"],
        },
      },
      execute: async (args: Record<string, unknown>, _ctx: ToolExecutionContext) => {
        return JSON.stringify({
          result: "Browser click not yet implemented",
          selector: args.selector,
        });
      },
    });
  }

  /**
   * Check if browser tools are available.
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }
}

/**
 * Create a browser tool provider with default config.
 */
export function createBrowserToolProvider(config?: BrowserProviderConfig): BrowserToolProvider {
  return new BrowserToolProvider(config);
}
