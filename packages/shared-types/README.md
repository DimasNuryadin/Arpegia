# @arpegia/shared-types

Shared TypeScript type definitions (`index.ts`, `src/*`) and Python Pydantic v2 reference models (`schemas.py`) for Arpegia Phase 1 & Phase 2.

## Physical Contract Files
- **`index.ts` / `src/index.ts`**: Canonical TypeScript interfaces consumed by `apps/web`.
- **`schemas.py`**: Canonical Python Pydantic v2 schemas referenced by `apps/api` and `services/audio-engine`.

## Key Phase 1 & Phase 2 Contracts
- **Core Analysis**: `AnalysisResponse`, `SongMetadata` (`AnalysisMetadata`), `ChordData` (`ChordItem`), `ImprovisationData` (`ImprovisationItem`)
- **Chord Diagrams**: `ChordDiagram`
- **Guitar Tablature**: `TablatureData`, `TabMeasure`, `TabNote`, `TabNoteEdit`, `TablatureUpdateRequest`, `TabTechnique`, `TabDifficulty`
- **Error Envelope**: `ErrorEnvelope`, `ErrorDetail`
