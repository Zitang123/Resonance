#!/usr/bin/env python3
"""Reproduce browser journeys against the production server on localhost:4173.
Uses Playwright CLI, with a separate browser session and isolated test contexts.
Requires Python 3, Node/npm, Google Chrome and the Playwright CLI browser setup.
"""
import argparse
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[1]
os.chdir(root)
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--cli', help='Optional path to a playwright-cli wrapper')
parser.add_argument('suites', nargs='*', choices=['journey', 'resilience', 'motion', 'mobile', 'integrity', 'karina'])
args = parser.parse_args()
command = [args.cli] if args.cli else ['npx', '--yes', '--package', '@playwright/cli', 'playwright-cli']
session = f'-s=resonance-qa-{os.getpid()}'
output = root / 'output/playwright'
output.mkdir(parents=True, exist_ok=True)

def run(*arguments):
    result = subprocess.run([*command, session, *arguments], text=True, capture_output=True)
    if result.returncode or '### Error' in result.stdout:
        raise RuntimeError(result.stdout + result.stderr)
    return result.stdout + result.stderr

try:
    run('open', 'http://localhost:4173/')
    for suite in args.suites or ['journey', 'resilience', 'motion', 'mobile', 'integrity', 'karina']:
        source = (root / f'scripts/browser-{suite}.js').read_text().strip().rstrip(';')
        result = run('run-code', source)
        (output / f'{suite}.log').write_text(result)
        print(f'PASS {suite}', flush=True)
        print(result.split('### Ran Playwright code')[0].strip(), flush=True)
finally:
    subprocess.run([*command, session, 'close'], capture_output=True)
