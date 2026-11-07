# Arpegia Audio Engine Service

The Audio Engine is responsible for digital signal processing (DSP), Music Information Retrieval (MIR), polyphonic pitch transcription, chord recognition, and AI-driven guitar arrangement orchestration (via LangGraph).

## Module Architecture

- **`chord_detection/`**: Harmonic feature extraction, chromagram analysis, and chord progression classification.
- **`audio_transcription/`**: Polyphonic note onset, duration, and pitch tracking.
- **AI Orchestration**: LangGraph state workflows for harmonic reharmonization and fingerstyle guitar voicing generation.

## Dependencies

- **Librosa / SoundFile**: Core DSP, beat tracking, tempo, and chromagram calculations.
- **LangGraph / LangChain**: Graph-based multi-step reasoning for musical arrangement and theory validation.
- **Celery / Redis**: Async worker infrastructure for long-running audio processing jobs.

## Quick Start (Local Development)

```bash
# 1. Create and activate a virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# 2. Install dependencies
pip install -r requirements.txt
```
