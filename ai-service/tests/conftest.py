"""Test bootstrap: set the env the app requires before it is imported."""
import os

os.environ.setdefault("AI_INTERNAL_KEY", "test-internal-key")
os.environ.setdefault("ALLOWED_ORIGINS", "http://localhost:5173")
