import type {
  CodeGenerationResult,
  GenerationContext,
  LLMAdapter,
  LLMConfig,
  LLMRequest,
  LLMResponse,
  TokenUsage,
} from "./types.ts";
import { CodeExtractor } from "./code-extractor.ts";

export class MockLLMAdapter implements LLMAdapter {
  readonly name = "mock";
  readonly supportedModels = ["mock-gpt-4", "mock-claude-3", "mock-local"];
  
  private config: LLMConfig = {
    provider: "mock",
    model: "mock-gpt-4",
    temperature: 0.1,
    maxTokens: 4000,
  };
  
  private readonly codeTemplates = {
    simpleCodeunit: `codeunit 70000 "Inventory Calculator"
{
    Access = Public;

    procedure CalculateInventoryValue(): Decimal
    var
        Item: Record Item;
        TotalValue: Decimal;
    begin
        TotalValue := 0;
        
        if Item.FindSet() then
            repeat
                TotalValue += Item."Unit Cost" * Item.Inventory;
            until Item.Next() = 0;
            
        exit(TotalValue);
    end;
}`,

    apiPage: `page 70100 "Customer API"
{
    PageType = API;
    APIPublisher = 'mycompany';
    APIGroup = 'customers';
    APIVersion = 'v1.0';
    EntityName = 'customer';
    EntitySetName = 'customers';
    SourceTable = Customer;
    DelayedInsert = true;
    ODataKeyFields = SystemId;

    layout
    {
        area(Content)
        {
            repeater(Records)
            {
                field(id; Rec.SystemId)
                {
                    Caption = 'Id';
                    Editable = false;
                }
                field(number; Rec."No.")
                {
                    Caption = 'Number';
                }
                field(displayName; Rec.Name)
                {
                    Caption = 'Display Name';
                }
            }
        }
    }
}`,

    tableExtension: `tableextension 70200 "Customer Extension" extends Customer
{
    fields
    {
        field(70200; "Customer Rating"; Option)
        {
            Caption = 'Customer Rating';
            OptionMembers = "Not Rated",Bronze,Silver,Gold,Platinum;
            OptionCaption = 'Not Rated,Bronze,Silver,Gold,Platinum';
            DataClassification = CustomerContent;
        }
        field(70201; "Loyalty Points"; Integer)
        {
            Caption = 'Loyalty Points';
            DataClassification = CustomerContent;
            MinValue = 0;
        }
    }
}`,
  };

  configure(config: LLMConfig): void {
    this.config = { ...this.config, ...config };
  }

  async generateCode(
    request: LLMRequest,
    context: GenerationContext,
  ): Promise<CodeGenerationResult> {
    console.log(`🤖 [Mock LLM] Generating AL code for task: ${context.taskId} (attempt ${context.attempt})`);
    
    await this.simulateDelay(1500);
    
    const code = this.generateMockCode(request.prompt, context);
    const response = this.createMockResponse(code, request);
    
    const extraction = CodeExtractor.extract(code, "al");
    
    return {
      code: extraction.code,
      language: "al",
      response,
      extractedFromDelimiters: extraction.extractedFromDelimiters,
    };
  }

  async generateFix(
    originalCode: string,
    errors: string[],
    request: LLMRequest,
    context: GenerationContext,
  ): Promise<CodeGenerationResult> {
    console.log(`🤖 [Mock LLM] Generating fix for ${errors.length} error(s) in task: ${context.taskId}`);
    
    await this.simulateDelay(1200);
    
    const fixedCode = this.generateMockFix(originalCode, errors);
    const response = this.createMockResponse(fixedCode, request);
    
    const extraction = CodeExtractor.extract(fixedCode, "diff");
    
    return {
      code: extraction.code,
      language: extraction.language === "unknown" ? "diff" : extraction.language,
      response,
      extractedFromDelimiters: extraction.extractedFromDelimiters,
    };
  }

  validateConfig(config: LLMConfig): string[] {
    const errors: string[] = [];
    
    if (!config.model) {
      errors.push("Model is required");
    } else if (!this.supportedModels.includes(config.model)) {
      errors.push(`Unsupported model: ${config.model}. Supported: ${this.supportedModels.join(", ")}`);
    }
    
    if (config.temperature !== undefined && (config.temperature < 0 || config.temperature > 2)) {
      errors.push("Temperature must be between 0 and 2");
    }
    
    if (config.maxTokens !== undefined && config.maxTokens < 1) {
      errors.push("Max tokens must be greater than 0");
    }
    
    return errors;
  }

