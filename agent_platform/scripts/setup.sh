#!/usr/bin/env sh
set -eu

PROJECT_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
VENV_PATH="$PROJECT_ROOT/.venv"

python3 -m venv "$VENV_PATH"
"$VENV_PATH/bin/python" -m pip install --upgrade pip
"$VENV_PATH/bin/python" -m pip install --editable "$PROJECT_ROOT"
"$VENV_PATH/bin/python" -m unittest discover -s "$PROJECT_ROOT/tests" -v

echo "Setup complete. Activate with: . $VENV_PATH/bin/activate"
