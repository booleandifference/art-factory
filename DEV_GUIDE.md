# Developer Guide for AI-Assisted Coding

This guide explains how to best leverage AI code assistants like Gemini Code Assist within the "Gamer Art Factory" project.

## The Source of Truth: `private/PROJECT_CONTEXT.md`

Gemini can see *how* your code is written by indexing it, but it doesn't know *why* you made certain choices. The `private/PROJECT_CONTEXT.md` file (gitignored) is our "Source of Truth" that contains the project's core business logic, technical stack, and coding standards.

A detailed set of instructions ensures that when you ask an AI to "Write a new Cloud Function," it doesn't just write generic code—it writes code that fits The Hoodie Gamer business model.

## How to use this with Gemini Code Assist

Once that file exists, you can simply start a chat in VS Code by referencing the file:

> "Referencing `@PROJECT_CONTEXT.md`, help me draft the logic for the TikTok 'Drip-Feed' scheduler."

This saves you tokens and mental energy because the AI won't suggest "generic" gaming tags or "cheap" looking layouts—it will stay within your architectural guardrails.