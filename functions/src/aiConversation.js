const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const Anthropic = require("@anthropic-ai/sdk");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const functions = require("firebase-functions");

const SYSTEM_PROMPT = `You are a creative assistant helping brainstorm image generation prompts for wall art. Help the user explore ideas, refine concepts, and craft detailed prompts suitable for AI image generation. Be concise and focus on visual descriptions.`;

exports.handleAiConversation = onDocumentCreated(
  {
    document: "ideationCollections/{collectionId}/conversations/{messageId}",
    secrets: ["ANTHROPIC_API_KEY", "GEMINI_API_KEY"],
    timeoutSeconds: 120,
    memory: "512MiB",
  },
  async (event) => {
    const { collectionId, messageId } = event.params;
    const snap = event.data;
    if (!snap) {
      functions.logger.log("No data associated with the event", { messageId });
      return;
    }
    const newMessage = snap.data();

    // Only trigger for messages from the 'user'
    if (newMessage.role !== "user") {
      functions.logger.log("Not a user message, skipping.", { messageId });
      return null;
    }

    const conversationRef = admin.firestore().collection(`ideationCollections/${collectionId}/conversations`);
    const model = newMessage.modelUsed || "claude-sonnet-5";
    let aiResponse = "";

    try {
      // Fetch the last 10 messages to provide context
      const messagesSnapshot = await conversationRef.orderBy("timestamp", "desc").limit(10).get();
      const history = messagesSnapshot.docs.map(doc => { const { role, content } = doc.data(); return { role, content }; }).reverse().slice(0, -1);
      // Initialize SDKs inside the function
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

      if (model.startsWith("claude")) {
        // Use Anthropic (Claude)
        const response = await anthropic.messages.create({
          model: model,
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          messages: [...history, { role: "user", content: newMessage.content }]
        });
        aiResponse = response.content.find((b) => b.type === "text")?.text;
      } else if (model.startsWith("gemini")) {
        // Use Google (Gemini)
        const geminiModel = genAI.getGenerativeModel({
          model: model,
          systemInstruction: SYSTEM_PROMPT,
        });
        // Gemini's `generateContent` takes the history in the `startChat` method.
        const chat = geminiModel.startChat({
          history: history.map(({ role, content }) => ({ role: role === 'assistant' ? 'model' : 'user', parts: [{ text: content }] })),
        });
        const result = await chat.sendMessage(newMessage.content);
        const response = result.response;
        aiResponse = response.text();
      } else {
        throw new Error(`Unsupported model: ${model}`);
      }

      // Save the AI's response to Firestore
      const assistantMessage = {
        role: "assistant",
        content: aiResponse,
        modelUsed: model,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      };

      await conversationRef.add(assistantMessage);
      functions.logger.log("Successfully processed and responded to message.", { collectionId, messageId });

    } catch (error) {
      functions.logger.error("Error calling AI model or saving response:", error, { collectionId, messageId });
      await conversationRef.add({
        role: "assistant",
        content: `Sorry, I encountered an error: ${error.message}`,
        modelUsed: "system-error",
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    return null;
  }
);