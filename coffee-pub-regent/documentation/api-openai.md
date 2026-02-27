# API: OpenAI Integration

**Audience:** Developers integrating with Blacksmith and leveraging the exposed API.

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
| `getOpenAIReplyAsHtmlWithMemory` | Async Function | Get AI response with session memory | `(query, sessionId, projectId?)` |
| `callGptApiText` | Async Function | Call OpenAI text completion API | `(query, customHistory, projectId?)` |
| `callGptApiTextWithMemory` | Async Function | Call OpenAI API with session memory | `(query, sessionId, projectId?)` |
| `callGptApiImage` | Async Function | Call OpenAI image generation API | `(query)` |
| `getSessionHistory` | Function | Get session conversation history | `(sessionId)` |
| `clearSessionHistory` | Function | Clear specific session history | `(sessionId)` |
| `clearAllSessionHistories` | Function | Clear all session histories | `()` |
| `getMemoryStats` | Function | Get memory usage statistics | `()` |
| `getStorageSize` | Function | Get storage size information | `()` |
| `cleanupOldSessions` | Function | Clean up old sessions by age/size | `(maxAgeDays?, maxSessions?)` |
| `optimizeStorage` | Function | Compress old messages to save space | `(sessionId?)` |
| `exportSessionHistory` | Function | Export session data for backup | `(sessionId?)` |
| `loadSessionHistories` | Function | Load memories from storage | `()` |
| `saveSessionHistories` | Function | Save memories to storage | `()` |

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
- **Model**: Supported model (e.g., gpt-5, gpt-4o, gpt-4o-mini, gpt-3.5-turbo, o1-preview)
- **Project ID**: Optional OpenAI Project ID for cost tracking and team management
- **Prompt**: System prompt for AI behavior
- **Temperature**: Response creativity (0-2)

## **Supported Models (December 2024)**

| Model | Type | Best For | Cost Efficiency |
|-------|------|----------|-----------------|
| `gpt-5` | Latest flagship | Maximum capability, complex tasks | Premium performance |
| `gpt-4o` | Current flagship | Complex tasks, maximum capability | High performance |
| `gpt-4o-mini` | Cost-effective GPT-4o | Most tasks, budget-conscious | **Recommended default** |
| `gpt-4-turbo` | Legacy GPT-4 | Backward compatibility | Moderate |
| `gpt-3.5-turbo` | Budget option | Simple tasks, high volume | Most cost-effective |
| `o1-preview` | Reasoning model | Complex reasoning, coding | Premium pricing |
| `o1-mini` | Reasoning model mini | Reasoning tasks, budget | Moderate pricing |

### **Model Recommendations**

- **For most users**: `gpt-4o-mini` - Best balance of capability and cost
- **For maximum capability**: `gpt-5` - Latest and most advanced model
- **For high performance**: `gpt-4o` - Current flagship with proven reliability
- **For budget-conscious**: `gpt-3.5-turbo` - Still very capable for most tasks
- **For complex reasoning**: `o1-preview` or `o1-mini` - When you need advanced reasoning

## **OpenAI Projects Support**

The API supports OpenAI Projects for better cost tracking and team management:

### **Benefits of OpenAI Projects**

- **Cost Tracking**: Separate billing and usage tracking per project
- **Team Management**: Share projects with team members
- **Usage Analytics**: Detailed usage reports and insights
- **Rate Limits**: Project-specific rate limiting
- **Security**: Isolated API keys and access controls

### **Using Projects**

```javascript
// Check if projects are enabled
const isEnabled = openai.isProjectEnabled();
console.log(`Projects enabled: ${isEnabled}`);

// Get current project ID
const projectId = openai.getProjectId();
console.log(`Current project: ${projectId}`);

// Use with specific project (overrides setting)
const response = await openai.getOpenAIReplyAsHtmlWithMemory(
    "Create a character", 
    "user123", 
    "proj_abc123"
);

// Use with default project (from settings)
const response2 = await openai.getOpenAIReplyAsHtmlWithMemory(
    "Create a character", 
    "user123"
);
```

### **Project Configuration**

1. **Create Project**: Go to https://platform.openai.com/projects
2. **Get Project ID**: Copy the project ID (starts with `proj_`)
3. **Configure Setting**: Enter the project ID in module settings
4. **Optional Override**: Pass project ID directly in API calls

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

## **Memory and Context Features**

### **Session-Based Memory**

The API now supports persistent conversation memory through session IDs:

```javascript
// Create a conversation with memory
const response1 = await openai.getOpenAIReplyAsHtmlWithMemory("My character is a wizard named Gandalf", "user123");
const response2 = await openai.getOpenAIReplyAsHtmlWithMemory("What spells should I prepare?", "user123");
// The AI will remember Gandalf is a wizard from the previous message
```

### **Memory Management**

```javascript
// Get conversation history for a session
const history = openai.getSessionHistory("user123");

// Clear specific session memory
openai.clearSessionHistory("user123");

// Clear all session memories
openai.clearAllSessionHistories();
```

### **Memory Benefits**

- **Persistent Context**: AI remembers previous conversations within a session
- **Character Continuity**: Perfect for ongoing character development
- **Campaign Memory**: Remember NPCs, locations, and plot points
- **Session Isolation**: Each user/session has separate memory
- **Survives Page Refresh**: Memories are saved to browser storage and persist between sessions

### **Persistent Storage**

Memories are automatically saved to browser localStorage and survive:
- Page refreshes
- Browser restarts
- FoundryVTT restarts

```javascript
// Check memory statistics
const stats = openai.getMemoryStats();
console.log(`Total sessions: ${stats.totalSessions}`);
console.log(`Total messages: ${stats.totalMessages}`);

// Export memories for backup
const backup = openai.exportSessionHistory();
// Save this data somewhere safe!

// Export specific session
const sessionBackup = openai.exportSessionHistory("user123");
```

### **Size Management**

As memories grow, you can monitor and manage storage:

```javascript
// Check storage size
const size = openai.getStorageSize();
console.log(`Storage: ${size.sizeInMB}MB (${size.estimatedTokens} tokens)`);
console.log(`Near limit: ${size.isNearLimit}`);

// Clean up old sessions (older than 30 days, max 50 sessions)
const cleaned = openai.cleanupOldSessions(30, 50);
console.log(`Cleaned up ${cleaned} old sessions`);

// Optimize storage by compressing old messages
const optimized = openai.optimizeStorage();
console.log(`Optimized ${optimized} sessions`);
```

### **Size Limits & Recommendations**

| Limit | Value | Impact |
|-------|-------|--------|
| **localStorage** | ~5-10MB | Browser storage limit |
| **GPT-4o Context** | ~128k tokens | API context window |
| **GPT-3.5 Context** | ~16k tokens | API context window |
| **Recommended Sessions** | 50-100 | Balance of history vs performance |
| **Recommended Messages** | 20-50 per session | Context length setting |

### **Automatic Protections**

- ✅ **Context Trimming**: Only recent messages sent to API
- ✅ **Configurable Limits**: Set your preferred context length
- ✅ **Session Isolation**: Each session is independent
- ✅ **Auto-Save**: Efficient storage management

## **Integration Notes**

- The API automatically handles message history and context management
- Session memory is maintained per unique session ID
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
