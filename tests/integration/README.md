# CentralGauge Integration Tests

This directory contains integration tests that validate real-world functionality of CentralGauge's LLM provider adapters.

## Overview

The integration tests focus on validating that our LLM adapters correctly handle real API response formats from various providers. This ensures compatibility and robustness when working with actual LLM services.

## Test Files

### `provider-real-responses.test.ts`
Comprehensive integration tests that validate all LLM provider adapters against real API response formats.

**Coverage:**
- **OpenAI**: Response parsing, error handling, token usage calculation
- **Anthropic**: Message format, content blocks, safety handling
- **Google Gemini**: Candidate processing, safety ratings, usage metadata
- **Azure OpenAI**: Deployment handling, content filtering, Azure-specific features
- **Local/Ollama**: Streaming responses, performance metrics, model selection
- **Mock Adapter**: Consistent behavior, AL code generation

**Test Fixtures (`../fixtures/provider-responses.ts`):**
- Real API response samples from each provider
- Error response formats for comprehensive error handling
- Edge cases and special scenarios (streaming, safety blocks, etc.)

## Key Features Tested

### Response Format Validation
✅ Proper parsing of each provider's unique response structure  
✅ Token usage extraction and calculation  
✅ Error response handling with appropriate error messages  
✅ Content extraction from various response formats  

### Error Handling
✅ Network timeouts and connection failures  
✅ API authentication errors  
✅ Rate limiting and quota exceeded scenarios  
✅ Malformed JSON and unexpected response formats  
✅ Provider-specific errors (deployment not found, content filtering, etc.)  

### Content Validation
✅ AL code structure validation  
✅ Security checks for malicious content  
✅ Unicode and special character handling  
✅ Large response processing  

### Cross-Provider Consistency
✅ Unified interface across all providers  
✅ Consistent token usage reporting  
✅ Standardized error handling  
✅ Common performance metrics  

## Running the Tests

```bash
# Run all integration tests
deno test --allow-all tests/integration/

# Run with coverage
deno test --allow-all tests/integration/ --coverage=coverage

# Run without type checking (for faster execution)
deno test --allow-all tests/integration/ --no-check
```

## Test Results

All integration tests pass successfully, validating:
- ✅ 30 test cases across 6 providers
- ✅ Real API response format compatibility
- ✅ Comprehensive error handling
- ✅ Performance and timing validation
- ✅ Content extraction and validation

## Benefits

1. **Reliability**: Ensures our adapters work with real API responses
2. **Compatibility**: Validates against actual provider response formats
3. **Error Recovery**: Tests comprehensive error scenarios
4. **Future-Proofing**: Catches breaking changes in provider APIs
5. **Quality Assurance**: Validates AL code generation across all providers

## Maintenance

These tests should be updated when:
- Provider APIs change their response formats
- New providers are added to CentralGauge
- New features are added to existing adapters
- Error handling scenarios are expanded

The test fixtures in `../fixtures/provider-responses.ts` contain real API response samples that may need updating if providers modify their response structures.