#!/usr/bin/env python3
"""Generate fixed-size subsets of corpus.jsonl by streaming.

The corpus is very large, so it is read line by line and written out
without ever loading the whole file into memory.

Example:
    python generate_datasets.py 10000
        -> data/wiki_10000_documents.jsonl
    python generate_datasets.py 10000 50000 250000
        -> one file per requested size

Prompt:
  create a python script generating different sizes of @corpus.jsonl into the data folder, the size can be chosen as a
  parameter of the script. use streaming because the corpus is very large. the name should be
  wiki_10000_documents.jsonl for example.
"""

import argparse
import json
import sys
from pathlib import Path

CORPUS = Path(__file__).parent / "corpus.jsonl"
DATA_DIR = Path(__file__).parent / "data"


def generate(size: int) -> Path:
    out_path = DATA_DIR / f"wiki_{size}_documents.jsonl"
    written = 0
    with CORPUS.open("r", encoding="utf-8") as src, \
            out_path.open("w", encoding="utf-8") as dst:
        for line in src:
            if written >= size:
                break
            # Replace the corpus's "_id" with a sequential integer (as a
            # string): the original DBpedia ids like "<dbpedia:Foo>" contain
            # characters Meilisearch forbids in a document identifier (it
            # allows only a-zA-Z0-9-_), and "_id" is a reserved metadata field
            # in Elasticsearch. A running counter is unique, valid in all three
            # engines, and reproducible from the corpus order. "title", "text"
            # and "metadata" are passed through unchanged.
            doc = json.loads(line)
            out = {
                "id": str(written + 1),
                "title": doc["title"],
                "text": doc["text"],
                "metadata": doc["metadata"],
            }
            dst.write(json.dumps(out, ensure_ascii=False) + "\n")
            written += 1

    if written < size:
        print(
            f"Warning: corpus only had {written} documents "
            f"(requested {size}).",
            file=sys.stderr,
        )
    print(f"Wrote {written} documents to {out_path}")
    return out_path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "sizes",
        type=int,
        nargs="+",
        help="Number of documents per generated dataset.",
    )
    args = parser.parse_args()

    if not CORPUS.exists():
        sys.exit(f"Corpus not found: {CORPUS}")

    DATA_DIR.mkdir(exist_ok=True)
    for size in args.sizes:
        generate(size)


if __name__ == "__main__":
    main()
