"""Command Line Interface for Arpegia Audio Engine."""

import sys
import os
import argparse
import json
import warnings

# Suppress librosa / audioread deprecation and size warnings
warnings.filterwarnings("ignore")

# Ensure services/audio-engine is in sys.path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

from engine.orchestrator import run_pipeline


def parse_args():
    parser = argparse.ArgumentParser(
        description="Arpegia Audio Engine Phase 1 MVP - Audio DSP & Chord Intelligence",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "audio_path",
        type=str,
        help="Path to target audio file (MP3/WAV)",
    )
    parser.add_argument(
        "--styles",
        type=str,
        default="Neo Soul",
        help="Comma-separated styles for improvisation (e.g. 'Neo Soul,Jazz,Pop,Fingerstyle')",
    )
    parser.add_argument(
        "--output",
        "-o",
        type=str,
        default=None,
        help="Optional path to write JSON output to a file",
    )
    parser.add_argument(
        "--indent",
        type=int,
        default=2,
        help="JSON indentation level for stdout",
    )
    return parser.parse_args()


def main():
    args = parse_args()

    if not os.path.isfile(args.audio_path):
        print(f"Error: Audio file '{args.audio_path}' not found.", file=sys.stderr)
        sys.exit(1)

    styles = [s.strip() for s in args.styles.split(",") if s.strip()]

    try:
        result = run_pipeline(args.audio_path, styles=styles)
        json_output = json.dumps(result, indent=args.indent)

        # Print cleanly to stdout
        print(json_output)

        # Write to file if requested
        if args.output:
            with open(args.output, "w", encoding="utf-8") as f:
                f.write(json_output)

    except Exception as e:
        print(f"Execution Error: {str(e)}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
