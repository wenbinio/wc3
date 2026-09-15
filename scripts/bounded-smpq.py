#!/usr/bin/env python3
"""Linux/macOS smpq child with per-file, CPU and address-space ceilings.
No shell; inherited environment; stdout remains captured by the Node caller.
Not a complete filesystem or syscall sandbox; caller supplies a fresh workspace.
"""
import os
import resource
import sys

if len(sys.argv) < 4:
    raise SystemExit("usage: bounded-smpq.py <file-limit> <cpu-seconds> <smpq-args...>")
size, cpu = int(sys.argv[1]), int(sys.argv[2])
if size < 1 or cpu < 1:
    raise SystemExit("invalid resource limits")
resource.setrlimit(resource.RLIMIT_FSIZE, (size, size))
resource.setrlimit(resource.RLIMIT_CPU, (cpu, cpu + 1))
resource.setrlimit(resource.RLIMIT_AS, (1024 ** 3, 1024 ** 3))
resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
os.execvp("smpq", ["smpq", *sys.argv[3:]])
