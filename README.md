# RAG Voice Assistant

A voice-first AI assistant that speaks Albanian, built on Retrieval-Augmented
Generation (RAG) over an internal company Knowledge Base, with guardrails
against hallucination and a minimal admin panel for document management.

## Overview

The user asks a question by voice (in Albanian). The system transcribes the
question, searches the Knowledge Base for relevant information, generates an
answer grounded only in that retrieved content, and speaks the answer back.
Conversations support natural follow-up questions. If a question falls
outside the Knowledge Base, the assistant explicitly says so instead of
answering from general knowledge.

## Key Features

- Voice-first: the primary input and output are spoken Albanian
- RAG: answers are generated only from indexed documents
- Guardrails: explicit refusal for out-of-scope questions, not just a prompt
  instruction — backed by retrieval/relevance checks
- Citations: answers are shown with their source documents in the UI
- Conversation memory: understands follow-up questions within a session
- Admin panel: add/remove documents, automatic chunking and indexing

## Tech Stack

- **Frontend:** React, Vite, TypeScript
- **Backend:** Python, FastAPI
- **Speech-to-Text, LLM & Embeddings:** OpenAI API
- **Text-to-Speech:** ElevenLabs API
- **Vector store:** ChromaDB
- **Metadata store:** SQLite

## Status

Actively in development.

## Setup

_To be filled in once the backend/frontend skeletons land (env variables,
install and run commands)._

## Architecture

_To be filled in with the full request flow diagram: audio → STT →
retrieval → LLM → TTS → audio, as well as the admin document ingestion
flow._

## Known Limitations

_To be filled in during development._

## Future Improvements

_To be filled in at the end of the project._
