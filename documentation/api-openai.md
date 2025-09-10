# API: OpenAI Integration

This document describes the OpenAI integration API provided by Coffee Pub Blacksmith for AI-powered functionality.

## **Accessing the OpenAI API**

```javascript
// Get the Blacksmith module API
const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;

// Access the OpenAI API
const openai = blacksmith.openai;
```

## **Available Functions**

| Function | Type | Description | Parameters |
|----------|------|-------------|------------|
| `getOpenAIReplyAsHtml` | Async Function | Get AI response as HTML formatted | `(query)` |
| `callGptApiText` | Async Function | Call OpenAI text completion API | `(query)` |
| `callGptApiImage` | Async Function | Call OpenAI image generation API | `(query)` |

## **Function Details**

### **getOpenAIReplyAsHtml(query)**

Get an AI response formatted as HTML. This is the main function for AI interactions.

**Parameters:**
- `query` (string) - The question or prompt to send to the AI

**Returns:**
- `Promise<Object>` - Response object with formatted content

**Example:**
```javascript
const response = await openai.getOpenAIReplyAsHtml("Create a fantasy tavern description");
console.log(response.content); // HTML formatted response
```

### **callGptApiText(query)**

Direct access to OpenAI's text completion API with full response data.

**Parameters:**
- `query` (string) - The query to send to OpenAI

**Returns:**
- `Promise<Object>` - Full OpenAI response object including usage and cost data

**Example:**
```javascript
const response = await openai.callGptApiText("Explain the rules of D&D");
console.log(response.usage); // Token usage information
console.log(response.cost); // Estimated cost
```

### **callGptApiImage(query)**

Generate images using OpenAI's DALL-E API.

**Parameters:**
- `query` (string) - The image description prompt

**Returns:**
- `Promise<string>` - URL of the generated image

**Example:**
```javascript
const imageUrl = await openai.callGptApiImage("A medieval blacksmith's forge");
// Use imageUrl in your application
```

## **Configuration Requirements**

The OpenAI API requires proper configuration in the module settings:

- **API Key**: Valid OpenAI API key
- **Model**: Supported model (e.g., gpt-4, gpt-3.5-turbo)
- **Prompt**: System prompt for AI behavior
- **Temperature**: Response creativity (0-2)

## **Error Handling**

The API includes comprehensive error handling:

- **Invalid API Key**: Returns descriptive error message
- **Rate Limiting**: Automatic retry with exponential backoff
- **Invalid Parameters**: Validation with helpful error messages
- **Network Issues**: Timeout handling and retry logic

## **Usage Examples**

### **Basic AI Query**
```javascript
const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;

// Simple question
const response = await blacksmith.openai.getOpenAIReplyAsHtml("What is a good adventure hook?");
console.log(response.content);
```

### **Advanced Usage with Full Response**
```javascript
const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;

// Get full response with usage data
const response = await blacksmith.openai.callGptApiText("Create a dungeon room");
console.log(`Tokens used: ${response.usage.total_tokens}`);
console.log(`Cost: $${response.cost}`);
console.log(`Content: ${response.content}`);
```

### **Image Generation**
```javascript
const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;

// Generate an image
const imageUrl = await blacksmith.openai.callGptApiImage("A dragon's lair with treasure");
// Use the image URL in your application
```

## **Integration Notes**

- The API automatically handles message history and context management
- Responses are optimized for FoundryVTT integration
- JSON responses are automatically cleaned and validated
- HTML formatting is applied for better display in FoundryVTT

## **Troubleshooting**

### **Common Issues**

1. **"Invalid API key"** - Check your OpenAI API key in module settings
2. **"Invalid prompt"** - Ensure the system prompt is properly configured
3. **"Rate limit exceeded"** - The API will automatically retry; wait a moment
4. **"Request timed out"** - Try breaking your query into smaller parts

### **Debug Information**

Enable debug logging in the module settings to see detailed request/response information for troubleshooting.
