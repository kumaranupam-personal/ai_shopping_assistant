"""`python -m app` starts the API server on PORT with auto-reload (docs/01-architecture.md)."""

import uvicorn

from app.config import Settings

if __name__ == "__main__":
    uvicorn.run("app.main:app", port=Settings().port, reload=True)
