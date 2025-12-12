/**
 * Real API response fixtures for testing provider adapters
 * These are actual response formats from LLM providers to ensure compatibility
 */

// OpenAI API Response Fixtures
export const openaiResponses = {
  success: {
    id: "chatcmpl-123",
    object: "chat.completion",
    created: 1677652288,
    model: "gpt-4o",
    system_fingerprint: "fp_44709d6fcb",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: "table 50100 \"Customer Extension\"\n{\n    TableType = Normal;\n    Caption = 'Customer Extension';\n    \n    fields\n    {\n        field(1; \"Customer No.\"; Code[20])\n        {\n            Caption = 'Customer No.';\n            TableRelation = Customer;\n        }\n        \n        field(10; \"Loyalty Points\"; Integer)\n        {\n            Caption = 'Loyalty Points';\n            MinValue = 0;\n        }\n    }\n    \n    keys\n    {\n        key(PK; \"Customer No.\")\n        {\n            Clustered = true;\n        }\n    }\n}",
        },
        logprobs: null,
        finish_reason: "stop"
      }
    ],
    usage: {
      prompt_tokens: 150,
      completion_tokens: 200,
      total_tokens: 350
    }
  },
  
  error: {
    error: {
      message: "Invalid API key provided",
      type: "invalid_request_error",
      param: null,
      code: "invalid_api_key"
    }
  },

  streamChunk: {
    id: "chatcmpl-123",
    object: "chat.completion.chunk",
    created: 1677652288,
    model: "gpt-4o",
    choices: [
      {
        index: 0,
        delta: {
          content: "table 50100"
        },
        finish_reason: null
      }
    ]
  }
};

// Anthropic API Response Fixtures
export const anthropicResponses = {
  success: {
    id: "msg_01A2B3C4D5E6F7G8H9I0J1K2L3",
    type: "message",
    role: "assistant",
    content: [
      {
        type: "text",
        text: "table 50100 \"Customer Extension\"\n{\n    TableType = Normal;\n    Caption = 'Customer Extension';\n    \n    fields\n    {\n        field(1; \"Customer No.\"; Code[20])\n        {\n            Caption = 'Customer No.';\n            TableRelation = Customer;\n        }\n        \n        field(10; \"Loyalty Points\"; Integer)\n        {\n            Caption = 'Loyalty Points';\n            MinValue = 0;\n        }\n    }\n    \n    keys\n    {\n        key(PK; \"Customer No.\")\n        {\n            Clustered = true;\n        }\n    }\n}"
      }
    ],
    model: "claude-3-5-sonnet-20241022",
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: 150,
      output_tokens: 200
    }
  },

  error: {
    type: "error",
    error: {
      type: "authentication_error",
      message: "invalid x-api-key"
    }
  },

  streamChunk: {
    type: "content_block_delta",
    index: 0,
    delta: {
      type: "text_delta",
      text: "table 50100"
    }
  }
};

// Google Gemini API Response Fixtures
export const geminiResponses = {
  success: {
    candidates: [
      {
        content: {
          parts: [
            {
              text: "table 50100 \"Customer Extension\"\n{\n    TableType = Normal;\n    Caption = 'Customer Extension';\n    \n    fields\n    {\n        field(1; \"Customer No.\"; Code[20])\n        {\n            Caption = 'Customer No.';\n            TableRelation = Customer;\n        }\n        \n        field(10; \"Loyalty Points\"; Integer)\n        {\n            Caption = 'Loyalty Points';\n            MinValue = 0;\n        }\n    }\n    \n    keys\n    {\n        key(PK; \"Customer No.\")\n        {\n            Clustered = true;\n        }\n    }\n}"
            }
          ],
          role: "model"
        },
        finishReason: "STOP",
        index: 0,
        safetyRatings: [
          {
            category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
            probability: "NEGLIGIBLE"
          },
          {
            category: "HARM_CATEGORY_HATE_SPEECH",
            probability: "NEGLIGIBLE"
          },
          {
            category: "HARM_CATEGORY_HARASSMENT",
            probability: "NEGLIGIBLE"
          },
          {
            category: "HARM_CATEGORY_DANGEROUS_CONTENT",
            probability: "NEGLIGIBLE"
          }
        ]
      }
    ],
    usageMetadata: {
      promptTokenCount: 150,
      candidatesTokenCount: 200,
      totalTokenCount: 350
    }
  },

  error: {
    error: {
      code: 400,
      message: "API key not valid. Please pass a valid API key.",
      status: "INVALID_ARGUMENT",
      details: [
        {
          "@type": "type.googleapis.com/google.rpc.ErrorInfo",
          reason: "API_KEY_INVALID",
          domain: "googleapis.com",
          metadata: {
            service: "generativelanguage.googleapis.com"
          }
        }
      ]
    }
  }
};