  estimateCost(promptTokens: number, completionTokens: number): number {
    // Mock cost estimation (free for mock)
    return 0;
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }

  private generateMockCode(prompt: string, context: GenerationContext): string {
    const lowerPrompt = prompt.toLowerCase();
    
    // Determine what type of AL object to generate based on prompt
    if (lowerPrompt.includes("api") || lowerPrompt.includes("page")) {
      return this.wrapInBeginCode(this.codeTemplates.apiPage);
    } else if (lowerPrompt.includes("extension") || lowerPrompt.includes("extend")) {
      return this.wrapInBeginCode(this.codeTemplates.tableExtension);
    } else {
      // Default to simple codeunit with potential intentional errors
      let code = this.codeTemplates.simpleCodeunit;
      
      // Sometimes introduce errors to test the fix flow  
      if (context.attempt === 1 && Math.random() < 0.3) {
        code = this.introduceErrors(code);
      }
      
      return this.wrapInBeginCode(code);
    }
  }

  private generateMockFix(_originalCode: string, errors: string[]): string {
    console.log(`🔧 [Mock LLM] Attempting to fix errors: ${errors.join(", ")}`);
    
    // Instead of generating a diff, generate the fixed AL code directly
    let fixedCode = this.codeTemplates.simpleCodeunit;
    
    // Address specific error patterns by ensuring the code is correct
    for (const error of errors) {
      if (error.includes("Field identifier must be enclosed in quotes")) {
        // Ensure quotes are present
        fixedCode = fixedCode.replace(/Item\.Unit Cost/g, 'Item."Unit Cost"');
      } 
      if (error.includes("Missing semicolon")) {
        // Ensure semicolons are present
        fixedCode = fixedCode.replace(/exit\(TotalValue\)(?!;)/g, 'exit(TotalValue);');
      } 
      if (error.includes("Missing 'if' keyword")) {
        // Ensure if keyword is present
        fixedCode = fixedCode.replace(/(?<!if )Item\.FindSet\(\) then/g, 'if Item.FindSet() then');
      } 
      if (error.includes("Access property should be specified")) {
        // Ensure Access property is present
        if (!fixedCode.includes("Access =")) {
          fixedCode = fixedCode.replace(/(codeunit \d+ "[^"]+"\s*\{)/, '$1\n    Access = Public;');
        }
      }
    }

    return this.wrapInBeginCode(fixedCode);
  }

  private introduceErrors(code: string): string {
    let errorCode = code;
    
    // Randomly introduce common AL errors
    const errorTypes = [
      () => errorCode = errorCode.replace('"Unit Cost"', 'Unit Cost'), // Missing quotes
      () => errorCode = errorCode.replace('exit(TotalValue);', 'exit(TotalValue)'), // Missing semicolon  
      () => errorCode = errorCode.replace('if Item.FindSet() then', 'Item.FindSet() then'), // Missing if
      () => errorCode = errorCode.replace('Access = Public;', ''), // Missing Access property
    ];
    
    // Introduce 1-2 random errors
    const numErrors = Math.floor(Math.random() * 2) + 1;
    for (let i = 0; i < numErrors; i++) {
      const errorType = errorTypes[Math.floor(Math.random() * errorTypes.length)];
      errorType();
    }
    
    return errorCode;
  }

  private wrapInBeginCode(code: string): string {
    return `Here's the AL code that implements the requested functionality:

BEGIN-CODE
${code}
END-CODE

This code follows Business Central AL conventions and should compile successfully.`;
  }

  private createMockResponse(content: string, request: LLMRequest): LLMResponse {
    const usage: TokenUsage = {
      promptTokens: Math.floor(request.prompt.length / 4), // Rough estimate
      completionTokens: Math.floor(content.length / 4),
      totalTokens: 0,
      estimatedCost: 0,
    };
    usage.totalTokens = usage.promptTokens + usage.completionTokens;

    return {
      content,
      model: this.config.model,
      usage,
      duration: Math.floor(Math.random() * 2000) + 800, // 800-2800ms
      finishReason: "stop",
    };
  }

  private async simulateDelay(ms: number): Promise<void> {
    const actualDelay = ms + (Math.random() * 500 - 250); // Add some randomness
    await new Promise(resolve => setTimeout(resolve, actualDelay));
  }
}