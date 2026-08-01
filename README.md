# RAG Voice Assistant

Asistent zanor (voice AI) në gjuhën shqipe, i bazuar në Retrieval-Augmented
Generation (RAG) mbi një bazë njohurish (Knowledge Base) interne të
kompanisë, me guardrails kundër hallucination dhe një panel admin për
menaxhimin e dokumenteve.

## Përmbledhje

Përdoruesi pyet me zë (shqip), sistemi transkripton pyetjen, kërkon në
Knowledge Base për informacion relevant, gjeneron një përgjigje të bazuar
vetëm në atë informacion, dhe e lexon përgjigjen me zë. Bisedat mund të
vazhdojnë me pyetje follow-up. Nëse pyetja nuk lidhet me Knowledge Base,
sistemi e thotë hapur këtë — nuk përgjigjet nga njohuri të përgjithshme.

## Karakteristika kryesore

- Voice-first: pyetje dhe përgjigje me zë, në shqip
- RAG: përgjigjet gjenerohen vetëm nga dokumentet e indeksuara
- Guardrails: refuzim eksplicit për pyetje jashtë Knowledge Base
- Citations: përgjigjet shoqërohen me dokumentet burimore
- Conversation memory: kupton pyetje follow-up brenda sesionit
- Admin panel: shtim/heqje dokumentesh, indeksim automatik

## Stack

- **Frontend:** React, Vite, TypeScript
- **Backend:** Python, FastAPI
- **Speech-to-Text & LLM & Embeddings:** OpenAI API
- **Text-to-Speech:** ElevenLabs API
- **Vector store:** ChromaDB
- **Metadata store:** SQLite

## Status

Projekt në zhvillim aktiv.

## Setup

_Do të plotësohet me hyrjen e backend/frontend skeleton (variabla mjedisi,
komandat e instalimit dhe të nisjes)._

## Arkitektura

_Do të plotësohet me diagramën e flow-it të plotë: audio → STT → retrieval
→ LLM → TTS → audio, si dhe flow-in e ingestion-it të dokumenteve nga admin._

## Kufizime të njohura

_Do të plotësohet gjatë zhvillimit._

## Përmirësime të ardhshme

_Do të plotësohet në fund të projektit._
