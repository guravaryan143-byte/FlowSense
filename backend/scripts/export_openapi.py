"""Write the API contract to docs/openapi.json (the frontend generates its TypeScript types from it).

    python scripts/export_openapi.py      then, in frontend/:  npm run gen:api
"""
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))  # make `app` importable when run as a script

from app.main import create_app  # noqa: E402

target = pathlib.Path(__file__).resolve().parents[2] / "docs" / "openapi.json"
target.write_text(json.dumps(create_app().openapi(), indent=1))
print(f"Wrote {target} ({len(json.loads(target.read_text())['paths'])} paths)")
