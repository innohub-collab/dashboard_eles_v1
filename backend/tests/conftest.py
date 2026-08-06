"""Workspace-local pytest paths for the managed Windows runner."""

from __future__ import annotations

from pathlib import Path
import shutil
from uuid import uuid4

import pytest


@pytest.fixture
def tmp_path():
    """Avoid the runner's global temp directory with its inaccessible ACL."""

    root = Path.cwd() / ".backend-test-tmp"
    root.mkdir(exist_ok=True)
    directory = root / f"case-{uuid4().hex}"
    directory.mkdir()
    try:
        yield directory
    finally:
        shutil.rmtree(directory, ignore_errors=True)
        try:
            root.rmdir()
        except OSError:
            # A parallel worker may still own a sibling case directory.
            pass