// Azure OpenAI API Response Fixtures (same format as OpenAI but with Azure specifics)
export const azureOpenaiResponses = {
  success: {
    id: "chatcmpl-123",
    object: "chat.completion",
    created: 1677652288,
    model: "gpt-4o",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: "table 50100 \"Customer Extension\"\n{\n    TableType = Normal;\n    Caption = 'Customer Extension';\n    \n    fields\n    {\n        field(1; \"Customer No.\"; Code[20])\n        {\n            Caption = 'Customer No.';\n            TableRelation = Customer;\n        }\n        \n        field(10; \"Loyalty Points\"; Integer)\n        {\n            Caption = 'Loyalty Points';\n            MinValue = 0;\n        }\n    }\n    \n    keys\n    {\n        key(PK; \"Customer No.\")\n        {\n            Clustered = true;\n        }\n    }\n}",
        },
        finish_reason: "stop"
      }
    ],
    usage: {
      prompt_tokens: 150,
      completion_tokens: 200,
      total_tokens: 350
    }
  },

  error: {
    error: {
      message: "The API deployment for this resource does not exist",
      type: "invalid_request_error",
      param: null,
      code: "DeploymentNotFound"
    }
  }
};

// Local/Ollama API Response Fixtures
export const localResponses = {
  success: {
    model: "codellama",
    created_at: "2023-08-04T19:22:45.499127Z",
    response: "table 50100 \"Customer Extension\"\n{\n    TableType = Normal;\n    Caption = 'Customer Extension';\n    \n    fields\n    {\n        field(1; \"Customer No.\"; Code[20])\n        {\n            Caption = 'Customer No.';\n            TableRelation = Customer;\n        }\n        \n        field(10; \"Loyalty Points\"; Integer)\n        {\n            Caption = 'Loyalty Points';\n            MinValue = 0;\n        }\n    }\n    \n    keys\n    {\n        key(PK; \"Customer No.\")\n        {\n            Clustered = true;\n        }\n    }\n}",
    done: true,
    context: [1, 2, 3, 4, 5],
    total_duration: 5043500667,
    load_duration: 5025959,
    prompt_eval_count: 26,
    prompt_eval_duration: 325953000,
    eval_count: 290,
    eval_duration: 4709213000
  },

  error: {
    error: "model 'nonexistent-model' not found"
  }
};

// Common test prompts
export const testPrompts = {
  simple: {
    content: "Create a simple AL table with Customer No and Name fields",
    context: "Generate AL code for Microsoft Dynamics 365 Business Central"
  },
  
  complex: {
    content: "Create an AL table extension for Customer table that adds loyalty points tracking with validation",
    context: "This is for a retail loyalty program implementation in Business Central"
  }
};

// Expected response validation patterns
export const responseValidation = {
  alCode: {
    pattern: /table\s+\d+\s+".*?"\s*\{[\s\S]*?\}/i,
    requiredElements: ["table", "fields", "field(", "Caption"],
    forbiddenElements: ["<script>", "javascript:", "eval("]
  },
  
  metadata: {
    requiredFields: ["content", "tokenUsage"],
    optionalFields: ["model", "finishReason", "processingTime"]
  }
};