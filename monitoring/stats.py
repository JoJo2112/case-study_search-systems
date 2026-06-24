#!/usr/bin/env python3
"""Report avg/max CPU and RAM per container on a remote Docker host, measured
for exactly the runtime of a wrapped command.

    ./stats.py --host ssh://root@<docker-host> -- \
        docker compose -f testing/k6/docker-compose.yml run --rm typesense-ingest

Sampling streams `docker stats` over a single SSH connection (~1 sample/s)
"""
import argparse
import re
import subprocess
import threading
from collections import defaultdict

STATS_FORMAT = "{{.Name}};{{.CPUPerc}};{{.MemUsage}}"
# Streamed `docker stats` uses ANSI escapes (cursor/clear) -> strip before parsing.
ANSI = re.compile(r"\x1b\[[0-9;?]*[ -/]*[@-~]")
# Memory units -> MiB; longer units first, otherwise "B" already matches "MiB".
_MIB = [("GIB", 1024.0), ("MIB", 1.0), ("KIB", 1 / 1024), ("B", 1 / 1024**2)]


def mem_to_mib(value):
    value = value.strip()
    for unit, factor in _MIB:
        if value.upper().endswith(unit):
            return float(value[: -len(unit)]) * factor
    raise ValueError(f"Unknown memory unit: {value!r}")


def monitor(proc, cpu, ram):
    """Read the docker-stats stream line by line (runs in a thread)."""
    for raw in proc.stdout:
        line = ANSI.sub("", raw).strip()
        if ";" not in line:
            continue
        try:
            name, c, mem = line.split(";")
            cpu[name].append(float(c.rstrip("%")))
            ram[name].append(mem_to_mib(mem.split("/")[0]))  # MemUsage = "used / limit"
        except ValueError:
            continue  # e.g. CPU "--%" right after container start


def main():
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--host", required=True, help="Docker host, e.g. ssh://root@<docker-host>")
    parser.add_argument("command", nargs=argparse.REMAINDER, help="-- <command> whose runtime is measured")
    args = parser.parse_args()

    command = args.command[1:] if args.command[:1] == ["--"] else args.command
    if not command:
        parser.error("missing command after '--'")

    cpu, ram = defaultdict(list), defaultdict(list)
    proc = subprocess.Popen(
        ["docker", "-H", args.host, "stats", "--format", STATS_FORMAT],
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
    sampler = threading.Thread(target=monitor, args=(proc, cpu, ram))
    sampler.start()

    print(f"Measuring containers on {args.host} while: {' '.join(command)}")
    rc = subprocess.run(command).returncode
    print(f"Command finished (exit {rc}).")

    proc.terminate()   # unblocks the blocking readline in the thread
    sampler.join()
    proc.wait()

    print()
    if not cpu:
        print(f"No samples collected. Check the connection:  docker -H {args.host} ps")
        return
    for name in sorted(cpu):
        c, r = cpu[name], ram[name]
        print(f"{name:<15} cpu avg {sum(c) / len(c):5.1f}%  max {max(c):5.1f}%   "
              f"ram avg {sum(r) / len(r):8.1f} MiB  max {max(r):8.1f} MiB  (n={len(c)})")


if __name__ == "__main__":
    main()
