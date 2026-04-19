"""
VLM Evaluation

Usage:
    python evaluate_vlms.py --models qwen2.5vl:7b llava:7b moondream --image data/FOD_pictures/bolt_in_front_of_plane.png
"""

import argparse
import sys
from pathlib import Path

# Add backend to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from PIL import Image
from models.ollama_vlm import get_model


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--models", nargs="+", required=True)
    parser.add_argument("--image", type=str, required=True)
    parser.add_argument("--output", type=str, default="my_results.txt")
    args = parser.parse_args()

    image_path = Path(args.image)
    output_path = Path(__file__).parent / args.output

    results = []

    for model_name in args.models:
        print(f"Model: {model_name}")

        model = get_model(model_name)
        image = Image.open(image_path).convert("RGB")
        result = model.detect_fod(image)

        output = (
            f"Model: {model_name}\n"
            f"Inference Time: {result.inference_time_ms:.0f}ms\n"
            f"{result.raw_response}\n"
        )
        results.append(output)

    with open(output_path, "w", encoding="utf-8") as f:
        f.write("VLM Evaluation Results\n")
        for result in results:
            f.write(result)
            f.write("\n")

    print(f"\nResults saved to: {output_path}")

if __name__ == "__main__":
    main()