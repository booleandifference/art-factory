# Workflow: Prompt Builder 2.0

This document outlines the architecture and data model for the integrated, conversational prompt ideation workflow.

## Objective

To bring the initial creative brainstorming process directly into the Gamer Art Factory application, creating a seamless "ideation-to-creation" pipeline. This eliminates the need for external chat applications and creates a persistent, reviewable history of the creative process for each art collection.

## User Flow

1.  **Create Collection**: The user starts by creating a new "Ideation Collection" (e.g., "Like a Butterfly"). This acts as a project folder.
2.  **Conversational Prompting**: Inside the collection, the user engages in a chat interface with a selected LLM (Claude or Gemini models).
3.  **Persistent History**: The entire conversation is saved and associated with the collection.
4.  **Generate Image**: From the conversation, the user can select or refine a prompt and send it to the image generation engine (e.g., Nano Banana 2).
5.  **Track Iterations**: Generated images and subsequent edits ("image dite function") are linked back to the collection and the specific prompt conversation that created them.

## Firestore Data Model

We will introduce two new root collections, following the `camelCase` convention from `PROJECT_CONTEXT.md`.

### 1. `ideationCollections`

This is the top-level container for a new art idea.

```javascript
// Firestore path: /ideationCollections/{collectionId}
{
  name: "Like a Butterfly", // User-defined name for the collection
  createdAt: Timestamp,
  userId: "...",            // For future multi-user support
  status: "draft"           // 'draft', 'active', 'archived'
}
```

### 2. `promptConversations`

This is a sub-collection within each `ideationCollection` document, storing the chat history.

```javascript
// Firestore path: /ideationCollections/{collectionId}/conversations/{messageId}
{
  role: "user", // or "assistant"
  content: "Give me 5 creative prompts about a gamer who feels like a butterfly.",
  modelUsed: "claude-3.5-sonnet", // The model that received/generated this message
  timestamp: Timestamp
}
```

This structure ensures that each creative session is self-contained, with its full conversational history readily available.